"use server";

// Payouts: aggregate captured transactions per club into payout rows.
// MATCHPOINT no usa PSP: payout = cobros capturados del periodo - comisión.
// Esta acción solo prepara filas de seguimiento; la transferencia real a
// clubes/partners se hace manualmente fuera de la app.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { getTakeRatePct } from "@/server/queries/platform-config";
import { notify } from "@/server/notifications/dispatch";
import { notifyClubStaff, notifyPartnerOrgStaff } from "@/lib/notifications/helpers";

async function requireAdmin(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Debes iniciar sesión");
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

async function requireClubStaff(clubId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Debes iniciar sesión");
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere staff del club");
  return user.id;
}

// ── listPayouts ────────────────────────────────────────────────────────
const ListSchema = z.object({
  clubId: UuidSchema.optional(),
  status: z
    .enum(["pending", "approved", "processing", "paid", "failed", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listPayouts(input: unknown): Promise<ActionResult<unknown[]>> {
  return runAction(ListSchema, input, async (params) => {
    const supabase = await getServerClient();
    let q = supabase
      .from("payouts")
      .select("*")
      .order("period_end", { ascending: false })
      .limit(params.limit);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.status) q = q.eq("status", params.status);
    const { data, error } = await q;
    if (error) throw new MpError("PAYOUTS.DB_ERROR", error.message, 500);
    return data ?? [];
  });
}

// ── processPendingPayouts ──────────────────────────────────────────────
// Acción admin. Crea una fila de payout por club activo sumando transacciones
// capturadas en el rango, menos comisión. No transfiere dinero: deja cada fila
// en `processing` para que soporte marque la transferencia manual cuando ocurra.
const ProcessSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
});

export async function processPendingPayouts(
  input: unknown,
): Promise<ActionResult<{ created: number; totalNetCents: number }>> {
  return runAction(ProcessSchema, input, async ({ periodStart, periodEnd }) => {
    const adminId = await requireAdmin();
    const supabase = await getServerClient();
    const commissionPct = (await getTakeRatePct()) / 100;

    const { data: clubs } = await supabase
      .from("clubs")
      .select("id,currency")
      .eq("status", "active");

    let created = 0;
    let totalNetCents = 0;
    for (const c of clubs ?? []) {
      const clubId = c.id as string;
      const currency = (c.currency as string) ?? "USD";

      // Skip if a payout already exists for this period.
      const { data: existing } = await supabase
        .from("payouts")
        .select("id")
        .eq("club_id", clubId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .maybeSingle();
      if (existing) continue;

      const { data: txs } = await supabase
        .from("transactions")
        .select("amount_cents")
        .eq("club_id", clubId)
        .eq("status", "captured")
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd);

      const grossCents = (txs ?? []).reduce(
        (sum, t) => sum + ((t.amount_cents as number) ?? 0),
        0,
      );
      if (grossCents <= 0) continue;

      const commissionCents = Math.round(grossCents * commissionPct);
      const netCents = grossCents - commissionCents;

      const { error: insErr } = await supabase.from("payouts").insert({
        scope: "club",
        club_id: clubId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_cents: grossCents,
        commission_cents: commissionCents,
        net_cents: netCents,
        currency,
        status: "processing",
        created_by: adminId,
        scheduled_for: new Date().toISOString(),
      } as never);
      if (!insErr) {
        created += 1;
        totalNetCents += netCents;
      }
    }
    return { created, totalNetCents };
  });
}

// ── markPayoutPaid (admin) ─────────────────────────────────────────────
export async function markPayoutPaid(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({ id: UuidSchema, providerPayoutId: z.string().optional() }),
    input,
    async ({ id, providerPayoutId }) => {
      await requireAdmin();
      const supabase = await getServerClient();
      const { data: payout, error: getErr } = await supabase
        .from("payouts")
        .select("id,club_id,partner_id,net_cents,currency,period_start,period_end,status")
        .eq("id", id)
        .maybeSingle();
      if (getErr || !payout) throw new MpError("PAYOUTS.NOT_FOUND", "Payout not found", 404);
      const { error } = await supabase
        .from("payouts")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          provider_payout_id: providerPayoutId ?? null,
        } as never)
        .eq("id", id);
      if (error) throw new MpError("PAYOUTS.UPDATE_FAILED", error.message, 500);

      const amountLabel = `${((payout.net_cents as number) / 100).toFixed(2)} ${(payout.currency as string) ?? "USD"}`;
      const periodLabel = `${payout.period_start as string} → ${payout.period_end as string}`;
      const payload = {
        payout_id: id,
        amount_cents: payout.net_cents,
        currency: payout.currency,
        amount_label: amountLabel,
        period_label: periodLabel,
      };
      const clubId = payout.club_id as string | null;
      const partnerId = payout.partner_id as string | null;
      if (clubId) {
        await notifyClubStaff({
          clubId,
          kind: "payout_paid",
          title: "Pago de MATCHPOINT registrado",
          body: `${amountLabel} · ${periodLabel}`,
          payload,
          roles: ["owner"],
        });
      } else if (partnerId) {
        await notifyPartnerOrgStaff({
          partnerId,
          kind: "payout_paid",
          title: "Pago de MATCHPOINT registrado",
          body: `${amountLabel} · ${periodLabel}`,
          payload,
        });
      }

      return { ok: true as const };
    },
  );
}

// ── processRefund (employee/staff) ─────────────────────────────────────
const RefundSchema = z.object({
  transactionId: UuidSchema,
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export async function processRefund(
  input: unknown,
): Promise<ActionResult<{ ok: true; refundId: string }>> {
  return runAction(RefundSchema, input, async ({ transactionId, amountCents, reason }) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Debes iniciar sesión");

    const { data: tx } = await supabase
      .from("transactions")
      .select("club_id,amount_cents,status")
      .eq("id", transactionId)
      .single();
    if (!tx) throw new MpError("REFUNDS.TX_NOT_FOUND", "Transacción no encontrada", 404);
    await requireClubStaff(tx.club_id as string);
    if (tx.status !== "captured") {
      throw new MpError(
        "REFUNDS.NOT_CAPTURED",
        `No se puede reembolsar una transacción en estado '${tx.status}'`,
        409,
      );
    }
    if (amountCents > (tx.amount_cents as number)) {
      throw new MpError("REFUNDS.AMOUNT_EXCEEDS", "El reembolso excede el monto de la transacción", 422);
    }

    const { data: refund, error } = await supabase
      .from("refunds")
      .insert({
        transaction_id: transactionId,
        amount_cents: amountCents,
        reason,
        created_by: user.id,
      } as never)
      .select("id")
      .single();
    if (error) throw new MpError("REFUNDS.CREATE_FAILED", error.message, 500);

    // Marca la transacción como reembolsada solo si el reembolso cubre el total.
    if (amountCents === (tx.amount_cents as number)) {
      await supabase
        .from("transactions")
        .update({ status: "refunded" } as never)
        .eq("id", transactionId);
    }

    return { ok: true as const, refundId: refund.id as string };
  });
}
