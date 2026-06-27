"use server";

import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { notify } from "@/server/notifications/dispatch";

// ── Tipos exportados ─────────────────────────────────────────────────────────

export type SubstitutionReason = "injury" | "no_show" | "voluntary" | "other";
export type WalkoverReason = "no_show" | "injury" | "disqualification" | "voluntary_withdrawal";

export type RegistrationSubstitution = {
  id: string;
  tournamentId: string;
  registrationId: string;
  outPlayerId: string;
  outPlayerName: string;
  inPlayerId: string;
  inPlayerName: string;
  reason: SubstitutionReason;
  notes: string | null;
  createdAt: string;
};

// ── Helpers internos ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function requirePlayerOpsEnabled(): Promise<void> {
  const supabase = await getServerClient();
  const { data } = await supabase.rpc("fn_my_effective_flags");
  const flag = (data ?? []).find(
    (r: { key: string; enabled: boolean }) => r.key === "tournament_player_ops_enabled",
  );
  if (!flag?.enabled) {
    throw new MpError("PLAYER_OPS.DISABLED", "Las operaciones de jugador no están habilitadas", 403);
  }
}

async function requirePartnerAdminForTournament(tournamentId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");

  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (adminRow) return user.id;

  const partnerId = (t.partner_id as string | null) ?? null;
  if (!partnerId) throw new AuthError("AUTH.ROLE_REQUIRED", "Torneo sin partner — solo admin");

  const { data: member } = await supabase
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member) throw new AuthError("AUTH.ROLE_REQUIRED", "Sin permiso para gestionar este torneo");

  return user.id;
}

// ── 1. Sustituir jugador en una inscripción ──────────────────────────────────

const SubstitutePlayerSchema = z.object({
  registrationId: UuidSchema,
  outPlayerId: UuidSchema,
  inPlayerId: UuidSchema,
  reason: z.enum(["injury", "no_show", "voluntary", "other"]),
  notes: z.string().max(300).optional(),
});

export async function substituteRegistrationPlayer(
  input: unknown,
): Promise<ActionResult<{ substitutionId: string }>> {
  return runAction(SubstitutePlayerSchema, input, async ({ registrationId, outPlayerId, inPlayerId, reason, notes }) => {
    await requirePlayerOpsEnabled();

    const admin: AnyClient = getAdminClient();

    const { data: reg } = await admin
      .from("registrations")
      .select("id, tournament_id, category_id, player_ids, status")
      .eq("id", registrationId)
      .maybeSingle();
    if (!reg) throw new MpError("SUBSTITUTION.REGISTRATION_NOT_FOUND", "Inscripción no encontrada", 404);
    if (reg.status !== "accepted") {
      throw new MpError("SUBSTITUTION.REGISTRATION_NOT_ACCEPTED", "Solo se pueden sustituir jugadores en inscripciones aceptadas", 422);
    }

    const callerId = await requirePartnerAdminForTournament(reg.tournament_id as string);

    const playerIds = (reg.player_ids as string[]) ?? [];
    if (!playerIds.includes(outPlayerId)) {
      throw new MpError("SUBSTITUTION.PLAYER_NOT_IN_REGISTRATION", "El jugador no está en esta inscripción", 422);
    }
    if (playerIds.includes(inPlayerId)) {
      throw new MpError("SUBSTITUTION.PLAYER_ALREADY_IN_REGISTRATION", "El jugador ya está en esta inscripción", 409);
    }

    const { data: existingReg } = await admin
      .from("registrations")
      .select("id")
      .eq("tournament_id", reg.tournament_id as string)
      .eq("category_id", reg.category_id as string)
      .eq("status", "accepted")
      .contains("player_ids", [inPlayerId])
      .maybeSingle();
    if (existingReg) {
      throw new MpError("SUBSTITUTION.PLAYER_ALREADY_REGISTERED", "El jugador ya tiene una inscripción aceptada en esta categoría", 409);
    }

    // TODO: validar mpr cuando profiles.mpr exista

    await setAuditActor(admin, callerId, "partner");

    const newPlayerIds = playerIds.map((id: string) => (id === outPlayerId ? inPlayerId : id));
    await admin
      .from("registrations")
      .update({ player_ids: newPlayerIds })
      .eq("id", registrationId);

    const { data: subRow, error: subErr } = await admin
      .from("registration_substitutions")
      .insert({
        tournament_id: reg.tournament_id as string,
        registration_id: registrationId,
        out_player_id: outPlayerId,
        in_player_id: inPlayerId,
        reason,
        notes: notes ?? null,
        authorized_by: callerId,
      })
      .select("id")
      .single();

    if (subErr) throw new MpError("SUBSTITUTION.INSERT_FAILED", "Error al registrar la sustitución", 500);

    // Notif al jugador que sale
    await notify({
      userId: outPlayerId,
      role: "user",
      kind: "player_substituted",
      title: "Fuiste sustituido en un torneo",
      body: "El organizador realizó un cambio en tu inscripción.",
    });

    // Notif al jugador que entra
    await notify({
      userId: inPlayerId,
      role: "user",
      kind: "player_substitution_added",
      title: "Fuiste agregado como reemplazo en un torneo",
      body: "El organizador te agregó a una inscripción existente.",
    });

    return { substitutionId: (subRow as { id: string }).id };
  });
}

// ── 2. Declarar walkover ─────────────────────────────────────────────────────

const DeclareWalkoverSchema = z.object({
  matchId: UuidSchema,
  matchType: z.enum(["bracket", "group"]),
  winnerSide: z.enum(["a", "b"]),
  reason: z.enum(["no_show", "injury", "disqualification", "voluntary_withdrawal"]),
  tournamentId: UuidSchema,
});

export async function declareWalkover(input: unknown): Promise<ActionResult<void>> {
  return runAction(DeclareWalkoverSchema, input, async ({ matchId, matchType, winnerSide, reason, tournamentId }) => {
    await requirePlayerOpsEnabled();
    const callerId = await requirePartnerAdminForTournament(tournamentId);
    const admin: AnyClient = getAdminClient();

    const table = matchType === "bracket" ? "bracket_matches" : "tournament_group_matches";

    const { data: match } = await admin
      .from(table)
      .select("id, status, side_a_registration_id, side_b_registration_id")
      .eq("id", matchId)
      .maybeSingle();

    if (!match) throw new MpError("WALKOVER.MATCH_NOT_FOUND", "Partido no encontrado", 404);

    const operable = ["scheduled", "live"].includes(match.status as string);
    if (!operable) {
      throw new MpError("WALKOVER.MATCH_NOT_OPERABLE", "El partido no está en estado operable (debe ser scheduled o live)", 422);
    }

    await setAuditActor(admin, callerId, "partner");

    await admin
      .from(table)
      .update({ status: "walkover", winner_side: winnerSide, walkover_reason: reason })
      .eq("id", matchId);

    // Notificar a todos los jugadores de ambas inscripciones
    const regIds = [
      match.side_a_registration_id as string | null,
      match.side_b_registration_id as string | null,
    ].filter(Boolean) as string[];

    if (regIds.length > 0) {
      const { data: regs } = await admin
        .from("registrations")
        .select("player_ids")
        .in("id", regIds);

      const allPlayerIds = new Set<string>();
      for (const r of (regs ?? []) as Array<{ player_ids: string[] | null }>) {
        for (const pid of r.player_ids ?? []) allPlayerIds.add(pid);
      }

      await Promise.all(
        Array.from(allPlayerIds).map((pid) =>
          notify({
            userId: pid,
            role: "user",
            kind: "match_walkover_declared",
            title: "Walkover declarado en tu partido",
            body: "El organizador declaró walkover. Revisa el estado del torneo.",
          }),
        ),
      );
    }
  });
}

// ── 3. Listar sustituciones de un torneo ─────────────────────────────────────

const ListSubstitutionsSchema = z.object({ tournamentId: UuidSchema });

export async function listRegistrationSubstitutions(
  input: unknown,
): Promise<ActionResult<RegistrationSubstitution[]>> {
  return runAction(ListSubstitutionsSchema, input, async ({ tournamentId }) => {
    await requirePlayerOpsEnabled();
    await requirePartnerAdminForTournament(tournamentId);

    const admin: AnyClient = getAdminClient();

    const { data } = await admin
      .from("registration_substitutions")
      .select(
        "id, tournament_id, registration_id, out_player_id, in_player_id, reason, notes, created_at, out:profiles!registration_substitutions_out_player_id_fkey(display_name), in:profiles!registration_substitutions_in_player_id_fkey(display_name)",
      )
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false });

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const outProfile = row["out"] as { display_name?: string } | null;
      const inProfile = row["in"] as { display_name?: string } | null;
      return {
        id: row.id as string,
        tournamentId: row.tournament_id as string,
        registrationId: row.registration_id as string,
        outPlayerId: row.out_player_id as string,
        outPlayerName: outProfile?.display_name ?? "Jugador",
        inPlayerId: row.in_player_id as string,
        inPlayerName: inProfile?.display_name ?? "Jugador",
        reason: row.reason as SubstitutionReason,
        notes: (row.notes as string | null) ?? null,
        createdAt: row.created_at as string,
      };
    });
  });
}

// ── 4. Resolver usuario por username (reutilizable desde panel partner) ───────

const ResolveByUsernameSchema = z.object({ username: z.string().min(3).max(30) });

export async function resolvePlayerByUsername(
  input: unknown,
): Promise<ActionResult<{ id: string; displayName: string; username: string } | null>> {
  return runAction(ResolveByUsernameSchema, input, async ({ username }) => {
    await requireUserId();
    const admin: AnyClient = getAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, display_name, username")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      displayName: (data.display_name as string | null) ?? (data.username as string),
      username: data.username as string,
    };
  });
}
