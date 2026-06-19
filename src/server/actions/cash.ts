"use server";

// Cash session + transaction Server Actions for the employee POS.
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, runMutation, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { withIdempotency } from "@/lib/api/idempotency";
import { assertRateLimit, RATE_LIMITS } from "@/lib/api/ratelimit";
import {
  CashSessionCloseSchema,
  CashSessionOpenSchema,
  CashSessionSchema,
  TransactionCreateSchema,
  TransactionListParamsSchema,
  TransactionSchema,
  type CashSession,
  type Transaction,
} from "@/lib/schemas/cash";
import { UuidSchema } from "@/lib/schemas/common";

function mapSession(row: Record<string, unknown>): CashSession {
  return CashSessionSchema.parse({
    id: row.id,
    clubId: row.club_id,
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    openingFloatCents: row.opening_float_cents,
    closedBy: row.closed_by ?? null,
    closedAt: row.closed_at ?? null,
    closingCountedCents: row.closing_counted_cents ?? null,
    expectedCents: row.expected_cents ?? null,
    varianceCents: row.variance_cents ?? null,
    notes: row.notes ?? null,
    status: row.status,
  });
}

function mapTx(row: Record<string, unknown>): Transaction {
  return TransactionSchema.parse({
    id: row.id,
    clubId: row.club_id,
    cashSessionId: row.cash_session_id ?? null,
    kind: row.kind,
    refId: row.ref_id ?? null,
    customerUserId: row.customer_user_id ?? null,
    customerName: row.customer_name ?? null,
    amountCents: row.amount_cents,
    currency: row.currency,
    method: row.method,
    status: row.status,
    provider: row.provider ?? null,
    providerPaymentId: row.provider_payment_id ?? null,
    receiptUrl: row.receipt_url ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  });
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function requireClubStaff(clubId: string): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId &&
        (r.role === "owner" || r.role === "manager" || r.role === "employee")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
  return userId;
}

// ── listCashSessions ───────────────────────────────────────────────────
const ListSessionsSchema = z.object({
  clubId: UuidSchema,
  status: z.enum(["open", "closed", "reconciled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listCashSessions(input: unknown): Promise<ActionResult<CashSession[]>> {
  return runAction(ListSessionsSchema, input, async ({ clubId, status, limit }) => {
    await requireClubStaff(clubId);
    const supabase = await getServerClient();
    let q = supabase
      .from("cash_sessions")
      .select("*")
      .eq("club_id", clubId)
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new MpError("CASH.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapSession);
  });
}

// ── openCashSession ────────────────────────────────────────────────────
export async function openCashSession(input: unknown): Promise<ActionResult<CashSession>> {
  return runMutation(CashSessionOpenSchema, input, async (data) => {
    const userId = await requireClubStaff(data.clubId);
    const supabase = await getServerClient();

    // Reject if there's already an open session for this club.
    const { data: existing } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("club_id", data.clubId)
      .eq("status", "open")
      .maybeSingle();
    if (existing) {
      throw new MpError(
        "CASH.SESSION_ALREADY_OPEN",
        "There is already an open cash session for this club",
        409,
      );
    }

    const { data: row, error } = await supabase
      .from("cash_sessions")
      .insert({
        club_id: data.clubId,
        opened_by: userId,
        opening_float_cents: data.openingFloatCents,
        status: "open",
      } as never)
      .select()
      .single();
    if (error) throw new MpError("CASH.OPEN_FAILED", error.message, 500);
    return mapSession(row);
  });
}

// ── closeCashSession ───────────────────────────────────────────────────
const CloseInputSchema = z.object({
  id: UuidSchema,
  body: CashSessionCloseSchema,
});

export async function closeCashSession(input: unknown): Promise<ActionResult<CashSession>> {
  return runMutation(CloseInputSchema, input, async ({ id, body }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: current } = await supabase
      .from("cash_sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (!current) throw new MpError("CASH.SESSION_NOT_FOUND", "Session not found", 404);
    await requireClubStaff(current.club_id);
    if (current.status !== "open") {
      throw new MpError(
        "CASH.SESSION_NOT_OPEN",
        `Cannot close a session in '${current.status}'`,
        409,
      );
    }

    // Expected cash on hand = opening_float + sum(cash captured) - sum(cash refunded).
    const { data: cashRows } = await supabase
      .from("transactions")
      .select("amount_cents")
      .eq("cash_session_id", id)
      .eq("method", "cash");
    const sumCash = (cashRows ?? []).reduce(
      (a, r) => a + (r.amount_cents as number),
      0,
    );
    const expected = (current.opening_float_cents as number) + sumCash;
    const variance = body.closingCountedCents - expected;

    const { data, error } = await supabase
      .from("cash_sessions")
      .update({
        status: "closed",
        closed_by: userId,
        closed_at: new Date().toISOString(),
        closing_counted_cents: body.closingCountedCents,
        expected_cents: expected,
        variance_cents: variance,
        notes: body.notes ?? null,
      } as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("CASH.CLOSE_FAILED", error.message, 500);
    return mapSession(data);
  });
}

// ── listTransactions ───────────────────────────────────────────────────
export async function listTransactions(input: unknown): Promise<ActionResult<Transaction[]>> {
  return runAction(TransactionListParamsSchema, input, async (params) => {
    await requireClubStaff(params.clubId);
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let q = supabase
      .from("transactions")
      .select("*")
      .eq("club_id", params.clubId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (params.sessionId) q = q.eq("cash_session_id", params.sessionId);
    if (params.kind) q = q.eq("kind", params.kind);
    if (params.method) q = q.eq("method", params.method);
    if (params.from) q = q.gte("created_at", params.from);
    if (params.to) q = q.lte("created_at", params.to);

    const { data, error } = await q;
    if (error) throw new MpError("CASH.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapTx);
  });
}

// ── createTransaction ──────────────────────────────────────────────────
export async function createTransaction(input: unknown): Promise<ActionResult<Transaction>> {
  return runMutation(TransactionCreateSchema, input, async (data) => {
    const userId = await requireClubStaff(data.clubId);
    await assertRateLimit({ key: `cash:tx:${userId}`, ...RATE_LIMITS.mutationsAuthn });
    const idemKey = (await headers()).get("idempotency-key") ?? undefined;

    return withIdempotency(
      { key: idemKey, scope: "createTransaction", userId, input: data },
      async () => {
        const supabase = await getServerClient();

        // Attach to the club's currently open cash session (if any).
        const { data: session } = await supabase
          .from("cash_sessions")
          .select("id")
          .eq("club_id", data.clubId)
          .eq("status", "open")
          .maybeSingle();
        if (!session && data.method === "cash") {
          throw new MpError(
            "CASH.SESSION_CLOSED",
            "Open a cash session before recording cash transactions",
            422,
          );
        }

        const { data: tx, error } = await supabase
          .from("transactions")
          .insert({
            club_id: data.clubId,
            cash_session_id: session?.id ?? null,
            kind: data.kind,
            ref_id: data.refId ?? null,
            customer_user_id: data.customerUserId ?? null,
            customer_name: data.customerName ?? null,
            amount_cents: data.amountCents,
            currency: data.currency,
            method: data.method,
            status: "captured",
            created_by: userId,
          } as never)
          .select()
          .single();
        if (error) throw new MpError("CASH.TX_FAILED", error.message, 500);
        return mapTx(tx);
      },
    );
  });
}
