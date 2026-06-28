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
import { computeGroupStandings } from "@/lib/tournaments/group-stage";
import type { GroupMatchResult } from "@/lib/tournaments/group-stage";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CategoryWinner = {
  categoryId: string;
  categoryName: string;
  winnerLabel: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildRegLabelMap(tournamentId: string): Promise<Map<string, string>> {
  const admin = getAdminClient();
  const { data: regsRaw } = await admin
    .from("registrations")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("id,player_ids,teams(name)" as any)
    .eq("tournament_id", tournamentId)
    .eq("status", "accepted");

  const nameByReg = new Map<string, string>();
  const playerIdSet = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (regsRaw ?? []) as any[];
  for (const r of rows) {
    const teamName = (r.teams?.name as string | null) ?? null;
    if (teamName) {
      nameByReg.set(r.id as string, teamName);
    } else {
      for (const pid of (r.player_ids as string[] | null) ?? []) {
        playerIdSet.add(pid);
      }
    }
  }

  if (playerIdSet.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(playerIdSet));
    const profMap = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        (p.display_name as string | null) ?? "Jugador",
      ]),
    );
    for (const r of rows) {
      if (nameByReg.has(r.id as string)) continue;
      const pids = (r.player_ids as string[] | null) ?? [];
      const first = pids[0] ? profMap.get(pids[0]) : undefined;
      nameByReg.set(r.id as string, first ?? "Equipo");
    }
  }

  return nameByReg;
}

// ── getDerivedCategoryWinners — sin auth, usable desde server components ──────

export async function getDerivedCategoryWinners(
  tournamentId: string,
): Promise<CategoryWinner[]> {
  const admin = getAdminClient();

  const { data: cats } = await admin
    .from("tournament_categories")
    .select("id,name")
    .eq("tournament_id", tournamentId)
    .order("name", { ascending: true });

  if (!cats?.length) return [];

  const nameByReg = await buildRegLabelMap(tournamentId);

  const { data: bracketRow } = await admin
    .from("brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .limit(1)
    .maybeSingle();

  const results: CategoryWinner[] = [];

  for (const cat of cats) {
    const categoryId = cat.id as string;
    const categoryName = cat.name as string;
    let winnerLabel: string | null = null;

    if (bracketRow) {
      const { data: finalMatch } = await admin
        .from("bracket_matches")
        .select("winner_side,side_a_registration_id,side_b_registration_id")
        .eq("bracket_id", bracketRow.id as string)
        .not("winner_side", "is", null)
        .order("round", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (finalMatch) {
        const winnerId =
          (finalMatch.winner_side as string) === "a"
            ? (finalMatch.side_a_registration_id as string)
            : (finalMatch.side_b_registration_id as string);
        winnerLabel = nameByReg.get(winnerId) ?? null;
      }
    } else {
      const { data: group } = await admin
        .from("tournament_groups")
        .select("id")
        .eq("category_id", categoryId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (group) {
        const [{ data: members }, { data: rawMatches }] = await Promise.all([
          admin
            .from("tournament_group_members")
            .select("registration_id")
            .eq("group_id", group.id as string),
          admin
            .from("tournament_group_matches")
            .select(
              "side_a_registration_id,side_b_registration_id,status,winner_side,score",
            )
            .eq("group_id", group.id as string),
        ]);

        const memberIds = (members ?? []).map((m) => m.registration_id as string);
        const matchResults: GroupMatchResult[] = (rawMatches ?? []).map((m) => ({
          sideARegistrationId: m.side_a_registration_id as string,
          sideBRegistrationId: m.side_b_registration_id as string,
          status: m.status as string,
          winnerSide: (m.winner_side as "a" | "b" | null) ?? null,
          score:
            (m.score as { sets?: Array<{ a: number; b: number }> } | null) ?? null,
        }));

        const standings = computeGroupStandings(memberIds, matchResults);
        const rank1 = standings.find((s) => s.rank === 1);
        if (rank1) winnerLabel = nameByReg.get(rank1.registrationId) ?? null;
      }
    }

    results.push({ categoryId, categoryName, winnerLabel });
  }

  return results;
}

// ── Auth helper ────────────────────────────────────────────────────────────────

async function requireCloseEditor(tournamentId: string): Promise<{
  userId: string;
  actorRole: "admin" | "partner" | "owner";
  tournamentStatus: string;
}> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión para continuar");

  const userId = user.id;

  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id,club_id,status")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

  const tournamentStatus = t.status as string;

  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (adminRow) return { userId, actorRole: "admin", tournamentStatus };

  const partnerId = (t.partner_id as string | null) ?? null;
  if (partnerId) {
    const { data: member } = await supabase
      .from("partner_members")
      .select("user_id")
      .eq("partner_id", partnerId)
      .eq("user_id", userId)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (member) return { userId, actorRole: "partner", tournamentStatus };
  }

  const clubId = (t.club_id as string | null) ?? null;
  if (clubId) {
    const { data: clubRole } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("club_id", clubId)
      .in("role", ["owner", "manager"])
      .is("revoked_at", null)
      .maybeSingle();
    if (clubRole) return { userId, actorRole: "owner", tournamentStatus };
  }

  throw new AuthError(
    "AUTH.ROLE_REQUIRED",
    "Solo el organizador o un admin puede finalizar este torneo",
  );
}

// ── closeTournament ───────────────────────────────────────────────────────────

const CloseTournamentSchema = z.object({ tournamentId: UuidSchema });

export async function closeTournament(
  input: unknown,
): Promise<ActionResult<{ tournamentId: string }>> {
  return runAction(CloseTournamentSchema, input, async ({ tournamentId }) => {
    const editor = await requireCloseEditor(tournamentId);

    if (editor.tournamentStatus === "finished") {
      throw new MpError("TOURNAMENTS.ALREADY_FINISHED", "El torneo ya fue finalizado", 409);
    }
    if (editor.tournamentStatus === "cancelled") {
      throw new MpError(
        "TOURNAMENTS.CANCELLED",
        "No puedes finalizar un torneo cancelado",
        409,
      );
    }

    const admin = getAdminClient();
    await setAuditActor(admin, editor.userId, editor.actorRole);

    // Marcar todas las categorías como completadas
    const { error: catErr } = await admin
      .from("tournament_categories")
      .update({ stage: "complete" } as never)
      .eq("tournament_id", tournamentId);
    if (catErr) throw new MpError("TOURNAMENTS.CLOSE_FAILED", catErr.message, 500);

    // Transicionar el torneo a finished y leer datos para notificaciones
    const { data: t, error: tErr } = await admin
      .from("tournaments")
      .update({ status: "finished" } as never)
      .eq("id", tournamentId)
      .select("id,name,slug")
      .single();
    if (tErr) throw new MpError("TOURNAMENTS.CLOSE_FAILED", tErr.message, 500);

    // Notificar a todos los jugadores pendientes y aceptados
    const { data: regs } = await admin
      .from("registrations")
      .select("player_ids,status")
      .eq("tournament_id", tournamentId)
      .in("status", ["pending", "accepted"]);
    const userIdSet = new Set<string>();
    for (const r of regs ?? []) {
      for (const pid of (r.player_ids as string[] | null) ?? []) {
        if (pid) userIdSet.add(pid);
      }
    }
    if (userIdSet.size > 0) {
      await Promise.all(
        Array.from(userIdSet).map((uid) =>
          notify({
            userId: uid,
            role: "user",
            kind: "tournament_finished",
            title: "Torneo finalizado",
            body: `${t.name as string} terminó. Revisa resultados y ranking.`,
            payload: {
              tournament_id: tournamentId,
              tournament_slug: t.slug,
              tournament_name: t.name,
            },
          }),
        ),
      );
    }

    await admin.rpc("fn_admin_audit_log", {
      p_entity: "tournaments",
      p_entity_id: tournamentId,
      p_action: "tournament.closed",
      p_diff: { from: editor.tournamentStatus, to: "finished" } as never,
    });

    return { tournamentId };
  });
}
