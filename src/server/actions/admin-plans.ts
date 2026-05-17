"use server";

// Acciones admin para gestionar player_subscriptions (planes premium).
// La aprobación se delega a approvePlanSubscriptionAdmin en
// player-subscriptions.ts. Aquí solo agregamos listados y rechazo.

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

const SIGNED_URL_TTL = 60 * 10; // 10 min

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

// ── tipos compartidos ───────────────────────────────────────────────────
export type PendingPlanSubscriptionRow = {
  subscriptionId: string;
  userId: string;
  displayName: string;
  username: string | null;
  tier: string;
  durationMonths: number;
  createdAt: string;
  transactionId: string | null;
  amountCents: number | null;
  currency: string | null;
  transactionStatus: string | null;
  proofUrl: string | null;
  proofSignedUrl: string | null;
  proofSubmittedAt: string | null;
};

export type RecentPlanSubscriptionRow = {
  subscriptionId: string;
  userId: string;
  displayName: string;
  username: string | null;
  tier: string;
  status: string;
  durationMonths: number;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  cancelledReason: string | null;
  transactionId: string | null;
  amountCents: number | null;
  currency: string | null;
  proofUrl: string | null;
  proofSignedUrl: string | null;
};

// ── listPendingPlanSubscriptionsAdmin ───────────────────────────────────
export async function listPendingPlanSubscriptionsAdmin(): Promise<
  ActionResult<PendingPlanSubscriptionRow[]>
> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const supabase = await getServerClient();

    const { data: subs, error } = await supabase
      .from("player_subscriptions")
      .select(
        "id,user_id,tier,status,duration_months,transaction_id,created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new MpError("ADMIN_PLANS.DB_ERROR", error.message, 500);
    const rows = subs ?? [];

    const userIds = Array.from(
      new Set(rows.map((r) => r.user_id as string).filter(Boolean)),
    );
    const txIds = Array.from(
      new Set(
        rows
          .map((r) => r.transaction_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );

    const [{ data: profiles }, { data: txs }] = await Promise.all([
      userIds.length
        ? supabase
            .from("profiles")
            .select("id,display_name,username")
            .in("id", userIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              display_name: string;
              username: string | null;
            }>,
          }),
      txIds.length
        ? supabase
            .from("transactions")
            .select(
              "id,amount_cents,currency,status,proof_url,proof_submitted_at",
            )
            .in("id", txIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              amount_cents: number;
              currency: string | null;
              status: string;
              proof_url: string | null;
              proof_submitted_at: string | null;
            }>,
          }),
    ]);

    const profileMap = new Map<
      string,
      { displayName: string; username: string | null }
    >();
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        displayName: (p.display_name as string) ?? "Sin nombre",
        username: (p.username as string | null) ?? null,
      });
    }
    const txMap = new Map<
      string,
      {
        amountCents: number;
        currency: string | null;
        status: string;
        proofUrl: string | null;
        proofSubmittedAt: string | null;
      }
    >();
    for (const t of txs ?? []) {
      txMap.set(t.id as string, {
        amountCents: (t.amount_cents as number) ?? 0,
        currency: (t.currency as string | null) ?? null,
        status: (t.status as string) ?? "",
        proofUrl: (t.proof_url as string | null) ?? null,
        proofSubmittedAt: (t.proof_submitted_at as string | null) ?? null,
      });
    }

    const result: PendingPlanSubscriptionRow[] = await Promise.all(
      rows.map(async (r) => {
        const userId = r.user_id as string;
        const prof = profileMap.get(userId);
        const txId = (r.transaction_id as string | null) ?? null;
        const tx = txId ? txMap.get(txId) ?? null : null;
        let signed: string | null = null;
        if (tx?.proofUrl) {
          const { data: s } = await supabase.storage
            .from("payment_proofs")
            .createSignedUrl(tx.proofUrl, SIGNED_URL_TTL);
          signed = s?.signedUrl ?? null;
        }
        return {
          subscriptionId: r.id as string,
          userId,
          displayName: prof?.displayName ?? "Sin nombre",
          username: prof?.username ?? null,
          tier: r.tier as string,
          durationMonths: (r.duration_months as number) ?? 1,
          createdAt: r.created_at as string,
          transactionId: txId,
          amountCents: tx?.amountCents ?? null,
          currency: tx?.currency ?? null,
          transactionStatus: tx?.status ?? null,
          proofUrl: tx?.proofUrl ?? null,
          proofSignedUrl: signed,
          proofSubmittedAt: tx?.proofSubmittedAt ?? null,
        };
      }),
    );

    return result;
  });
}

// ── listRecentPlanSubscriptionsAdmin ────────────────────────────────────
const RecentSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
});

export async function listRecentPlanSubscriptionsAdmin(
  input: unknown = {},
): Promise<ActionResult<RecentPlanSubscriptionRow[]>> {
  return runAction(RecentSchema, input, async ({ limit }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();

    const { data: subs, error } = await supabase
      .from("player_subscriptions")
      .select(
        "id,user_id,tier,status,duration_months,starts_at,expires_at,created_at,cancelled_reason,transaction_id",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new MpError("ADMIN_PLANS.DB_ERROR", error.message, 500);
    const rows = subs ?? [];

    const userIds = Array.from(
      new Set(rows.map((r) => r.user_id as string).filter(Boolean)),
    );
    const txIds = Array.from(
      new Set(
        rows
          .map((r) => r.transaction_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );

    const [{ data: profiles }, { data: txs }] = await Promise.all([
      userIds.length
        ? supabase
            .from("profiles")
            .select("id,display_name,username")
            .in("id", userIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              display_name: string;
              username: string | null;
            }>,
          }),
      txIds.length
        ? supabase
            .from("transactions")
            .select("id,amount_cents,currency,proof_url")
            .in("id", txIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              amount_cents: number;
              currency: string | null;
              proof_url: string | null;
            }>,
          }),
    ]);

    const profileMap = new Map<
      string,
      { displayName: string; username: string | null }
    >();
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        displayName: (p.display_name as string) ?? "Sin nombre",
        username: (p.username as string | null) ?? null,
      });
    }
    const txMap = new Map<
      string,
      {
        amountCents: number;
        currency: string | null;
        proofUrl: string | null;
      }
    >();
    for (const t of txs ?? []) {
      txMap.set(t.id as string, {
        amountCents: (t.amount_cents as number) ?? 0,
        currency: (t.currency as string | null) ?? null,
        proofUrl: (t.proof_url as string | null) ?? null,
      });
    }

    const result: RecentPlanSubscriptionRow[] = await Promise.all(
      rows.map(async (r) => {
        const userId = r.user_id as string;
        const prof = profileMap.get(userId);
        const txId = (r.transaction_id as string | null) ?? null;
        const tx = txId ? txMap.get(txId) ?? null : null;
        let signed: string | null = null;
        if (tx?.proofUrl) {
          const { data: s } = await supabase.storage
            .from("payment_proofs")
            .createSignedUrl(tx.proofUrl, SIGNED_URL_TTL);
          signed = s?.signedUrl ?? null;
        }
        return {
          subscriptionId: r.id as string,
          userId,
          displayName: prof?.displayName ?? "Sin nombre",
          username: prof?.username ?? null,
          tier: r.tier as string,
          status: r.status as string,
          durationMonths: (r.duration_months as number) ?? 1,
          startsAt: (r.starts_at as string | null) ?? null,
          expiresAt: (r.expires_at as string | null) ?? null,
          createdAt: r.created_at as string,
          cancelledReason: (r.cancelled_reason as string | null) ?? null,
          transactionId: txId,
          amountCents: tx?.amountCents ?? null,
          currency: tx?.currency ?? null,
          proofUrl: tx?.proofUrl ?? null,
          proofSignedUrl: signed,
        };
      }),
    );

    return result;
  });
}

// ── rejectPlanSubscriptionAdmin ─────────────────────────────────────────
// Solo marca la subscription como 'rejected'. La transaction asociada se
// rechaza por separado desde AdminPagos (rejectPaymentProofAdmin) si aplica.
const RejectSchema = z.object({
  subscriptionId: UuidSchema,
  reason: z.string().min(2).max(500),
});

export async function rejectPlanSubscriptionAdmin(
  input: unknown,
): Promise<ActionResult<{ subscriptionId: string; status: "rejected" }>> {
  return runAction(RejectSchema, input, async ({ subscriptionId, reason }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();

    const { data: sub, error: readErr } = await supabase
      .from("player_subscriptions")
      .select("id,status")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (readErr) {
      throw new MpError("ADMIN_PLANS.DB_ERROR", readErr.message, 500);
    }
    if (!sub) {
      throw new MpError("PLAN.SUB_NOT_FOUND", "Suscripción no encontrada", 404);
    }
    if (sub.status !== "pending") {
      throw new MpError(
        "PLAN.INVALID_STATE",
        `Solo se rechaza desde 'pending' (actual: '${sub.status}')`,
        409,
      );
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("player_subscriptions")
      .update({
        status: "rejected",
        cancelled_reason: reason,
        updated_at: nowIso,
      } as never)
      .eq("id", subscriptionId);
    if (updErr) {
      throw new MpError("PLAN.SUB_UPDATE_FAILED", updErr.message, 500);
    }

    // Audit log (no fatal si la function no existe en el entorno).
    const { error: auditErr } = await supabase.rpc("fn_admin_audit_log", {
      p_entity: "player_subscriptions",
      p_entity_id: subscriptionId,
      p_action: "plan_subscription.admin_reject",
      p_diff: { reason } as never,
    });
    if (auditErr) {
      console.error("[rejectPlanSubscriptionAdmin] audit log:", auditErr.message);
    }

    return { subscriptionId, status: "rejected" as const };
  });
}
