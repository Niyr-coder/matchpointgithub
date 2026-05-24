"use server";

// Acciones admin para gestionar club_featuring_subscriptions
// (promociones pagadas de clubes en listings).
//
// La aprobación se delega a approveClubFeaturingAdmin en
// club-featuring.ts (Agente U). En este worktree todavía no existe ese
// archivo ni la migration 055 con la tabla club_featuring_subscriptions,
// por lo que estas actions:
//   - Devuelven listas vacías si la tabla no está aún en la DB (consulta
//     defensiva: si la tabla no existe, Supabase retorna error → se mapea
//     a [] para que el panel no se rompa).
//   - rejectClubFeaturingAdmin asume la columna y existencia de la tabla
//     una vez aplicada la migration; antes de eso falla con FEATURING.UNAVAILABLE.
//
// TODO (cuando Agente U aplique la migration 055 y suba club-featuring.ts):
//   - Quitar el manejo defensivo en los listados.
//   - El componente cliente importa approveClubFeaturingAdmin desde
//     "@/server/actions/club-featuring" directamente.

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type { Json } from "@/lib/db/types";

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
export type PendingClubFeaturingRow = {
  subscriptionId: string;
  clubId: string;
  clubName: string;
  clubSlug: string | null;
  clubCity: string | null;
  durationDays: number;
  createdAt: string;
  transactionId: string | null;
  amountCents: number | null;
  currency: string | null;
  transactionStatus: string | null;
  proofUrl: string | null;
  proofSignedUrl: string | null;
  proofSubmittedAt: string | null;
};

export type RecentClubFeaturingRow = {
  subscriptionId: string;
  clubId: string;
  clubName: string;
  clubSlug: string | null;
  clubCity: string | null;
  status: string;
  durationDays: number;
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

type FeaturingSubRaw = {
  id: string;
  club_id: string;
  status: string;
  duration_days: number | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  cancelled_reason: string | null;
  transaction_id: string | null;
};

type ClubRaw = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
};

type TxRaw = {
  id: string;
  amount_cents: number;
  currency: string | null;
  status: string;
  proof_url: string | null;
  proof_submitted_at: string | null;
};

// Lectura defensiva: si la tabla no existe (migration 055 aún no aplicada),
// devolvemos []. Cualquier otro error sí se propaga.
async function safeFetchFeaturingSubs(
  status: "pending" | "any",
  limit: number,
): Promise<FeaturingSubRaw[]> {
  const supabase = await getServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from("club_featuring_subscriptions")
    .select(
      "id,club_id,status,duration_days,starts_at,expires_at,created_at,cancelled_reason,transaction_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status === "pending") q = q.eq("status", "pending");
  const { data, error } = await q;
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (
      msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("schema cache")
    ) {
      return [];
    }
    throw new MpError("ADMIN_CLUB_FEATURING.DB_ERROR", error.message, 500);
  }
  return (data ?? []) as FeaturingSubRaw[];
}

async function loadAuxiliaryMaps(rows: FeaturingSubRaw[]): Promise<{
  clubMap: Map<string, ClubRaw>;
  txMap: Map<string, TxRaw>;
}> {
  const supabase = await getServerClient();
  const clubIds = Array.from(
    new Set(rows.map((r) => r.club_id).filter(Boolean)),
  );
  const txIds = Array.from(
    new Set(
      rows.map((r) => r.transaction_id).filter((v): v is string => !!v),
    ),
  );

  const [clubsRes, txsRes] = await Promise.all([
    clubIds.length
      ? supabase
          .from("clubs")
          .select("id,name,slug,city")
          .in("id", clubIds)
      : Promise.resolve({ data: [] as ClubRaw[] }),
    txIds.length
      ? supabase
          .from("transactions")
          .select(
            "id,amount_cents,currency,status,proof_url,proof_submitted_at",
          )
          .in("id", txIds)
      : Promise.resolve({ data: [] as TxRaw[] }),
  ]);

  const clubMap = new Map<string, ClubRaw>();
  for (const c of (clubsRes.data ?? []) as ClubRaw[]) {
    clubMap.set(c.id, {
      id: c.id,
      name: c.name ?? "Club sin nombre",
      slug: c.slug ?? null,
      city: c.city ?? null,
    });
  }
  const txMap = new Map<string, TxRaw>();
  for (const t of (txsRes.data ?? []) as TxRaw[]) {
    txMap.set(t.id, {
      id: t.id,
      amount_cents: t.amount_cents ?? 0,
      currency: t.currency ?? null,
      status: t.status ?? "",
      proof_url: t.proof_url ?? null,
      proof_submitted_at: t.proof_submitted_at ?? null,
    });
  }
  return { clubMap, txMap };
}

async function signProof(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await getServerClient();
  const { data } = await supabase.storage
    .from("payment_proofs")
    .createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

// ── listPendingClubFeaturingAdmin ───────────────────────────────────────
export async function listPendingClubFeaturingAdmin(): Promise<
  ActionResult<PendingClubFeaturingRow[]>
> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const rows = await safeFetchFeaturingSubs("pending", 100);
    if (rows.length === 0) return [];
    const { clubMap, txMap } = await loadAuxiliaryMaps(rows);

    const result: PendingClubFeaturingRow[] = await Promise.all(
      rows.map(async (r) => {
        const club = clubMap.get(r.club_id);
        const tx = r.transaction_id ? txMap.get(r.transaction_id) ?? null : null;
        const signed = await signProof(tx?.proof_url ?? null);
        return {
          subscriptionId: r.id,
          clubId: r.club_id,
          clubName: club?.name ?? "Club sin nombre",
          clubSlug: club?.slug ?? null,
          clubCity: club?.city ?? null,
          durationDays: r.duration_days ?? 30,
          createdAt: r.created_at,
          transactionId: r.transaction_id,
          amountCents: tx?.amount_cents ?? null,
          currency: tx?.currency ?? null,
          transactionStatus: tx?.status ?? null,
          proofUrl: tx?.proof_url ?? null,
          proofSignedUrl: signed,
          proofSubmittedAt: tx?.proof_submitted_at ?? null,
        };
      }),
    );
    return result;
  });
}

// ── listRecentClubFeaturingAdmin ────────────────────────────────────────
const RecentSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
});

export async function listRecentClubFeaturingAdmin(
  input: unknown = {},
): Promise<ActionResult<RecentClubFeaturingRow[]>> {
  return runAction(RecentSchema, input, async ({ limit }) => {
    await requireAdminUserId();
    const rows = await safeFetchFeaturingSubs("any", limit);
    if (rows.length === 0) return [];
    const { clubMap, txMap } = await loadAuxiliaryMaps(rows);

    const result: RecentClubFeaturingRow[] = await Promise.all(
      rows.map(async (r) => {
        const club = clubMap.get(r.club_id);
        const tx = r.transaction_id ? txMap.get(r.transaction_id) ?? null : null;
        const signed = await signProof(tx?.proof_url ?? null);
        return {
          subscriptionId: r.id,
          clubId: r.club_id,
          clubName: club?.name ?? "Club sin nombre",
          clubSlug: club?.slug ?? null,
          clubCity: club?.city ?? null,
          status: r.status,
          durationDays: r.duration_days ?? 30,
          startsAt: r.starts_at,
          expiresAt: r.expires_at,
          createdAt: r.created_at,
          cancelledReason: r.cancelled_reason,
          transactionId: r.transaction_id,
          amountCents: tx?.amount_cents ?? null,
          currency: tx?.currency ?? null,
          proofUrl: tx?.proof_url ?? null,
          proofSignedUrl: signed,
        };
      }),
    );
    return result;
  });
}

// ── rejectClubFeaturingAdmin ────────────────────────────────────────────
const RejectSchema = z.object({
  subscriptionId: UuidSchema,
  reason: z.string().min(2).max(500),
});

export async function rejectClubFeaturingAdmin(
  input: unknown,
): Promise<ActionResult<{ subscriptionId: string; status: "rejected" }>> {
  return runAction(RejectSchema, input, async ({ subscriptionId, reason }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();

    // pre-migration: rejects will 503; intencional, ver header
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub, error: readErr } = await (supabase as any)
      .from("club_featuring_subscriptions")
      .select("id,status,club_id")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (readErr) {
      const msg = (readErr.message || "").toLowerCase();
      if (msg.includes("does not exist") || msg.includes("relation")) {
        throw new MpError(
          "FEATURING.UNAVAILABLE",
          "El módulo de featuring de clubes aún no está disponible",
          503,
        );
      }
      throw new MpError("ADMIN_CLUB_FEATURING.DB_ERROR", readErr.message, 500);
    }
    if (!sub) {
      throw new MpError(
        "FEATURING.SUB_NOT_FOUND",
        "Suscripción de featuring no encontrada",
        404,
      );
    }
    if (sub.status !== "pending") {
      throw new MpError(
        "FEATURING.INVALID_STATE",
        `Solo se rechaza desde 'pending' (actual: '${sub.status}')`,
        409,
      );
    }

    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabase as any)
      .from("club_featuring_subscriptions")
      .update({
        status: "rejected",
        cancelled_reason: reason,
        updated_at: nowIso,
      })
      .eq("id", subscriptionId);
    if (updErr) {
      throw new MpError("FEATURING.SUB_UPDATE_FAILED", updErr.message, 500);
    }

    const { error: auditErr } = await supabase.rpc("fn_admin_audit_log", {
      p_entity: "club_featuring_subscriptions",
      p_entity_id: subscriptionId,
      p_action: "club_featuring.admin_reject",
      p_diff: { reason } as Json,
    });
    if (auditErr) {
      console.error(
        "[rejectClubFeaturingAdmin] [ok=false] audit_log_failed (action=club_featuring.admin_reject):",
        auditErr.message,
      );
    }

    // Notificar a los owners del club. Fire-and-forget.
    try {
      const clubId = sub.club_id as string | null;
      if (clubId) {
        const { data: club } = await supabase
          .from("clubs")
          .select("name")
          .eq("id", clubId)
          .maybeSingle();
        const clubName = (club?.name as string | null) ?? "tu club";
        const { data: owners } = await supabase
          .from("role_assignments")
          .select("user_id")
          .eq("club_id", clubId)
          .in("role", ["owner", "manager"])
          .is("revoked_at", null);
        const recipientIds = Array.from(
          new Set(
            (owners ?? [])
              .map((o) => o.user_id as string | null)
              .filter((v): v is string => !!v),
          ),
        );
        if (recipientIds.length > 0) {
          const { sendSystemMessage, renderTemplate } = await import(
            "@/lib/messages/system"
          );
          const body = renderTemplate("club_featuring_rejected", {
            clubName,
            reason,
          });
          await Promise.all(
            recipientIds.map((rid) =>
              sendSystemMessage({
                recipientUserId: rid,
                kind: "club_featuring_rejected",
                body,
                payload: { subscriptionId, clubId, reason },
              }),
            ),
          );
        }
      }
    } catch (e) {
      console.error("[rejectClubFeaturingAdmin] notify owners failed", e);
    }

    return { subscriptionId, status: "rejected" as const };
  });
}

// ── countActiveFeaturedClubs (helper para KPI) ──────────────────────────
// Devuelve la cantidad de clubes con featured_until > now() (independiente
// de la tabla club_featuring_subscriptions, lee directo de clubs).
export async function countActiveFeaturedClubsAdmin(): Promise<
  ActionResult<{ count: number }>
> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const nowIso = new Date().toISOString();
    const { count, error } = await supabase
      .from("clubs")
      .select("id", { count: "exact", head: true })
      .gt("featured_until", nowIso);
    if (error) {
      throw new MpError("ADMIN_CLUB_FEATURING.DB_ERROR", error.message, 500);
    }
    return { count: count ?? 0 };
  });
}
