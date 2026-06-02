"use server";

// Admin: editar/reprogramar metadata de un torneo.
// Aislado de tournaments.ts. Si cambian startsAt/endsAt encola jobs en
// notification_jobs (kind 'tournament_rescheduled') para cada jugador en
// player_ids de cada registration con status pending/accepted.

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import {
  TournamentPaymentPolicySchema,
  TournamentSchema,
  type Tournament,
} from "@/lib/schemas/tournaments";

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return user.id;
}

function mapTournament(row: Record<string, unknown>): Tournament {
  return TournamentSchema.parse({
    id: row.id,
    leagueId: (row.league_id as string | null) ?? null,
    partnerId: (row.partner_id as string | null) ?? null,
    clubId: (row.club_id as string | null) ?? null,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    coverUrl: row.cover_url ?? null,
    sport: row.sport,
    format: row.format,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationOpensAt: (row.registration_opens_at as string | null) ?? null,
    registrationClosesAt: (row.registration_closes_at as string | null) ?? null,
    status: row.status,
    maxParticipants: (row.max_participants as number | null) ?? null,
    entryFeeCents: row.entry_fee_cents,
    currency: (row.currency as string | null) ?? null,
    paymentPolicy: (row.payment_policy as string | null) ?? "prepay",
    prizePoolCents: (row.prize_pool_cents as number | null) ?? null,
    rulesUrl: (row.rules_url as string | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const UpdateTournamentAdminSchema = z.object({
  tournamentId: UuidSchema,
  patch: z
    .object({
      name: z.string().min(2).max(120).optional(),
      description: z.string().max(2000).nullable().optional(),
      startsAt: z.string().datetime({ offset: true }).optional(),
      endsAt: z.string().datetime({ offset: true }).nullable().optional(),
      registrationOpensAt: z.string().datetime({ offset: true }).nullable().optional(),
      registrationClosesAt: z.string().datetime({ offset: true }).nullable().optional(),
      maxParticipants: z.number().int().positive().nullable().optional(),
      entryFeeCents: z.number().int().min(0).optional(),
      paymentPolicy: TournamentPaymentPolicySchema.optional(),
    })
    .refine((p) => Object.keys(p).length > 0, {
      message: "patch vacío",
    }),
});

export async function updateTournamentAdmin(
  input: unknown,
): Promise<ActionResult<Tournament>> {
  return runAction(
    UpdateTournamentAdminSchema,
    input,
    async ({ tournamentId, patch }) => {
      const adminUserId = await requireAdminUserId();
      const supabase = await getServerClient();

      const { data: existing, error: readErr } = await supabase
        .from("tournaments")
        .select(
          "id,name,description,starts_at,ends_at,registration_opens_at,registration_closes_at,max_participants,entry_fee_cents,status,payment_policy",
        )
        .eq("id", tournamentId)
        .single();
      if (readErr || !existing) {
        throw new MpError(
          "TOURNAMENTS.NOT_FOUND",
          "Torneo no encontrado",
          404,
        );
      }
      if (existing.status === "finished" || existing.status === "cancelled") {
        throw new MpError(
          "TOURNAMENTS.NOT_EDITABLE",
          `No se puede editar un torneo '${existing.status}'`,
          409,
        );
      }

      const update: Record<string, unknown> = {};
      if (patch.name !== undefined) update.name = patch.name;
      if (patch.description !== undefined) update.description = patch.description;
      if (patch.startsAt !== undefined) update.starts_at = patch.startsAt;
      if (patch.endsAt !== undefined) update.ends_at = patch.endsAt;
      if (patch.registrationOpensAt !== undefined)
        update.registration_opens_at = patch.registrationOpensAt;
      if (patch.registrationClosesAt !== undefined)
        update.registration_closes_at = patch.registrationClosesAt;
      if (patch.maxParticipants !== undefined)
        update.max_participants = patch.maxParticipants;
      if (patch.entryFeeCents !== undefined)
        update.entry_fee_cents = patch.entryFeeCents;
      if (patch.paymentPolicy !== undefined)
        update.payment_policy = patch.paymentPolicy;

      const newStart =
        (update.starts_at as string | undefined) ?? (existing.starts_at as string);
      const rawNewEnd =
        "ends_at" in update
          ? (update.ends_at as string | null | undefined)
          : (existing.ends_at as string | null);
      const newEnd: string | null = rawNewEnd ?? null;
      if (newEnd && new Date(newStart) >= new Date(newEnd)) {
        throw new MpError(
          "TOURNAMENTS.BAD_RANGE",
          "La fecha de inicio debe ser anterior a la de fin",
          422,
        );
      }

      const resultingFee =
        (update.entry_fee_cents as number | undefined) ??
        (existing.entry_fee_cents as number);
      const resultingPolicy =
        (update.payment_policy as string | undefined) ??
        (existing.payment_policy as string);
      if (resultingFee === 0 && resultingPolicy !== "free") {
        throw new MpError(
          "TOURNAMENTS.POLICY_MISMATCH",
          "Torneos sin cuota deben tener policy='free'",
          422,
        );
      }
      if (resultingFee > 0 && resultingPolicy === "free") {
        throw new MpError(
          "TOURNAMENTS.POLICY_MISMATCH",
          "Torneos con cuota no pueden tener policy='free'; usa prepay/onsite/flexible",
          422,
        );
      }

      const admin = getAdminClient();
      await setAuditActor(admin, adminUserId, "admin");
      const { data: updated, error: updErr } = await admin
        .from("tournaments")
        .update(update as never)
        .eq("id", tournamentId)
        .select()
        .single();
      if (updErr)
        throw new MpError("TOURNAMENTS.UPDATE_FAILED", updErr.message, 500);

      const diff: Record<string, { before: unknown; after: unknown }> = {};
      for (const key of Object.keys(update)) {
        diff[key] = {
          before: (existing as Record<string, unknown>)[key] ?? null,
          after: (updated as Record<string, unknown>)[key] ?? null,
        };
      }
      const { error: logErr } = await admin.rpc("fn_admin_audit_log", {
        p_entity: "tournaments",
        p_entity_id: tournamentId,
        p_action: "tournament.admin_edit",
        p_diff: diff as never,
      });
      if (logErr) {
        console.error("[updateTournamentAdmin] audit rpc failed:", logErr.message);
      }

      const dateChanged =
        patch.startsAt !== undefined || patch.endsAt !== undefined;
      if (dateChanged) {
        const { data: regs } = await supabase
          .from("registrations")
          .select("player_ids,status")
          .eq("tournament_id", tournamentId)
          .in("status", ["pending", "accepted"]);
        const userIdSet = new Set<string>();
        for (const r of regs ?? []) {
          for (const pid of ((r.player_ids as string[]) ?? [])) {
            if (pid) userIdSet.add(pid);
          }
        }
        const userIds = Array.from(userIdSet);
        if (userIds.length > 0) {
          const payloadBase = {
            tournament_id: tournamentId,
            tournament_name: updated.name,
            starts_at: updated.starts_at,
            ends_at: updated.ends_at,
            previous_starts_at: existing.starts_at,
            previous_ends_at: existing.ends_at,
          };
          const jobs = userIds.map((uid) => ({
            user_id: uid,
            role: "user",
            kind: "tournament_rescheduled",
            channel: "inapp",
            payload: payloadBase,
            status: "pending",
          }));
          const { error: jobErr } = await admin
            .from("notification_jobs")
            .insert(jobs as never);
          if (jobErr) {
            console.error(
              "[updateTournamentAdmin] enqueue notifications failed:",
              jobErr.message,
            );
          }
        }
      }

      return mapTournament(updated);
    },
  );
}
