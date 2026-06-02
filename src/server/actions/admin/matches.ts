"use server";

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { notify } from "@/server/notifications/dispatch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

export type AdminMatchRow = {
  id: string;
  sport: string;
  mode: string;
  status: string;
  playedAt: string;
  isRanked: boolean;
  teamALabel: string;
  teamBLabel: string;
  disputedReason: string | null;
  scoreLabel: string;
};

export type AdminMatchSeekRow = {
  id: string;
  authorName: string;
  status: string;
  sport: string;
  mode: string;
  city: string | null;
  windowStart: string;
  applicantsCount: number;
  matchId: string | null;
  expiresAt: string;
};

export type AdminNoShowRow = {
  id: string;
  matchId: string;
  reportedByName: string;
  noShowName: string;
  createdAt: string;
};

export type AdminReliabilityRow = {
  userId: string;
  name: string;
  noShows: number;
  cancellations: number;
};

export type AdminMatchesData = {
  matches: AdminMatchRow[];
  seeks: AdminMatchSeekRow[];
  noShows: AdminNoShowRow[];
  reliability: AdminReliabilityRow[];
};

type RawMatch = {
  id: string;
  sport: string;
  mode: string;
  status: string;
  played_at: string;
  team_a_player_ids: string[] | null;
  team_b_player_ids: string[] | null;
  score: unknown;
  disputed_reason: string | null;
  is_ranked: boolean | null;
};

type RawSeek = {
  id: string;
  created_by: string;
  status: string;
  sport: string;
  mode: string;
  city: string | null;
  window_start: string;
  match_id: string | null;
  expires_at: string;
};

type RawNoShow = {
  id: string;
  match_id: string;
  reported_by: string;
  no_show_user_id: string;
  created_at: string;
};

type RawReliability = {
  user_id: string;
  no_shows: number | null;
  cancellations: number | null;
};

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

function scoreLabel(score: unknown): string {
  if (!score || typeof score !== "object") return "Sin score";
  const sets = (score as { sets?: Array<{ a?: number; b?: number }> }).sets;
  if (!Array.isArray(sets) || sets.length === 0) return "Score registrado";
  return sets.map((s) => `${s.a ?? "?"}-${s.b ?? "?"}`).join(", ");
}

function nameFor(map: Map<string, string>, id: string | null | undefined): string {
  if (!id) return "—";
  return map.get(id) ?? id.slice(0, 8);
}

function teamLabel(ids: string[], names: Map<string, string>): string {
  return ids.map((id) => nameFor(names, id)).join(" / ") || "—";
}

export async function listAdminMatchesData(): Promise<ActionResult<AdminMatchesData>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient() as unknown as LooseClient;

    const [{ data: matches }, { data: seeks }, { data: apps }, { data: noShows }, { data: reliability }] =
      await Promise.all([
        admin
          .from("matches")
          .select("id,sport,mode,status,played_at,team_a_player_ids,team_b_player_ids,score,disputed_reason,is_ranked,created_at")
          .order("created_at", { ascending: false })
          .limit(80),
        admin
          .from("match_seeks")
          .select("id,created_by,status,sport,mode,city,window_start,match_id,expires_at,created_at")
          .order("created_at", { ascending: false })
          .limit(80),
        admin.from("match_seek_applications").select("seek_id,status").limit(500),
        admin
          .from("match_no_shows")
          .select("id,match_id,reported_by,no_show_user_id,created_at")
          .order("created_at", { ascending: false })
          .limit(60),
        admin
          .from("player_reliability")
          .select("user_id,no_shows,cancellations,updated_at")
          .order("no_shows", { ascending: false })
          .limit(60),
      ]);

    const matchRows = (matches ?? []) as RawMatch[];
    const seekRows = (seeks ?? []) as RawSeek[];
    const noShowRows = (noShows ?? []) as RawNoShow[];
    const reliabilityRows = (reliability ?? []) as RawReliability[];

    const userIds = new Set<string>();
    for (const m of matchRows) {
      for (const id of m.team_a_player_ids ?? []) userIds.add(id);
      for (const id of m.team_b_player_ids ?? []) userIds.add(id);
    }
    for (const s of seekRows) userIds.add(s.created_by);
    for (const n of noShowRows) {
      userIds.add(n.reported_by);
      userIds.add(n.no_show_user_id);
    }
    for (const r of reliabilityRows) userIds.add(r.user_id);

    const names = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id,display_name,username")
        .in("id", Array.from(userIds));
      for (const p of profiles ?? []) {
        names.set(
          p.id as string,
          ((p.display_name as string | null) || (p.username as string | null) || "Usuario") as string,
        );
      }
    }

    const applicantsBySeek = new Map<string, number>();
    for (const app of apps ?? []) {
      const seekId = app.seek_id as string;
      applicantsBySeek.set(seekId, (applicantsBySeek.get(seekId) ?? 0) + 1);
    }

    return {
      matches: matchRows.map((m) => ({
        id: m.id,
        sport: m.sport,
        mode: m.mode,
        status: m.status,
        playedAt: m.played_at,
        isRanked: m.is_ranked === true,
        teamALabel: teamLabel(m.team_a_player_ids ?? [], names),
        teamBLabel: teamLabel(m.team_b_player_ids ?? [], names),
        disputedReason: m.disputed_reason ?? null,
        scoreLabel: scoreLabel(m.score),
      })),
      seeks: seekRows.map((s) => ({
        id: s.id,
        authorName: nameFor(names, s.created_by),
        status: s.status,
        sport: s.sport,
        mode: s.mode,
        city: s.city ?? null,
        windowStart: s.window_start,
        applicantsCount: applicantsBySeek.get(s.id) ?? 0,
        matchId: s.match_id ?? null,
        expiresAt: s.expires_at,
      })),
      noShows: noShowRows.map((n) => ({
        id: n.id,
        matchId: n.match_id,
        reportedByName: nameFor(names, n.reported_by),
        noShowName: nameFor(names, n.no_show_user_id),
        createdAt: n.created_at,
      })),
      reliability: reliabilityRows.map((r) => ({
        userId: r.user_id,
        name: nameFor(names, r.user_id),
        noShows: r.no_shows ?? 0,
        cancellations: r.cancellations ?? 0,
      })),
    };
  });
}

const CancelMatchAdminSchema = z.object({
  matchId: UuidSchema,
  reason: z.string().max(500).optional(),
});

async function findMatchConversationId(admin: LooseClient, matchId: string): Promise<string | null> {
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("kind", "match")
    .eq("match_id", matchId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function cancelMatchAdmin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(CancelMatchAdminSchema, input, async ({ matchId, reason }) => {
    const adminId = await requireAdminUserId();
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, adminId, "admin");
    const admin = adminClient as unknown as LooseClient;

    const { data: match, error: readErr } = await admin
      .from("matches")
      .select("id,status,team_a_player_ids,team_b_player_ids")
      .eq("id", matchId)
      .maybeSingle();
    if (readErr) throw new MpError("MATCH.ADMIN_READ_FAILED", readErr.message, 500);
    if (!match) throw new MpError("MATCH.NOT_FOUND", "Partido no encontrado", 404);
    if (!["scheduled", "reported", "disputed"].includes(match.status as string)) {
      throw new MpError("MATCH.NOT_CANCELLABLE", `No se puede cancelar en estado '${match.status}'`, 409);
    }

    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("matches")
      .update({
        status: "cancelled",
        cancelled_by: adminId,
        cancelled_reason: reason ?? "Cancelado por soporte MATCHPOINT",
        cancelled_at: nowIso,
      })
      .eq("id", matchId);
    if (error) throw new MpError("MATCH.ADMIN_CANCEL_FAILED", error.message, 500);

    const seek = await admin
      .from("match_seeks")
      .select("id,expires_at")
      .eq("match_id", matchId)
      .eq("status", "matched")
      .maybeSingle();
    const seekRow = seek.data as { id: string; expires_at: string } | null;
    if (seekRow && new Date(seekRow.expires_at).getTime() > Date.now()) {
      await admin.from("match_seeks").update({ status: "open", match_id: null }).eq("id", seekRow.id);
      await admin
        .from("match_seek_applications")
        .update({ status: "rejected", responded_at: nowIso })
        .eq("seek_id", seekRow.id)
        .eq("status", "accepted");
    }

    const conversationId = await findMatchConversationId(admin, matchId);
    const participants = [
      ...(((match.team_a_player_ids as string[]) ?? [])),
      ...(((match.team_b_player_ids as string[]) ?? [])),
    ];
    await Promise.all(
      participants.map((userId) =>
        notify({
          userId,
          role: "user",
          kind: "match_cancelled",
          title: "Partido cancelado por soporte",
          body: reason || "Soporte MATCHPOINT canceló este partido.",
          payload: {
            match_id: matchId,
            conversation_id: conversationId,
            canceller_name: "Soporte MATCHPOINT",
            reason: reason ?? null,
          },
        }),
      ),
    );

    return { ok: true as const };
  });
}

export async function resolveMatchDisputeAdmin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      matchId: UuidSchema,
      resolution: z.enum(["confirm", "cancel"]),
      reason: z.string().max(500).optional(),
    }),
    input,
    async ({ matchId, resolution, reason }) => {
      const adminId = await requireAdminUserId();
      const adminClient = getAdminClient();
      await setAuditActor(adminClient, adminId, "admin");
      const admin = adminClient as unknown as LooseClient;
      const patch =
        resolution === "confirm"
          ? {
              status: "confirmed",
              disputed_reason: null,
              confirmed_at: new Date().toISOString(),
            }
          : {
              status: "cancelled",
              cancelled_by: adminId,
              cancelled_reason: reason ?? "Disputa cerrada por soporte MATCHPOINT",
              cancelled_at: new Date().toISOString(),
            };
      const { error } = await admin.from("matches").update(patch).eq("id", matchId);
      if (error) throw new MpError("MATCH.DISPUTE_RESOLVE_FAILED", error.message, 500);
      return { ok: true as const };
    },
  );
}

export async function cancelMatchSeekAdmin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ seekId: UuidSchema }), input, async ({ seekId }) => {
    const adminId = await requireAdminUserId();
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, adminId, "admin");
    const admin = adminClient as unknown as LooseClient;
    const { error } = await admin.from("match_seeks").update({ status: "cancelled" }).eq("id", seekId);
    if (error) throw new MpError("MATCH_SEEK.ADMIN_CANCEL_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function dismissNoShowAdmin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ reportId: UuidSchema }), input, async ({ reportId }) => {
    const adminId = await requireAdminUserId();
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, adminId, "admin");
    const admin = adminClient as unknown as LooseClient;
    const { data: row, error: readErr } = await admin
      .from("match_no_shows")
      .select("id,no_show_user_id")
      .eq("id", reportId)
      .maybeSingle();
    if (readErr) throw new MpError("MATCH.NO_SHOW_READ_FAILED", readErr.message, 500);
    if (!row) throw new MpError("MATCH.NO_SHOW_NOT_FOUND", "Reporte no encontrado", 404);

    const userId = row.no_show_user_id as string;
    const { data: rel } = await admin
      .from("player_reliability")
      .select("no_shows")
      .eq("user_id", userId)
      .maybeSingle();
    await admin.from("match_no_shows").delete().eq("id", reportId);
    if (rel) {
      await admin
        .from("player_reliability")
        .update({ no_shows: Math.max(0, ((rel.no_shows as number) ?? 0) - 1) })
        .eq("user_id", userId);
    }
    return { ok: true as const };
  });
}

export async function updatePlayerReliabilityAdmin(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      userId: UuidSchema,
      noShows: z.coerce.number().int().min(0).max(999),
      cancellations: z.coerce.number().int().min(0).max(999),
    }),
    input,
    async ({ userId, noShows, cancellations }) => {
      const adminId = await requireAdminUserId();
      const adminClient = getAdminClient();
      await setAuditActor(adminClient, adminId, "admin");
      const admin = adminClient as unknown as LooseClient;
      const { error } = await admin
        .from("player_reliability")
        .upsert({ user_id: userId, no_shows: noShows, cancellations }, { onConflict: "user_id" });
      if (error) throw new MpError("MATCH.RELIABILITY_UPDATE_FAILED", error.message, 500);
      return { ok: true as const };
    },
  );
}
