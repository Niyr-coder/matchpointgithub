"use server";

// Acciones de "featuring" pagado de clubes (slot destacado en listings).
// Reusa el flujo de comprobantes del Agente F: el pedido crea una
// transactions en pending_proof + club_featuring_subscriptions en pending.
// Cuando el admin aprueba el comprobante (approvePaymentProofAdmin),
// la subscription pasa a active y clubs.featured_until se extiende.
//
// Estructuralmente es un espejo de player-subscriptions.ts (Agente J).

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type { Json } from "@/lib/db/types";
import { notifyClubStaff } from "@/lib/notifications/helpers";

// Precio base: USD 200 por 30 días. Para duraciones distintas se prorratea
// linealmente: amountCents = round(PRICE * durationDays / 30).
// Nota: en archivos "use server" solo se pueden exportar funciones async,
// por eso la constante queda privada. Si otra parte de la app la necesita,
// mover a src/lib/pricing.ts (no-server) y re-importar aquí.
const CLUB_FEATURING_PRICE_CENTS_PER_30_DAYS = 20000;

function computeAmountCents(durationDays: number): number {
  return Math.round(
    CLUB_FEATURING_PRICE_CENTS_PER_30_DAYS * (durationDays / 30),
  );
}

// ── helpers de auth ────────────────────────────────────────────────────
async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}



// ── requestClubFeaturing ───────────────────────────────────────────────
const RequestSchema = z.object({
  clubId: UuidSchema,
  durationDays: z.number().int().min(1).max(365).default(30),
});

export type ClubFeaturingRequestResult = {
  subscriptionId: string;
  transactionId: string;
  amountCents: number;
};

export async function requestClubFeaturing(
  input: unknown,
): Promise<ActionResult<ClubFeaturingRequestResult>> {
  return runAction(RequestSchema, input, async ({ clubId, durationDays }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    // Validar que el club exista (RLS de clubs deja ver activos a todos;
    // si el club está suspendido/archived el owner igual puede leerlo vía
    // mp_club_staff). Si la consulta no retorna nada, asumimos que el
    // user no tiene visibilidad o el club no existe.
    const { data: club, error: clubErr } = await supabase
      .from("clubs")
      .select("id")
      .eq("id", clubId)
      .maybeSingle();
    if (clubErr) {
      throw new MpError("CLUB_FEATURING.DB_ERROR", clubErr.message, 500);
    }
    if (!club) {
      throw new MpError("CLUB_FEATURING.CLUB_NOT_FOUND", "Club no encontrado", 404);
    }

    // Rechazar si ya hay otra featuring pending para este club.
    const { data: existingPending } = await supabase
      .from("club_featuring_subscriptions")
      .select("id")
      .eq("club_id", clubId)
      .eq("status", "pending")
      .maybeSingle();
    if (existingPending) {
      throw new MpError(
        "CLUB_FEATURING.PENDING_EXISTS",
        "Ya existe una solicitud de featuring pendiente para este club",
        409,
      );
    }

    const amountCents = computeAmountCents(durationDays);

    // 1. Crear transaction pending_proof (kind 'club_featuring').
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        club_id: clubId,
        kind: "club_featuring",
        ref_id: clubId,
        customer_user_id: userId,
        amount_cents: amountCents,
        currency: "USD",
        method: "transfer",
        status: "pending_proof",
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (txErr || !tx) {
      throw new MpError(
        "CLUB_FEATURING.TX_CREATE_FAILED",
        txErr?.message ?? "No se pudo crear la transacción",
        500,
      );
    }
    const transactionId = tx.id as string;

    // 2. Crear subscription pending vinculada a la transaction.
    const { data: sub, error: subErr } = await supabase
      .from("club_featuring_subscriptions")
      .insert({
        club_id: clubId,
        requested_by: userId,
        status: "pending",
        duration_days: durationDays,
        transaction_id: transactionId,
      } as never)
      .select("id")
      .single();
    if (subErr || !sub) {
      throw new MpError(
        "CLUB_FEATURING.SUB_CREATE_FAILED",
        subErr?.message ?? "No se pudo crear la suscripción de featuring",
        500,
      );
    }

    return {
      subscriptionId: sub.id as string,
      transactionId,
      amountCents,
    };
  });
}

// ── approveClubFeaturingAdmin ──────────────────────────────────────────
// Admin aprueba el featuring: activa la subscription y extiende
// clubs.featured_until. La transaction ya debe estar en captured
// (approvePaymentProofAdmin la deja así antes de llamar esto).
const ApproveSchema = z.object({
  subscriptionId: UuidSchema,
});

export type ClubFeaturingApproveResult = {
  subscriptionId: string;
  clubId: string;
  startsAt: string;
  expiresAt: string;
};

export async function approveClubFeaturingAdmin(
  input: unknown,
): Promise<ActionResult<ClubFeaturingApproveResult>> {
  return runAction(ApproveSchema, input, async ({ subscriptionId }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();

    const { data: sub, error: readErr } = await supabase
      .from("club_featuring_subscriptions")
      .select("id,club_id,status,duration_days,transaction_id")
      .eq("id", subscriptionId)
      .single();
    if (readErr || !sub) {
      throw new MpError(
        "CLUB_FEATURING.SUB_NOT_FOUND",
        "Suscripción de featuring no encontrada",
        404,
      );
    }
    if (sub.status !== "pending") {
      throw new MpError(
        "CLUB_FEATURING.INVALID_STATE",
        `Solo se aprueba desde 'pending' (actual: '${sub.status}')`,
        409,
      );
    }

    const clubId = sub.club_id as string;
    const durationDays = sub.duration_days as number;

    // Si clubs.featured_until está en el futuro, extendemos desde ahí;
    // si no, arranca desde ahora.
    const { data: club, error: clubReadErr } = await supabase
      .from("clubs")
      .select("featured_until")
      .eq("id", clubId)
      .single();
    if (clubReadErr || !club) {
      throw new MpError(
        "CLUB_FEATURING.CLUB_NOT_FOUND",
        "Club no encontrado al aprobar featuring",
        404,
      );
    }

    const now = new Date();
    const currentExpiry = club.featured_until
      ? new Date(club.featured_until as string)
      : null;
    const startsAt = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startsAt);
    newExpiry.setUTCDate(newExpiry.getUTCDate() + durationDays);

    // 1. Activar subscription.
    const { error: subUpdErr } = await supabase
      .from("club_featuring_subscriptions")
      .update({
        status: "active",
        starts_at: startsAt.toISOString(),
        expires_at: newExpiry.toISOString(),
        updated_at: now.toISOString(),
      } as never)
      .eq("id", subscriptionId);
    if (subUpdErr) {
      throw new MpError(
        "CLUB_FEATURING.SUB_UPDATE_FAILED",
        subUpdErr.message,
        500,
      );
    }

    // 2. Extender clubs.featured_until.
    const { error: clubUpdErr } = await supabase
      .from("clubs")
      .update({ featured_until: newExpiry.toISOString() } as never)
      .eq("id", clubId);
    if (clubUpdErr) {
      throw new MpError(
        "CLUB_FEATURING.CLUB_UPDATE_FAILED",
        clubUpdErr.message,
        500,
      );
    }

    const { error: auditErr } = await supabase.rpc("fn_admin_audit_log", {
      p_entity: "club_featuring_subscriptions",
      p_entity_id: subscriptionId,
      p_action: "club_featuring.admin_approve",
      p_diff: {
        clubId,
        durationDays,
        expiresAt: newExpiry.toISOString(),
      } as Json,
    });
    if (auditErr) {
      console.error(
        "[approveClubFeaturingAdmin] [ok=false] audit_log_failed (action=club_featuring.admin_approve):",
        auditErr.message,
      );
    }

    const { data: clubRow } = await supabase.from("clubs").select("name").eq("id", clubId).maybeSingle();
    await notifyClubStaff({
      clubId,
      kind: "club_featuring_activated",
      title: "Featuring activado",
      body: `Tu club ${(clubRow?.name as string | null) ?? ""} ya aparece destacado hasta ${newExpiry.toLocaleDateString("es-EC")}.`,
      payload: {
        clubId,
        club_name: clubRow?.name,
        subscriptionId,
        expires_at: newExpiry.toISOString(),
      },
      roles: ["owner"],
    });

    return {
      subscriptionId,
      clubId,
      startsAt: startsAt.toISOString(),
      expiresAt: newExpiry.toISOString(),
    };
  });
}

// ── getClubFeaturingStatus ─────────────────────────────────────────────
// Estado vigente para el panel del owner del club.
const StatusSchema = z.object({ clubId: UuidSchema });

export type ClubFeaturingStatus = {
  status: "active" | "inactive";
  featuredUntil: string | null;
  hasPendingRequest: boolean;
};

export async function getClubFeaturingStatus(
  input: unknown,
): Promise<ActionResult<ClubFeaturingStatus>> {
  return runAction(StatusSchema, input, async ({ clubId }) => {
    await requireUserId();
    const supabase = await getServerClient();

    const { data: club, error: clubErr } = await supabase
      .from("clubs")
      .select("featured_until")
      .eq("id", clubId)
      .maybeSingle();
    if (clubErr) {
      throw new MpError("CLUB_FEATURING.DB_ERROR", clubErr.message, 500);
    }
    if (!club) {
      throw new MpError("CLUB_FEATURING.CLUB_NOT_FOUND", "Club no encontrado", 404);
    }

    const featuredUntil = (club.featured_until as string | null) ?? null;
    const active =
      featuredUntil != null && new Date(featuredUntil) > new Date();

    const { data: pending } = await supabase
      .from("club_featuring_subscriptions")
      .select("id")
      .eq("club_id", clubId)
      .eq("status", "pending")
      .maybeSingle();

    return {
      status: active ? "active" : "inactive",
      featuredUntil,
      hasPendingRequest: !!pending,
    };
  });
}

// ── listMyClubsFeaturingHistory ────────────────────────────────────────
// Historial de subscriptions (cualquier estado) para un club.
const HistorySchema = z.object({
  clubId: UuidSchema,
  limit: z.number().int().min(1).max(100).default(20),
});

export type ClubFeaturingHistoryRow = {
  id: string;
  status: string;
  durationDays: number;
  startsAt: string | null;
  expiresAt: string | null;
  transactionId: string | null;
  createdAt: string;
};

export async function listMyClubsFeaturingHistory(
  input: unknown,
): Promise<ActionResult<ClubFeaturingHistoryRow[]>> {
  return runAction(HistorySchema, input, async ({ clubId, limit }) => {
    await requireUserId();
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from("club_featuring_subscriptions")
      .select("id,status,duration_days,starts_at,expires_at,transaction_id,created_at")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new MpError("CLUB_FEATURING.DB_ERROR", error.message, 500);

    return (data ?? []).map((r) => ({
      id: r.id as string,
      status: r.status as string,
      durationDays: r.duration_days as number,
      startsAt: (r.starts_at as string | null) ?? null,
      expiresAt: (r.expires_at as string | null) ?? null,
      transactionId: (r.transaction_id as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  });
}
