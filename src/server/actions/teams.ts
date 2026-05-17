"use server";

// Teams CRUD + invites.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { requirePlan } from "@/lib/auth/plan";
import {
  InviteToTeamSchema,
  TeamCreateSchema,
  TeamDetailSchema,
  TeamInviteSchema,
  TeamListParamsSchema,
  TeamMemberSchema,
  TeamSchema,
  TeamUpdateSchema,
  type Team,
  type TeamDetail,
} from "@/lib/schemas/social";
import { UuidSchema } from "@/lib/schemas/common";

function mapTeam(row: Record<string, unknown>): Team {
  return TeamSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    sport: row.sport ?? null,
    logoUrl: row.logo_url ?? null,
    captainId: row.captain_id,
    clubId: (row.club_id as string | null) ?? null,
    createdAt: row.created_at,
  });
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

// ── listTeams (public) ─────────────────────────────────────────────────
export async function listTeams(input: unknown): Promise<ActionResult<Team[]>> {
  return runAction(TeamListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;
    let q = supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (params.sport) q = q.eq("sport", params.sport);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.q) q = q.ilike("name", `%${params.q}%`);
    const { data, error } = await q;
    if (error) throw new MpError("TEAMS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapTeam);
  });
}

// ── getTeam ────────────────────────────────────────────────────────────
export async function getTeam(input: unknown): Promise<ActionResult<TeamDetail>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const [{ data: team, error }, { data: members }, { data: invites }] = await Promise.all([
      supabase.from("teams").select("*").eq("id", id).single(),
      supabase.from("team_members").select("*").eq("team_id", id),
      supabase
        .from("team_invites")
        .select("*")
        .eq("team_id", id)
        .eq("status", "pending"),
    ]);
    if (error || !team) throw new MpError("TEAMS.NOT_FOUND", "Team not found", 404);
    const memberIds = (members ?? []).map((m) => m.user_id as string);
    const { data: identities } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url")
      .in("id", memberIds);
    const idMap = new Map((identities ?? []).map((i) => [i.id as string, i]));

    const detail: TeamDetail = {
      team: mapTeam(team),
      members: (members ?? []).map((m) =>
        TeamMemberSchema.parse({
          userId: m.user_id,
          displayName: (idMap.get(m.user_id as string)?.display_name as string) ?? "—",
          avatarUrl: (idMap.get(m.user_id as string)?.avatar_url as string | null) ?? null,
          role: m.role,
          joinedAt: m.joined_at,
        }),
      ),
      pendingInvites: (invites ?? []).map((i) =>
        TeamInviteSchema.parse({
          id: i.id,
          teamId: i.team_id,
          invitedUserId: i.invited_user_id,
          invitedBy: i.invited_by,
          status: i.status,
          createdAt: i.created_at,
          respondedAt: (i.responded_at as string | null) ?? null,
        }),
      ),
    };
    return TeamDetailSchema.parse(detail);
  });
}

// ── createTeam ─────────────────────────────────────────────────────────
export async function createTeam(input: unknown): Promise<ActionResult<Team>> {
  return runAction(TeamCreateSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    // Gate: solo Premium puede crear team. Free se queda con joinTeamByCode /
    // requestJoinTeam (puede ser miembro normal, pero no fundador).
    await requirePlan(supabase, userId, "premium");
    const { data: team, error } = await supabase
      .from("teams")
      .insert({
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        sport: data.sport ?? null,
        logo_url: data.logoUrl ?? null,
        club_id: data.clubId ?? null,
        captain_id: userId,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("TEAMS.SLUG_TAKEN", "Team slug already in use", 409);
      }
      throw new MpError("TEAMS.CREATE_FAILED", error.message, 500);
    }
    await supabase
      .from("team_members")
      .insert({ team_id: team.id, user_id: userId, role: "captain" } as never, {
        defaultToNull: false,
      });
    return mapTeam(team);
  });
}

// ── inviteToTeam (captain only) ────────────────────────────────────────
const InviteInputSchema = z.object({
  teamId: UuidSchema,
  body: InviteToTeamSchema,
});

export async function inviteToTeam(
  input: unknown,
): Promise<ActionResult<z.infer<typeof TeamInviteSchema>>> {
  return runAction(InviteInputSchema, input, async ({ teamId, body }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: team } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", teamId)
      .single();
    if (!team) throw new MpError("TEAMS.NOT_FOUND", "Team not found", 404);
    if (team.captain_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the team captain can invite");
    }
    const { data, error } = await supabase
      .from("team_invites")
      .insert({
        team_id: teamId,
        invited_user_id: body.userId,
        invited_by: userId,
        status: "pending",
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("TEAMS.ALREADY_INVITED", "User already invited", 409);
      }
      throw new MpError("TEAMS.INVITE_FAILED", error.message, 500);
    }
    return TeamInviteSchema.parse({
      id: data.id,
      teamId: data.team_id,
      invitedUserId: data.invited_user_id,
      invitedBy: data.invited_by,
      status: data.status,
      createdAt: data.created_at,
      respondedAt: null,
    });
  });
}

// ── transferCaptain ────────────────────────────────────────────────────
// Usa la function SECURITY DEFINER `transfer_team_captain` (migration 037)
// para bypassear la policy teams_captain_write con validación explícita.
const TransferCaptainSchema = z.object({
  teamId: UuidSchema,
  newCaptainUserId: UuidSchema,
});

export async function transferCaptain(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(TransferCaptainSchema, input, async ({ teamId, newCaptainUserId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase.rpc("transfer_team_captain", {
      p_team_id: teamId,
      p_new_captain_id: newCaptainUserId,
    });
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("AUTH.ROLE_REQUIRED")) {
        throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el capitán puede transferir");
      }
      if (msg.includes("TEAMS.NOT_FOUND")) {
        throw new MpError("TEAMS.NOT_FOUND", "Team not found", 404);
      }
      if (msg.includes("TEAMS.NEW_CAPTAIN_NOT_MEMBER")) {
        throw new MpError("TEAMS.NEW_CAPTAIN_NOT_MEMBER", "El nuevo capitán debe ser miembro", 409);
      }
      if (msg.includes("TEAMS.SAME_CAPTAIN")) {
        throw new MpError("TEAMS.SAME_CAPTAIN", "Ya es el capitán actual", 409);
      }
      throw new MpError("TEAMS.TRANSFER_FAILED", msg, 500);
    }
    return { ok: true as const };
  });
}

// ── requestJoinTeam ────────────────────────────────────────────────────
const RequestJoinSchema = z.object({
  teamId: UuidSchema,
  message: z.string().max(280).optional(),
});

export async function requestJoinTeam(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(RequestJoinSchema, input, async ({ teamId, message }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: existingMember } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMember) {
      throw new MpError("TEAMS.ALREADY_MEMBER", "Ya formas parte de este team", 409);
    }

    const { data: existingPending } = await supabase
      .from("team_join_requests")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existingPending) {
      throw new MpError("TEAMS.REQUEST_PENDING", "Ya enviaste una solicitud", 409);
    }

    const { data, error } = await supabase
      .from("team_join_requests")
      .insert({
        team_id: teamId,
        user_id: userId,
        message: message ?? null,
      } as never)
      .select("id")
      .single();
    if (error) {
      // RLS: si el team es privado, tjr_user_create bloquea el insert.
      if (error.code === "42501") {
        throw new MpError("TEAMS.PRIVATE", "Este team no acepta solicitudes", 403);
      }
      throw new MpError("TEAMS.REQUEST_FAILED", error.message, 500);
    }
    return { id: data.id as string };
  });
}

// ── respondToJoinRequest (captain only) ────────────────────────────────
const RespondJoinSchema = z.object({
  requestId: UuidSchema,
  accept: z.boolean(),
});

export async function respondToJoinRequest(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(RespondJoinSchema, input, async ({ requestId, accept }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: req, error } = await supabase
      .from("team_join_requests")
      .select("team_id,user_id,status,teams(captain_id)")
      .eq("id", requestId)
      .single();
    if (error || !req) throw new MpError("TEAMS.REQUEST_NOT_FOUND", "Request not found", 404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captainId = (req as any).teams?.captain_id as string | undefined;
    if (captainId !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the team captain can respond");
    }
    if (req.status !== "pending") {
      throw new MpError("TEAMS.REQUEST_NOT_PENDING", `Status is '${req.status}'`, 409);
    }
    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("team_join_requests")
      .update({
        status: accept ? "accepted" : "rejected",
        responded_at: nowIso,
      } as never)
      .eq("id", requestId);
    if (updErr) throw new MpError("TEAMS.RESPOND_FAILED", updErr.message, 500);

    if (accept) {
      const { error: memErr } = await supabase
        .from("team_members")
        .insert(
          { team_id: req.team_id, user_id: req.user_id, role: "player" } as never,
          { defaultToNull: false },
        );
      if (memErr && memErr.code !== "23505") {
        // Si ya era miembro (insert duplicada), aceptamos silenciosamente.
        throw new MpError("TEAMS.ADD_MEMBER_FAILED", memErr.message, 500);
      }
    }
    return { ok: true as const };
  });
}

// ── cancelJoinRequest (requester only) ─────────────────────────────────
export async function cancelJoinRequest(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ requestId: UuidSchema }), input, async ({ requestId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: req, error } = await supabase
      .from("team_join_requests")
      .select("user_id,status")
      .eq("id", requestId)
      .single();
    if (error || !req) throw new MpError("TEAMS.REQUEST_NOT_FOUND", "Request not found", 404);
    if (req.user_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the requester can cancel");
    }
    if (req.status !== "pending") {
      throw new MpError("TEAMS.REQUEST_NOT_PENDING", `Status is '${req.status}'`, 409);
    }
    const { error: updErr } = await supabase
      .from("team_join_requests")
      .update({ status: "cancelled", responded_at: new Date().toISOString() } as never)
      .eq("id", requestId);
    if (updErr) throw new MpError("TEAMS.CANCEL_FAILED", updErr.message, 500);
    return { ok: true as const };
  });
}

// ── joinTeamByCode ─────────────────────────────────────────────────────
// El user ingresa el código de invitación del team. Si existe, se agrega como player.
// El código se normaliza (uppercase + trim) antes de buscar.
const JoinByCodeSchema = z.object({
  code: z.string().min(4).max(32),
});

export async function joinTeamByCode(input: unknown): Promise<ActionResult<Team>> {
  return runAction(JoinByCodeSchema, input, async ({ code }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const normalized = code.trim().toUpperCase();
    const { data: team, error } = await supabase
      .from("teams")
      .select("*")
      .eq("invite_code", normalized)
      .maybeSingle();
    if (error) throw new MpError("TEAMS.DB_ERROR", error.message, 500);
    if (!team) throw new MpError("TEAMS.CODE_INVALID", "Código no válido", 404);

    const { data: existing } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", team.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      throw new MpError("TEAMS.ALREADY_MEMBER", "Ya formas parte de este team", 409);
    }

    const { error: insErr } = await supabase
      .from("team_members")
      .insert({ team_id: team.id, user_id: userId, role: "player" } as never, {
        defaultToNull: false,
      });
    if (insErr) throw new MpError("TEAMS.JOIN_FAILED", insErr.message, 500);
    return mapTeam(team);
  });
}

// ── cancelInvite (captain only) ────────────────────────────────────────
// Requiere policy ti_captain_manage (migration 036).
export async function cancelInvite(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ inviteId: UuidSchema }), input, async ({ inviteId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: invite, error } = await supabase
      .from("team_invites")
      .select("team_id,status,teams(captain_id)")
      .eq("id", inviteId)
      .single();
    if (error || !invite) throw new MpError("TEAMS.INVITE_NOT_FOUND", "Invite not found", 404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captainId = (invite as any).teams?.captain_id as string | undefined;
    if (captainId !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the team captain can cancel");
    }
    if (invite.status !== "pending") {
      throw new MpError("TEAMS.INVITE_NOT_PENDING", `Status is '${invite.status}'`, 409);
    }
    const { error: updErr } = await supabase
      .from("team_invites")
      .update({ status: "cancelled", responded_at: new Date().toISOString() } as never)
      .eq("id", inviteId);
    if (updErr) throw new MpError("TEAMS.CANCEL_FAILED", updErr.message, 500);
    return { ok: true as const };
  });
}

// ── updateTeam (captain only) ──────────────────────────────────────────
const UpdateInputSchema = z.object({ teamId: UuidSchema, patch: TeamUpdateSchema });

export async function updateTeam(input: unknown): Promise<ActionResult<Team>> {
  return runAction(UpdateInputSchema, input, async ({ teamId, patch }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", teamId)
      .single();
    if (!existing) throw new MpError("TEAMS.NOT_FOUND", "Team not found", 404);
    if (existing.captain_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the team captain can edit");
    }
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.sport !== undefined) update.sport = patch.sport;
    if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;
    if (patch.clubId !== undefined) update.club_id = patch.clubId;
    if (Object.keys(update).length === 0) {
      throw new MpError("TEAMS.NO_CHANGES", "Nothing to update", 400);
    }
    const { data, error } = await supabase
      .from("teams")
      .update(update as never)
      .eq("id", teamId)
      .select()
      .single();
    if (error || !data) throw new MpError("TEAMS.UPDATE_FAILED", error?.message ?? "Update failed", 500);
    return mapTeam(data);
  });
}

// ── leaveTeam ──────────────────────────────────────────────────────────
// El captain no puede salir sin antes transferir capitanía (regla de negocio
// para evitar teams huérfanos). Si quiere disolver, usa disbandTeam.
export async function leaveTeam(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ teamId: UuidSchema }), input, async ({ teamId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: team } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", teamId)
      .single();
    if (!team) throw new MpError("TEAMS.NOT_FOUND", "Team not found", 404);
    if (team.captain_id === userId) {
      throw new MpError(
        "TEAMS.CAPTAIN_CANNOT_LEAVE",
        "Transfer captaincy or disband the team first",
        409,
      );
    }
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);
    if (error) throw new MpError("TEAMS.LEAVE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── disbandTeam (captain only) ─────────────────────────────────────────
// El cascade en team_members/team_invites borra todo lo asociado.
export async function disbandTeam(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ teamId: UuidSchema }), input, async ({ teamId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: team } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", teamId)
      .single();
    if (!team) throw new MpError("TEAMS.NOT_FOUND", "Team not found", 404);
    if (team.captain_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the team captain can disband");
    }
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) throw new MpError("TEAMS.DISBAND_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── declineTeamInvite ──────────────────────────────────────────────────
export async function declineTeamInvite(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ inviteId: UuidSchema }), input, async ({ inviteId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: invite, error } = await supabase
      .from("team_invites")
      .select("invited_user_id,status")
      .eq("id", inviteId)
      .single();
    if (error || !invite) throw new MpError("TEAMS.INVITE_NOT_FOUND", "Invite not found", 404);
    if (invite.invited_user_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the invited user can decline");
    }
    if (invite.status !== "pending") {
      throw new MpError("TEAMS.INVITE_NOT_PENDING", `Status is '${invite.status}'`, 409);
    }
    const { error: updErr } = await supabase
      .from("team_invites")
      .update({ status: "rejected", responded_at: new Date().toISOString() } as never)
      .eq("id", inviteId);
    if (updErr) throw new MpError("TEAMS.DECLINE_FAILED", updErr.message, 500);
    return { ok: true as const };
  });
}

// ── acceptTeamInvite ───────────────────────────────────────────────────
export async function acceptTeamInvite(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ inviteId: UuidSchema }), input, async ({ inviteId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: invite, error } = await supabase
      .from("team_invites")
      .select("*")
      .eq("id", inviteId)
      .single();
    if (error || !invite) throw new MpError("TEAMS.INVITE_NOT_FOUND", "Invite not found", 404);
    if (invite.invited_user_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the invited user can accept");
    }
    if (invite.status !== "pending") {
      throw new MpError("TEAMS.INVITE_NOT_PENDING", `Status is '${invite.status}'`, 409);
    }

    await supabase
      .from("team_members")
      .insert(
        { team_id: invite.team_id, user_id: userId, role: "player" } as never,
        { defaultToNull: false },
      );
    await supabase
      .from("team_invites")
      .update({ status: "accepted", responded_at: new Date().toISOString() } as never)
      .eq("id", inviteId);
    return { ok: true as const };
  });
}
