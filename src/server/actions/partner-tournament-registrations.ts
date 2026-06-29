"use server";

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, runMutation, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

// ── helpers internos ───────────────────────────────────────────────────

function auditActorRole(role: "admin" | "partner" | "club"): "admin" | "partner" | "owner" {
  return role === "club" ? "owner" : role;
}

async function requireTournamentEditor(tournamentId: string): Promise<{
  userId: string;
  actorRole: "admin" | "partner" | "club";
}> {
  const userId = await requireUserId();
  const supabase = await getServerClient();

  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id,club_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

  const partnerId = (t.partner_id as string | null) ?? null;
  const clubId = (t.club_id as string | null) ?? null;

  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (adminRow) return { userId, actorRole: "admin" };

  if (partnerId) {
    const { data: member } = await supabase
      .from("partner_members")
      .select("user_id")
      .eq("partner_id", partnerId)
      .eq("user_id", userId)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (member) return { userId, actorRole: "partner" };
  }

  if (clubId) {
    const { data: clubRole } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("club_id", clubId)
      .in("role", ["owner", "manager"])
      .is("revoked_at", null)
      .maybeSingle();
    if (clubRole) return { userId, actorRole: "club" };
  }

  throw new AuthError(
    "AUTH.ROLE_REQUIRED",
    "Solo el organizador o staff del club puede gestionar este torneo",
  );
}

async function writeAuditLog(params: {
  admin: ReturnType<typeof getAdminClient>;
  entity: string;
  entityId: string;
  action: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await params.admin.rpc("fn_admin_audit_log", {
    p_entity: params.entity,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_diff: (params.diff ?? {}) as never,
  });
  if (error) console.error("[partner-tournament-registrations] audit log failed", error);
}

async function enqueueTournamentRegistrationNotification(params: {
  admin: ReturnType<typeof getAdminClient>;
  userIds: string[];
  kind: "registration_accepted";
  payload: Record<string, unknown>;
  logContext: string;
}): Promise<void> {
  const userIds = Array.from(new Set(params.userIds.filter(Boolean)));
  if (userIds.length === 0) return;

  const jobs = userIds.map((uid) => ({
    user_id: uid,
    role: "user",
    kind: params.kind,
    channel: "inapp",
    payload: params.payload,
    status: "pending",
  }));
  const { error } = await params.admin.from("notification_jobs").insert(jobs as never);
  if (error) {
    console.error(`[${params.logContext}] enqueue notification failed:`, error.message);
  }
}

// ── tipos exportados ───────────────────────────────────────────────────

export type PlayerSearchResult = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  alreadyRegistered: boolean;
};

export type PartnerRegistrationRow = {
  id: string;
  tournamentId: string;
  playerIds: string[];
  guestNames: string[];
  status: string;
  categoryId: string | null;
  paidTransactionId: string | null;
};

// ── searchPlayersForTournament ──────────────────────────────────────────

const SearchPlayersSchema = z.object({
  tournamentId: UuidSchema,
  query: z.string().min(1).max(100),
});

export async function searchPlayersForTournament(
  input: unknown,
): Promise<ActionResult<PlayerSearchResult[]>> {
  return runAction(SearchPlayersSchema, input, async ({ tournamentId, query }) => {
    await requireTournamentEditor(tournamentId);

    const supabase = await getServerClient();

    // Obtener los player_ids ya inscritos activamente para poder excluirlos
    const { data: regs } = await supabase
      .from("registrations")
      .select("player_ids")
      .eq("tournament_id", tournamentId)
      .in("status", ["pending", "accepted", "waitlist"]);

    const registeredIds = new Set<string>(
      (regs ?? []).flatMap((r) => (r.player_ids as string[] | null) ?? []),
    );

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,username")
      .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
      .limit(20);

    if (error) throw new MpError("PROFILES.DB_ERROR", error.message, 500);

    return (profiles ?? [])
      .filter((p) => !registeredIds.has(p.id as string))
      .slice(0, 10)
      .map((p) => ({
        id: p.id as string,
        displayName:
          (p.display_name as string | null) ??
          (p.username as string | null) ??
          (p.id as string),
        avatarUrl: (p.avatar_url as string | null) ?? null,
        alreadyRegistered: false,
      }));
  });
}

// ── addRegistrationByPartner ────────────────────────────────────────────

const AddRegistrationSchema = z
  .object({
    tournamentId: UuidSchema,
    playerIds: z.array(UuidSchema).default([]),
    guestNames: z.array(z.string().min(1).max(200)).default([]),
    categoryId: UuidSchema.nullable().optional(),
  })
  .refine((d) => d.playerIds.length + d.guestNames.length > 0, {
    message: "Debes indicar al menos un jugador o walk-in",
    path: ["playerIds"],
  });

export async function addRegistrationByPartner(
  input: unknown,
): Promise<ActionResult<PartnerRegistrationRow>> {
  return runMutation(
    AddRegistrationSchema,
    input,
    async ({ tournamentId, playerIds, guestNames, categoryId }) => {
      const { userId, actorRole } = await requireTournamentEditor(tournamentId);

      const supabase = await getServerClient();

      const { data: tournament } = await supabase
        .from("tournaments")
        .select("id,status,entry_fee_cents,currency")
        .eq("id", tournamentId)
        .maybeSingle();
      if (!tournament) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

      if (tournament.status === "cancelled" || tournament.status === "finished") {
        throw new MpError(
          "TOURNAMENTS.INVALID_STATUS",
          `No se puede inscribir en un torneo con estado '${tournament.status}'`,
          409,
        );
      }

      // Verificar que ningún playerIds ya esté activamente inscrito
      if (playerIds.length > 0) {
        const { data: existing } = await supabase
          .from("registrations")
          .select("player_ids")
          .eq("tournament_id", tournamentId)
          .in("status", ["pending", "accepted", "waitlist"]);

        const registeredIds = new Set<string>(
          (existing ?? []).flatMap((r) => (r.player_ids as string[] | null) ?? []),
        );
        const duplicate = playerIds.find((id) => registeredIds.has(id));
        if (duplicate) {
          throw new MpError(
            "REGISTRATION.ALREADY_EXISTS",
            "Uno o más jugadores ya tienen una inscripción activa en este torneo",
            409,
          );
        }
      }

      // Verificar cupo de la categoría antes de mutar
      if (categoryId) {
        const { data: cat } = await supabase
          .from("tournament_categories")
          .select("id,max_teams")
          .eq("id", categoryId)
          .maybeSingle();
        if (cat && typeof cat.max_teams === "number") {
          const { count } = await supabase
            .from("registrations")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournamentId)
            .eq("category_id", categoryId)
            .in("status", ["pending", "accepted", "waitlist"]);
          if ((count ?? 0) >= cat.max_teams) {
            throw new MpError(
              "REGISTRATION.CATEGORY_FULL",
              "La categoría ya alcanzó su cupo máximo",
              409,
            );
          }
        }
      }

      const admin = getAdminClient();
      await setAuditActor(admin, userId, auditActorRole(actorRole));

      const { data: newReg, error: regErr } = await admin
        .from("registrations")
        .insert({
          tournament_id: tournamentId,
          player_ids: playerIds,
          guest_names: guestNames.length > 0 ? guestNames : null,
          category_id: categoryId ?? null,
          status: "accepted",
          registered_by: userId,
        } as never)
        .select("id,tournament_id,player_ids,status,category_id,paid_transaction_id")
        .single();

      if (regErr || !newReg) {
        throw new MpError(
          "REGISTRATION.INSERT_FAILED",
          regErr?.message ?? "Error al inscribir",
          500,
        );
      }

      const entryFeeCents = (tournament.entry_fee_cents as number | null) ?? 0;
      let paidTransactionId: string | null = null;

      if (entryFeeCents > 0) {
        // El primer playerIds es el titular de la transacción; si es walk-in se usa customer_name
        const customerUserId = playerIds[0] ?? null;
        const customerName = playerIds.length === 0 ? (guestNames[0] ?? null) : null;

        const { data: tx, error: txErr } = await admin
          .from("transactions")
          .insert({
            kind: "tournament",
            ref_id: newReg.id as string,
            amount_cents: entryFeeCents,
            currency: (tournament.currency as string | null) ?? "USD",
            method: "cash",
            status: "pending",
            customer_user_id: customerUserId,
            customer_name: customerName,
          } as never)
          .select("id")
          .single();

        if (txErr || !tx) {
          console.error(
            "[partner-tournament-registrations] transaction insert failed:",
            txErr?.message,
          );
        } else {
          paidTransactionId = tx.id as string;
          await admin
            .from("registrations")
            .update({ paid_transaction_id: paidTransactionId } as never)
            .eq("id", newReg.id as string);
        }
      }

      // Audit semántico (best-effort: no lanzar si falla)
      await writeAuditLog({
        admin,
        entity: "registrations",
        entityId: newReg.id as string,
        action: "registration.partner_manual_add",
        diff: {
          playerIds,
          guestNames,
          hasTransaction: entryFeeCents > 0,
        },
      });

      // Notificaciones solo para jugadores con cuenta (best-effort)
      if (playerIds.length > 0) {
        const { data: tournamentInfo } = await admin
          .from("tournaments")
          .select("id,name,slug,starts_at,ends_at")
          .eq("id", tournamentId)
          .maybeSingle();

        await enqueueTournamentRegistrationNotification({
          admin,
          userIds: playerIds,
          kind: "registration_accepted",
          payload: {
            tournament_id: tournamentId,
            tournament_name: tournamentInfo?.name ?? "tu torneo",
            tournament_slug: tournamentInfo?.slug ?? null,
            starts_at: tournamentInfo?.starts_at ?? null,
            ends_at: tournamentInfo?.ends_at ?? null,
            registration_id: newReg.id as string,
          },
          logContext: "addRegistrationByPartner",
        });
      }

      return {
        id: newReg.id as string,
        tournamentId: newReg.tournament_id as string,
        playerIds: (newReg.player_ids as string[] | null) ?? [],
        guestNames,
        status: newReg.status as string,
        categoryId: (newReg.category_id as string | null) ?? null,
        paidTransactionId,
      };
    },
  );
}
