"use server";

// Team achievements: grant/revoke admin-only + list helper.
// Toda mutación via service-role con setAuditActor (audit con actor=admin).
// Solo admin gobierna esto por ahora (no hay path UX para self-grant);
// cuando exista Arena/leagues, podría auto-disparar desde un trigger SECURITY DEFINER.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  TeamAchievementGrantSchema,
  TeamAchievementSchema,
  type TeamAchievement,
} from "@/lib/schemas/social";
import { UuidSchema } from "@/lib/schemas/common";

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

function mapAchievement(row: Record<string, unknown>): TeamAchievement {
  return TeamAchievementSchema.parse({
    id: row.id,
    teamId: row.team_id,
    kind: row.kind,
    title: row.title,
    subtitle: (row.subtitle as string | null) ?? null,
    awardedAt: row.awarded_at,
    awardedBy: (row.awarded_by as string | null) ?? null,
  });
}

// ── grantTeamAchievement (admin only) ──────────────────────────────────
export async function grantTeamAchievement(
  input: unknown,
): Promise<ActionResult<TeamAchievement>> {
  return runAction(TeamAchievementGrantSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // Sanity: el team debe existir (FK lo aseguraría, pero queremos error code claro).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: team } = await (admin as any)
      .from("teams")
      .select("id,name,captain_id")
      .eq("id", data.teamId)
      .maybeSingle();
    if (!team) throw new MpError("TEAMS.NOT_FOUND", "Team no encontrado", 404);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (admin as any)
      .from("team_achievements")
      .insert({
        team_id: data.teamId,
        kind: data.kind,
        title: data.title,
        subtitle: data.subtitle ?? null,
        awarded_at: data.awardedAt ?? new Date().toISOString(),
        awarded_by: adminId,
      })
      .select("*")
      .single();
    if (error || !inserted) {
      throw new MpError(
        "TEAMS.ACHIEVEMENT_GRANT_FAILED",
        error?.message ?? "No se pudo otorgar el logro",
        500,
      );
    }

    // Notif al captain. Best-effort — no rompe el grant si falla.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from("notification_jobs").insert({
        user_id: team.captain_id,
        role: "user",
        kind: "team_achievement_awarded",
        channel: "inapp",
        payload: {
          team_name: team.name,
          achievement_title: data.title,
          team_id: data.teamId,
        },
        status: "pending",
      });
    } catch (e) {
      console.error("[grantTeamAchievement] notif enqueue failed", e);
    }

    return mapAchievement(inserted as Record<string, unknown>);
  });
}

// ── revokeTeamAchievement (admin only) ─────────────────────────────────
export async function revokeTeamAchievement(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({ achievementId: UuidSchema }),
    input,
    async ({ achievementId }) => {
      const adminId = await requireAdminUserId();
      const admin = getAdminClient();
      await setAuditActor(admin, adminId, "admin");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any)
        .from("team_achievements")
        .delete()
        .eq("id", achievementId);
      if (error) {
        throw new MpError(
          "TEAMS.ACHIEVEMENT_REVOKE_FAILED",
          error.message,
          500,
        );
      }
      return { ok: true as const };
    },
  );
}

// ── listTeamAchievements (server helper, NOT exported as a server action) ─
// Devuelve los achievements de un team ordenados por awarded_at desc.
// Usado desde TeamScreen.tsx (server component) y desde AdminUserTeamDetail
// cuando exista. RLS permite SELECT a cualquier authenticated.
export async function getTeamAchievementsServer(
  teamId: string,
  limit = 10,
): Promise<TeamAchievement[]> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("team_achievements")
    .select("id,team_id,kind,title,subtitle,awarded_at,awarded_by")
    .eq("team_id", teamId)
    .order("awarded_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[getTeamAchievementsServer]", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapAchievement(r as Record<string, unknown>));
}
