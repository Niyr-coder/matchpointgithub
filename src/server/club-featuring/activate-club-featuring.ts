import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Json } from "@/lib/db/types";
import { MpError } from "@/lib/api/errors";
import { notifyClubStaff } from "@/lib/notifications/helpers";

type AdminClient = SupabaseClient<Database>;

export type ClubFeaturingActivateResult = {
  subscriptionId: string;
  clubId: string;
  startsAt: string;
  expiresAt: string;
};

/**
 * Activa una club_featuring_subscription pendiente usando un AdminClient ya
 * disponible. Sin auth guard — el caller es responsable de validar el rol.
 * Llamado por approveClubFeaturingAdmin (flujo admin) y capture-cascade
 * (flujo webhook/pago automático).
 */
export async function activateClubFeaturingInternal(
  admin: AdminClient,
  subscriptionId: string,
): Promise<ClubFeaturingActivateResult> {
  const { data: sub, error: readErr } = await admin
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

  const { data: club, error: clubReadErr } = await admin
    .from("clubs")
    .select("featured_until,name")
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
  const currentExpiry = club.featured_until ? new Date(club.featured_until as string) : null;
  const startsAt = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(startsAt);
  newExpiry.setUTCDate(newExpiry.getUTCDate() + durationDays);

  const { error: subUpdErr } = await admin
    .from("club_featuring_subscriptions")
    .update({
      status: "active",
      starts_at: startsAt.toISOString(),
      expires_at: newExpiry.toISOString(),
      updated_at: now.toISOString(),
    } as never)
    .eq("id", subscriptionId);
  if (subUpdErr) {
    throw new MpError("CLUB_FEATURING.SUB_UPDATE_FAILED", subUpdErr.message, 500);
  }

  const { error: clubUpdErr } = await admin
    .from("clubs")
    .update({ featured_until: newExpiry.toISOString() } as never)
    .eq("id", clubId);
  if (clubUpdErr) {
    throw new MpError("CLUB_FEATURING.CLUB_UPDATE_FAILED", clubUpdErr.message, 500);
  }

  const { error: auditErr } = await admin.rpc("fn_admin_audit_log", {
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
      "[activateClubFeaturingInternal] audit_log_failed:",
      auditErr.message,
    );
  }

  notifyClubStaff({
    clubId,
    kind: "club_featuring_activated",
    title: "Featuring activado",
    body: `Tu club ${(club.name as string | null) ?? ""} ya aparece destacado hasta ${newExpiry.toLocaleDateString("es-EC")}.`,
    payload: {
      clubId,
      club_name: club.name,
      subscriptionId,
      expires_at: newExpiry.toISOString(),
    },
    roles: ["owner"],
  }).catch((err) => console.error("[activateClubFeaturingInternal] notifyClubStaff failed:", err));

  return {
    subscriptionId,
    clubId,
    startsAt: startsAt.toISOString(),
    expiresAt: newExpiry.toISOString(),
  };
}
