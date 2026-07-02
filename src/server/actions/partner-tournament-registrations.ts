"use server";

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, runMutation, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { runTransactionCaptureCascade } from "@/lib/payments/capture-cascade";
import { notify } from "@/server/notifications/dispatch";

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
        .select("id,status,entry_fee_cents,currency,club_id")
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
          // Cupo: solo pending+accepted — waitlist NO consume cupo
          // (mig 20260713000000, misma semántica que registerToTournament).
          const { count } = await supabase
            .from("registrations")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournamentId)
            .eq("category_id", categoryId)
            .in("status", ["pending", "accepted"]);
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
            // Convención unificada (mig 20260717000000): ref_id = torneo,
            // club_id = sede — igual que la inscripción online. El vínculo
            // por-inscripción vive en registrations.paid_transaction_id.
            ref_id: tournamentId,
            club_id: (tournament.club_id as string | null) ?? null,
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

// ── addRegistrationsBulkByPartner (pegar lista de walk-ins) ────────────

export type BulkSkippedEntry = {
  index: number;
  names: string[];
  reason: "NAMES_COUNT_MISMATCH" | "CATEGORY_FULL";
};

export type BulkRegistrationResult = {
  createdCount: number;
  created: PartnerRegistrationRow[];
  skipped: BulkSkippedEntry[];
};

const AddRegistrationsBulkSchema = z.object({
  tournamentId: UuidSchema,
  categoryId: UuidSchema.nullable().optional(),
  entries: z
    .array(
      z.object({
        names: z.array(z.string().min(1).max(200)).min(1).max(2),
      }),
    )
    .min(1)
    .max(200),
});

const BULK_FAN_CHUNK = 10;

export async function addRegistrationsBulkByPartner(
  input: unknown,
): Promise<ActionResult<BulkRegistrationResult>> {
  return runMutation(
    AddRegistrationsBulkSchema,
    input,
    async ({ tournamentId, categoryId, entries }) => {
      const { userId, actorRole } = await requireTournamentEditor(tournamentId);

      const supabase = await getServerClient();

      const { data: tournament } = await supabase
        .from("tournaments")
        .select("id,status,entry_fee_cents,currency,modality,club_id")
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

      const expectedNames = tournament.modality === "singles" ? 1 : 2;
      const skipped: BulkSkippedEntry[] = [];
      let validEntries = entries
        .map((e, index) => ({ index, names: e.names }))
        .filter((e) => {
          if (e.names.length !== expectedNames) {
            skipped.push({ index: e.index, names: e.names, reason: "NAMES_COUNT_MISMATCH" });
            return false;
          }
          return true;
        });

      // Cupo de la categoría — se calcula una sola vez para todo el lote.
      if (categoryId) {
        const { data: cat } = await supabase
          .from("tournament_categories")
          .select("id,max_teams")
          .eq("id", categoryId)
          .maybeSingle();
        if (cat && typeof cat.max_teams === "number") {
          // Cupo: solo pending+accepted — waitlist NO consume cupo.
          const { count } = await supabase
            .from("registrations")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournamentId)
            .eq("category_id", categoryId)
            .in("status", ["pending", "accepted"]);
          const remaining = Math.max(0, cat.max_teams - (count ?? 0));
          if (validEntries.length > remaining) {
            const overflow = validEntries.slice(remaining);
            for (const e of overflow) {
              skipped.push({ index: e.index, names: e.names, reason: "CATEGORY_FULL" });
            }
            validEntries = validEntries.slice(0, remaining);
          }
        }
      }

      if (validEntries.length === 0) {
        return { createdCount: 0, created: [], skipped };
      }

      const admin = getAdminClient();
      await setAuditActor(admin, userId, auditActorRole(actorRole));

      const { data: newRegs, error: regErr } = await admin
        .from("registrations")
        .insert(
          validEntries.map((e) => ({
            tournament_id: tournamentId,
            player_ids: [],
            guest_names: e.names,
            category_id: categoryId ?? null,
            status: "accepted",
            registered_by: userId,
          })) as never,
        )
        .select("id,tournament_id,player_ids,status,category_id,paid_transaction_id");

      if (regErr || !newRegs) {
        throw new MpError(
          "REGISTRATION.INSERT_FAILED",
          regErr?.message ?? "Error al inscribir el lote",
          500,
        );
      }

      const entryFeeCents = (tournament.entry_fee_cents as number | null) ?? 0;
      const currency = (tournament.currency as string | null) ?? "USD";
      const created: PartnerRegistrationRow[] = new Array(newRegs.length);

      for (let i = 0; i < newRegs.length; i += BULK_FAN_CHUNK) {
        const chunk = newRegs.slice(i, i + BULK_FAN_CHUNK);
        await Promise.all(
          chunk.map(async (reg, chunkIdx) => {
            const idx = i + chunkIdx;
            const entry = validEntries[idx];
            let paidTransactionId: string | null = null;

            if (entryFeeCents > 0) {
              const { data: tx, error: txErr } = await admin
                .from("transactions")
                .insert({
                  kind: "tournament",
                  // Convención unificada: ref_id = torneo + club_id sede.
                  ref_id: tournamentId,
                  club_id: (tournament.club_id as string | null) ?? null,
                  amount_cents: entryFeeCents,
                  currency,
                  method: "cash",
                  status: "pending",
                  customer_user_id: null,
                  customer_name: entry.names[0],
                } as never)
                .select("id")
                .single();
              if (!txErr && tx) {
                paidTransactionId = tx.id as string;
                await admin
                  .from("registrations")
                  .update({ paid_transaction_id: paidTransactionId } as never)
                  .eq("id", reg.id as string);
              } else {
                console.error(
                  "[addRegistrationsBulkByPartner] transaction insert failed:",
                  txErr?.message,
                );
              }
            }

            await writeAuditLog({
              admin,
              entity: "registrations",
              entityId: reg.id as string,
              action: "registration.partner_manual_add",
              diff: { guestNames: entry.names, hasTransaction: entryFeeCents > 0, bulk: true },
            });

            created[idx] = {
              id: reg.id as string,
              tournamentId: reg.tournament_id as string,
              playerIds: (reg.player_ids as string[] | null) ?? [],
              guestNames: entry.names,
              status: reg.status as string,
              categoryId: (reg.category_id as string | null) ?? null,
              paidTransactionId,
            };
          }),
        );
      }

      return { createdCount: created.length, created, skipped };
    },
  );
}

// ── helpers compartidos para revisión de comprobantes ─────────────────────

async function requireEditorFromTransaction(transactionId: string): Promise<{
  userId: string;
  actorRole: "admin" | "partner" | "club";
  tx: { status: string; proof_url: string | null; customer_user_id: string | null; amount_cents: number; currency: string | null; kind: string; ref_id: string | null; club_id: string | null };
}> {
  const admin = getAdminClient();

  const { data: tx } = await admin
    .from("transactions")
    .select("id,status,proof_url,customer_user_id,amount_cents,currency,kind,ref_id,club_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (!tx) throw new MpError("PAYMENT_PROOF.NOT_FOUND", "Transacción no encontrada", 404);
  if (tx.kind !== "tournament") {
    throw new MpError("PAYMENT_PROOF.INVALID_KIND", "Solo se pueden revisar comprobantes de torneo desde el panel partner", 400);
  }

  // Encontrar el torneo ligado a esta transacción via registrations
  const { data: reg } = await admin
    .from("registrations")
    .select("tournament_id")
    .eq("paid_transaction_id", transactionId)
    .maybeSingle();
  if (!reg) throw new MpError("PAYMENT_PROOF.NOT_FOUND", "Inscripción no encontrada para esta transacción", 404);

  const { userId, actorRole } = await requireTournamentEditor(reg.tournament_id as string);

  return {
    userId,
    actorRole,
    tx: {
      status: tx.status as string,
      proof_url: (tx.proof_url as string | null) ?? null,
      customer_user_id: (tx.customer_user_id as string | null) ?? null,
      amount_cents: (tx.amount_cents as number) ?? 0,
      currency: (tx.currency as string | null) ?? null,
      kind: tx.kind as string,
      ref_id: (tx.ref_id as string | null) ?? null,
      club_id: (tx.club_id as string | null) ?? null,
    },
  };
}

// ── getRegistrationProofForPartner ────────────────────────────────────────

export type RegistrationProofForPartner = {
  transactionId: string;
  status: string;
  amountCents: number;
  currency: string | null;
  proofSignedUrl: string | null;
  proofSubmittedAt: string | null;
  customerName: string | null;
};

export async function getRegistrationProofForPartner(
  input: unknown,
): Promise<ActionResult<RegistrationProofForPartner>> {
  return runAction(z.object({ transactionId: UuidSchema }), input, async ({ transactionId }) => {
    const { tx } = await requireEditorFromTransaction(transactionId);

    const admin = getAdminClient();

    // Nombre del jugador
    let customerName: string | null = null;
    if (tx.customer_user_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", tx.customer_user_id)
        .maybeSingle();
      customerName = (prof?.display_name as string | null) ?? null;
    }

    // Obtener proof_submitted_at y firma del comprobante
    const { data: txFull } = await admin
      .from("transactions")
      .select("proof_submitted_at")
      .eq("id", transactionId)
      .maybeSingle();

    let proofSignedUrl: string | null = null;
    if (tx.proof_url) {
      const { data: signed } = await admin.storage
        .from("payment_proofs")
        .createSignedUrl(tx.proof_url, 60 * 15);
      proofSignedUrl = signed?.signedUrl ?? null;
    }

    return {
      transactionId,
      status: tx.status,
      amountCents: tx.amount_cents,
      currency: tx.currency,
      proofSignedUrl,
      proofSubmittedAt: (txFull?.proof_submitted_at as string | null) ?? null,
      customerName,
    };
  });
}

// ── approveRegistrationProofByPartner ─────────────────────────────────────

export async function approveRegistrationProofByPartner(
  input: unknown,
): Promise<ActionResult<{ ok: boolean }>> {
  return runMutation(z.object({ transactionId: UuidSchema }), input, async ({ transactionId }) => {
    const { userId, actorRole, tx } = await requireEditorFromTransaction(transactionId);

    if (tx.status !== "proof_submitted") {
      throw new MpError(
        "PAYMENT_PROOF.INVALID_STATE",
        `Solo se puede aprobar desde 'proof_submitted' (estado actual: '${tx.status}')`,
        409,
      );
    }

    const admin = getAdminClient();
    await setAuditActor(admin, userId, auditActorRole(actorRole));

    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("transactions")
      .update({
        status: "captured",
        proof_reviewed_by: userId,
        proof_reviewed_at: nowIso,
        proof_rejection_reason: null,
      } as never)
      .eq("id", transactionId);
    if (error) throw new MpError("PAYMENT_PROOF.UPDATE_FAILED", error.message, 500);

    await runTransactionCaptureCascade(admin, {
      id: transactionId,
      kind: tx.kind,
      ref_id: tx.ref_id,
      club_id: tx.club_id,
      customer_user_id: tx.customer_user_id,
      amount_cents: tx.amount_cents,
      currency: tx.currency,
    });

    return { ok: true };
  });
}

// ── rejectRegistrationProofByPartner ──────────────────────────────────────

export async function rejectRegistrationProofByPartner(
  input: unknown,
): Promise<ActionResult<{ ok: boolean }>> {
  return runMutation(
    z.object({ transactionId: UuidSchema, reason: z.string().min(2).max(500) }),
    input,
    async ({ transactionId, reason }) => {
      const { userId, actorRole, tx } = await requireEditorFromTransaction(transactionId);

      if (tx.status !== "proof_submitted") {
        throw new MpError(
          "PAYMENT_PROOF.INVALID_STATE",
          `Solo se puede rechazar desde 'proof_submitted' (estado actual: '${tx.status}')`,
          409,
        );
      }

      const admin = getAdminClient();
      await setAuditActor(admin, userId, auditActorRole(actorRole));

      const nowIso = new Date().toISOString();
      const { error } = await admin
        .from("transactions")
        .update({
          status: "pending_proof",
          proof_reviewed_by: userId,
          proof_reviewed_at: nowIso,
          proof_rejection_reason: reason,
          proof_url: null,
          proof_submitted_at: null,
        } as never)
        .eq("id", transactionId);
      if (error) throw new MpError("PAYMENT_PROOF.UPDATE_FAILED", error.message, 500);

      if (tx.customer_user_id) {
        await notify({
          userId: tx.customer_user_id,
          role: "user",
          kind: "payment_proof_rejected",
          title: "Comprobante de pago rechazado",
          body: reason,
          payload: {
            transaction_id: transactionId,
            transaction_kind: tx.kind,
            ref_id: tx.ref_id,
            rejection_reason: reason,
          },
        });
      }

      return { ok: true };
    },
  );
}
