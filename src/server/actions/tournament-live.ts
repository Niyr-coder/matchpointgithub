"use server";

import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { getAdminClient } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

const TournamentIdSchema = z.object({ tournamentId: UuidSchema });

async function requireTournamentEditor(tournamentId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");

  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id")
    .eq("id", tournamentId)
    .single();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (adminRow) return;
  const partnerId = (t.partner_id as string | null) ?? null;
  if (!partnerId) throw new AuthError("AUTH.ROLE_REQUIRED", "Torneo sin partner — solo admin");
  const { data: member } = await supabase
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member) throw new AuthError("AUTH.ROLE_REQUIRED", "Sin permiso para editar este torneo");
}

export async function ensureTournamentDisplayToken(
  input: unknown,
): Promise<ActionResult<{ token: string; slug: string }>> {
  return runAction(TournamentIdSchema, input, async ({ tournamentId }) => {
    await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    const { data: tRaw } = await admin
      .from("tournaments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,slug,display_token" as any)
      .eq("id", tournamentId)
      .single();
    if (!tRaw) throw new MpError("TOURNAMENT.NOT_FOUND", "Torneo no encontrado", 404);
    const tRow = tRaw as unknown as { id: string; slug: string; display_token: string | null };

    let token = tRow.display_token;
    if (!token) {
      token = randomUUID();
      const { error } = await admin
        .from("tournaments")
        .update({ display_token: token } as never)
        .eq("id", tournamentId);
      if (error) throw new MpError("TOURNAMENT.TOKEN_FAILED", error.message, 500);
    }

    return { token, slug: tRow.slug };
  });
}

export async function rotateTournamentDisplayToken(
  input: unknown,
): Promise<ActionResult<{ token: string; slug: string }>> {
  return runAction(TournamentIdSchema, input, async ({ tournamentId }) => {
    await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    const token = randomUUID();
    const { data: row, error } = await admin
      .from("tournaments")
      .update({ display_token: token } as never)
      .eq("id", tournamentId)
      .select("slug")
      .single();
    if (error || !row) throw new MpError("TOURNAMENT.TOKEN_FAILED", error?.message ?? "Error", 500);
    return { token, slug: row.slug as string };
  });
}

export type TournamentLiveMatch = {
  id: string;
  labelA: string;
  labelB: string;
  scoreA: string;
  scoreB: string;
  status: string;
  phase: "group" | "knockout";
  groupName?: string;
  courtLabel?: string;
};

export type TournamentLiveGroupTable = {
  categoryName: string;
  groupName: string;
  rows: Array<{ rank: number; label: string; wins: number; sets: string }>;
};

export type TournamentLiveDisplay = {
  tournamentId: string;
  tournamentName: string;
  slug: string;
  format: string;
  liveMatches: TournamentLiveMatch[];
  recentMatches: TournamentLiveMatch[];
  groupTables: TournamentLiveGroupTable[];
  championLabel: string | null;
};

const LiveQuerySchema = z.object({
  slug: z.string().min(1),
  token: z.string().uuid(),
});

function formatSetScore(score: unknown): { a: string; b: string } {
  const s = score as { sets?: Array<{ a?: number; b?: number }> } | null;
  if (!s?.sets?.length) return { a: "-", b: "-" };
  let aW = 0;
  let bW = 0;
  for (const set of s.sets) {
    if ((set.a ?? 0) > (set.b ?? 0)) aW++;
    else if ((set.b ?? 0) > (set.a ?? 0)) bW++;
  }
  return { a: String(aW), b: String(bW) };
}

async function registrationLabels(
  admin: ReturnType<typeof getAdminClient>,
  regIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (regIds.length === 0) return out;
  const { data: regs } = await admin
    .from("registrations")
    .select("id,team_id,player_ids,teams(name)")
    .in("id", regIds);
  const playerIdSet = new Set<string>();
  for (const r of regs ?? []) {
    for (const p of (r.player_ids as string[] | null) ?? []) playerIdSet.add(p);
  }
  const profById = new Map<string, string>();
  if (playerIdSet.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(playerIdSet));
    for (const p of profs ?? []) {
      profById.set(p.id as string, (p.display_name as string | null) ?? "Jugador");
    }
  }
  for (const r of regs ?? []) {
    const pids = (r.player_ids as string[] | null) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamName = ((r as any).teams?.name as string | undefined) ?? null;
    const first = pids[0] ? profById.get(pids[0]) : null;
    const label = teamName
      ? teamName
      : pids.length > 1 && first
        ? `${first} +${pids.length - 1}`
        : first ?? "Equipo";
    out.set(r.id as string, label);
  }
  return out;
}

/** Lectura pública read-only para pantalla TV (valida token). */
export async function getTournamentLiveDisplay(
  input: unknown,
): Promise<ActionResult<TournamentLiveDisplay>> {
  return runAction(LiveQuerySchema, input, async ({ slug, token }) => {
    const admin = getAdminClient();
    const { data: tRaw } = await admin
      .from("tournaments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,slug,name,format,display_token,status" as any)
      .eq("slug", slug)
      .maybeSingle();
    const t = tRaw as unknown as {
      id: string;
      slug: string;
      name: string;
      format: string;
      display_token: string | null;
      status: string;
    } | null;
    if (!t || t.display_token !== token) {
      throw new MpError("TOURNAMENT.LIVE_FORBIDDEN", "Enlace no válido", 403);
    }
    if (t.status === "draft" || t.status === "cancelled") {
      throw new MpError("TOURNAMENT.LIVE_UNAVAILABLE", "Torneo no disponible", 404);
    }

    const tournamentId = t.id;

    const liveMatches: TournamentLiveMatch[] = [];
    const recentMatches: TournamentLiveMatch[] = [];
    const groupTables: TournamentLiveGroupTable[] = [];

    const { data: cats } = await admin
      .from("tournament_categories")
      .select("id,name,stage")
      .eq("tournament_id", tournamentId);

    for (const cat of cats ?? []) {
      const categoryName = cat.name as string;
      const { data: groups } = await admin
        .from("tournament_groups")
        .select("id,name,sort_order")
        .eq("category_id", cat.id as string)
        .order("sort_order", { ascending: true });

      for (const g of groups ?? []) {
        const { data: members } = await admin
          .from("tournament_group_members")
          .select("registration_id")
          .eq("group_id", g.id as string);
        const memberIds = (members ?? []).map((m) => m.registration_id as string);

        const { data: gm } = await admin
          .from("tournament_group_matches")
          .select(
            "id,side_a_registration_id,side_b_registration_id,score,status,winner_side,court_id,courts(code,name)",
          )
          .eq("group_id", g.id as string);

        const regIds = new Set<string>();
        for (const m of gm ?? []) {
          if (m.side_a_registration_id) regIds.add(m.side_a_registration_id as string);
          if (m.side_b_registration_id) regIds.add(m.side_b_registration_id as string);
        }
        const nameByReg = await registrationLabels(admin, Array.from(regIds));

        for (const m of gm ?? []) {
          const { a, b } = formatSetScore(m.score);
          const row: TournamentLiveMatch = {
            id: m.id as string,
            labelA: nameByReg.get(m.side_a_registration_id as string) ?? "—",
            labelB: nameByReg.get(m.side_b_registration_id as string) ?? "—",
            scoreA: a,
            scoreB: b,
            status: m.status as string,
            phase: "group",
            groupName: g.name as string,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            courtLabel: ((m as any).courts?.code as string) ?? ((m as any).courts?.name as string) ?? undefined,
          };
          if (m.status === "live") liveMatches.push(row);
          else if (m.status === "reported" || m.status === "confirmed") recentMatches.push(row);
        }

        if (memberIds.length > 0 && (gm?.length ?? 0) > 0) {
          const { computeGroupStandings } = await import("@/lib/tournaments/group-stage");
          const standings = computeGroupStandings(
            memberIds,
            (gm ?? []).map((m) => ({
              sideARegistrationId: m.side_a_registration_id as string,
              sideBRegistrationId: m.side_b_registration_id as string,
              winnerSide: (m.winner_side as "a" | "b" | "d" | null) ?? null,
              score: (m.score as { sets?: Array<{ a: number; b: number }> }) ?? null,
              status: m.status as string,
            })),
          );
          groupTables.push({
            categoryName,
            groupName: g.name as string,
            rows: standings.slice(0, 6).map((s) => ({
              rank: s.rank,
              label: nameByReg.get(s.registrationId) ?? "—",
              wins: s.wins,
              sets: `${s.setsWon}-${s.setsLost}`,
            })),
          });
        }
      }
    }

    const { data: brackets } = await admin
      .from("brackets")
      .select("id")
      .eq("tournament_id", tournamentId)
      .order("generated_at", { ascending: false })
      .limit(1);
    const bracketId = brackets?.[0]?.id as string | undefined;
    let championLabel: string | null = null;

    if (bracketId) {
      const { data: bmRaw } = await admin
        .from("bracket_matches")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(
          "id,round,position,side_a_registration_id,side_b_registration_id,score,status,winner_side,is_bronze" as any,
        )
        .eq("bracket_id", bracketId)
        .eq("is_bronze" as never, false)
        .order("round", { ascending: false });
      const bm = (bmRaw ?? []) as unknown as Array<{
        id: string;
        round: number;
        side_a_registration_id: string | null;
        side_b_registration_id: string | null;
        score: unknown;
        status: string;
        winner_side: string | null;
      }>;

      const regIds = new Set<string>();
      for (const m of bm ?? []) {
        if (m.side_a_registration_id) regIds.add(m.side_a_registration_id as string);
        if (m.side_b_registration_id) regIds.add(m.side_b_registration_id as string);
      }
      const nameByReg = await registrationLabels(admin, Array.from(regIds));

      for (const m of bm ?? []) {
        const { a, b } = formatSetScore(m.score);
        const row: TournamentLiveMatch = {
          id: m.id as string,
          labelA: m.side_a_registration_id
            ? nameByReg.get(m.side_a_registration_id as string) ?? "—"
            : "TBD",
          labelB: m.side_b_registration_id
            ? nameByReg.get(m.side_b_registration_id as string) ?? "—"
            : "TBD",
          scoreA: a,
          scoreB: b,
          status: m.status as string,
          phase: "knockout",
        };
        if (m.status === "live") liveMatches.push(row);
        else if (m.status === "reported" || m.status === "confirmed") recentMatches.push(row);
      }

      const final = (bm ?? []).find(
        (m) =>
          (m.round as number) === Math.max(...(bm ?? []).map((x) => x.round as number)) &&
          (m.status === "reported" || m.status === "confirmed"),
      );
      if (final?.winner_side === "a" && final.side_a_registration_id) {
        championLabel = nameByReg.get(final.side_a_registration_id as string) ?? null;
      } else if (final?.winner_side === "b" && final.side_b_registration_id) {
        championLabel = nameByReg.get(final.side_b_registration_id as string) ?? null;
      }
    }

    return {
      tournamentId,
      tournamentName: t.name,
      slug: t.slug,
      format: t.format,
      liveMatches: liveMatches.slice(0, 8),
      recentMatches: recentMatches.slice(-12).reverse(),
      groupTables: groupTables.slice(0, 8),
      championLabel,
    };
  });
}
