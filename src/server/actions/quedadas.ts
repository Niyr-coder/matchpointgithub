"use server";

// Quedadas (juego social) — server actions. v1: organizar + resultados casuales.
// Pagos por comprobante (kind='quedada', sin payout — el organizador maneja el
// dinero). Ranked y motor en vivo = v2. Ver docs/product + memoria del proyecto.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { notify } from "@/server/notifications/dispatch";
import {
  CreateQuedadaSchema,
  QuedadaIdSchema,
  InviteToQuedadaSchema,
  SetQuedadaResultsSchema,
  SetQuedadaStatusSchema,
  ReportQuedadaSchema,
  CohostSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  CategoryIdSchema,
  AssignPairSchema,
  AutoAssignCategorySchema,
  RemovePairSchema,
  SetParticipantPaidSchema,
  QuedadaLogisticsSchema,
  JoinByCodeSchema,
  ListQuedadaTemplatesSchema,
  SaveQuedadaTemplateSchema,
  QuedadaTemplateIdSchema,
  GenerateRoundRobinSchema,
  GenerateGroupStageSchema,
  AddQuedadaMatchSchema,
  ReportQuedadaMatchSchema,
  QuedadaMatchIdSchema,
} from "@/lib/schemas/quedadas";

const MAX_QUEDADA_TEMPLATES = 5;

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

// ── createQuedada ────────────────────────────────────────────────────────────
export async function createQuedada(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(CreateQuedadaSchema, input, async (d) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("quedadas")
      .insert({
        creator_id: userId,
        club_id: d.clubId ?? null,
        title: d.title,
        description: d.description ?? null,
        format: d.format,
        match_mode: d.matchMode,
        visibility: d.visibility,
        status: "registration_open",
        starts_at: d.startsAt,
        location_text: d.locationText ?? null,
        max_players: d.maxPlayers ?? null,
        fee_cents: d.feeCents,
        perks_text: d.perks ?? null,
        courts_count: d.courtsCount ?? null,
        hours: d.hours ?? null,
        court_price_cents: d.courtPriceCents ?? null,
        payment_account: d.paymentAccount ?? null,
        prizes: d.prizes ?? null,
        payment_info: d.paymentInfo ?? null, // deprecado (compat)
        prizes_text: d.prizesText ?? null, // deprecado (compat)
        ranked: false, // v1: siempre casual
      } as never)
      .select("id")
      .single();
    if (error || !row) throw new MpError("QUEDADAS.CREATE_FAILED", error?.message ?? "No se pudo crear", 500);

    // El organizador queda inscrito automáticamente.
    await supabase
      .from("quedada_participants")
      .insert({ quedada_id: row.id, user_id: userId, status: "joined" } as never);

    // Categorías iniciales (opcional).
    if (d.categories && d.categories.length > 0) {
      await supabase.from("quedada_categories").insert(
        d.categories.map((c, i) => ({
          quedada_id: row.id,
          name: c.name,
          level_label: c.levelLabel ?? null,
          starts_at: c.startsAt ?? null,
          court_label: c.courtLabel ?? null,
          max_slots: c.maxSlots ?? null,
          sort_order: i,
        })) as never,
      );
    }

    return { id: row.id as string };
  });
}

// ── joinQuedada ──────────────────────────────────────────────────────────────
// Open: cualquiera se anota (con cupo). Private: solo si fue invitado.
// Si hay cuota → crea transaction kind='quedada' (comprobante) y devuelve txId.
export async function joinQuedada(
  input: unknown,
): Promise<ActionResult<{ ok: true; transactionId?: string }>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: q, error: qErr } = await supabase
      .from("quedadas")
      .select("id,creator_id,visibility,status,max_players,fee_cents,club_id")
      .eq("id", quedadaId)
      .maybeSingle();
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.status !== "registration_open") {
      throw new MpError("QUEDADAS.CLOSED", "Las inscripciones están cerradas", 409);
    }

    // Estado actual del participante (puede venir 'invited' en privadas).
    const { data: existing } = await supabase
      .from("quedada_participants")
      .select("status")
      .eq("quedada_id", quedadaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing && existing.status === "joined") {
      throw new MpError("QUEDADAS.ALREADY_JOINED", "Ya estás inscrito", 409);
    }
    if (q.visibility === "private" && q.creator_id !== userId && !existing) {
      throw new MpError("QUEDADAS.INVITE_ONLY", "Esta quedada es por invitación", 403);
    }

    // Cupo (cuenta solo 'joined').
    if (q.max_players != null) {
      const { count } = await supabase
        .from("quedada_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("quedada_id", quedadaId)
        .eq("status", "joined");
      if ((count ?? 0) >= (q.max_players as number)) {
        throw new MpError("QUEDADAS.FULL", "La quedada está llena", 409);
      }
    }

    // Cuota → transaction por comprobante (sin payout; el organizador maneja el dinero).
    let transactionId: string | undefined;
    const fee = (q.fee_cents as number) ?? 0;
    if (fee > 0) {
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          club_id: (q.club_id as string | null) ?? null,
          kind: "quedada",
          ref_id: quedadaId,
          customer_user_id: userId,
          amount_cents: fee,
          currency: "USD",
          method: "transfer",
          status: "pending_proof",
          created_by: userId,
        } as never)
        .select("id")
        .single();
      if (txErr || !tx) throw new MpError("QUEDADAS.TX_FAILED", txErr?.message ?? "tx error", 500);
      transactionId = tx.id as string;
    }

    const { error: pErr } = await supabase
      .from("quedada_participants")
      .upsert(
        {
          quedada_id: quedadaId,
          user_id: userId,
          status: "joined",
          paid_transaction_id: transactionId ?? null,
        } as never,
        { onConflict: "quedada_id,user_id" },
      );
    if (pErr) throw new MpError("QUEDADAS.JOIN_FAILED", pErr.message, 500);

    // Avisar al organizador (si no es él mismo).
    if (q.creator_id !== userId) {
      await notify({
        userId: q.creator_id as string,
        role: "user",
        kind: "quedada_joined",
        title: "Alguien se unió a tu quedada",
        payload: { quedadaId },
      });
    }

    return { ok: true as const, transactionId };
  });
}

// ── leaveQuedada ─────────────────────────────────────────────────────────────
export async function leaveQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("quedada_participants")
      .update({ status: "cancelled" } as never)
      .eq("quedada_id", quedadaId)
      .eq("user_id", userId);
    if (error) throw new MpError("QUEDADAS.LEAVE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── inviteToQuedada (solo creador; inserta filas 'invited' para otros) ────────
export async function inviteToQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(InviteToQuedadaSchema, input, async ({ quedadaId, userIds }) => {
    const callerId = await requireUserId();
    const supabase = await getServerClient();
    const { data: q } = await supabase
      .from("quedadas")
      .select("creator_id,title")
      .eq("id", quedadaId)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.creator_id !== callerId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador invita");
    }
    // El creador puede insertar filas 'invited' de otros (RLS qp_insert lo permite).
    const rows = userIds.map((uid) => ({ quedada_id: quedadaId, user_id: uid, status: "invited" }));
    const { error } = await supabase
      .from("quedada_participants")
      .upsert(rows, { onConflict: "quedada_id,user_id", ignoreDuplicates: true });
    if (error) throw new MpError("QUEDADAS.INVITE_FAILED", error.message, 500);

    await Promise.all(
      userIds.map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "quedada_invite",
          title: "Te invitaron a una quedada",
          body: q.title as string,
          payload: { quedadaId },
        }),
      ),
    );
    return { ok: true as const };
  });
}

// ── cancelQuedada (creador) ──────────────────────────────────────────────────
export async function cancelQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: q } = await supabase
      .from("quedadas")
      .select("creator_id,status")
      .eq("id", quedadaId)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.creator_id !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador cancela");
    if (q.status === "cancelled") return { ok: true as const };

    const { error } = await supabase
      .from("quedadas")
      .update({ status: "cancelled", updated_at: new Date().toISOString() } as never)
      .eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.CANCEL_FAILED", error.message, 500);

    // Avisar a los inscritos (menos el organizador).
    const { data: parts } = await supabase
      .from("quedada_participants")
      .select("user_id,status")
      .eq("quedada_id", quedadaId)
      .in("status", ["joined", "invited"]);
    await Promise.all(
      ((parts ?? []) as Array<{ user_id: string }>)
        .filter((p) => p.user_id !== userId)
        .map((p) =>
          notify({
            userId: p.user_id,
            role: "user",
            kind: "quedada_cancelled",
            title: "Se canceló una quedada",
            payload: { quedadaId },
          }),
        ),
    );
    return { ok: true as const };
  });
}

// ── setQuedadaResults (creador, casual — no toca MP Rating en v1) ─────────────
export async function setQuedadaResults(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetQuedadaResultsSchema, input, async ({ quedadaId, results }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: q } = await supabase
      .from("quedadas")
      .select("creator_id")
      .eq("id", quedadaId)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.creator_id !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador carga resultados");

    for (const r of results) {
      const { error } = await supabase
        .from("quedada_participants")
        .update({ points: r.points ?? null, final_rank: r.finalRank ?? null } as never)
        .eq("quedada_id", quedadaId)
        .eq("user_id", r.userId);
      if (error) throw new MpError("QUEDADAS.RESULTS_FAILED", error.message, 500);
    }
    await supabase
      .from("quedadas")
      .update({ status: "finished", updated_at: new Date().toISOString() } as never)
      .eq("id", quedadaId);
    return { ok: true as const };
  });
}

// ── setQuedadaStatus (transiciones intermedias: cerrar/iniciar/reabrir) ───────
export async function setQuedadaStatus(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetQuedadaStatusSchema, input, async ({ quedadaId, status }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: q } = await supabase
      .from("quedadas")
      .select("creator_id,status")
      .eq("id", quedadaId)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.creator_id !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador cambia el estado");
    if (q.status === "finished" || q.status === "cancelled") {
      throw new MpError("QUEDADAS.CLOSED", "La quedada ya terminó; no se puede cambiar el estado", 409);
    }
    const { error } = await supabase
      .from("quedadas")
      .update({ status, updated_at: new Date().toISOString() } as never)
      .eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.STATUS_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── reportQuedada (soporte/moderación) ───────────────────────────────────────
export async function reportQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ReportQuedadaSchema, input, async ({ quedadaId, reason }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("quedada_reports")
      .insert({ quedada_id: quedadaId, reporter_id: userId, reason } as never);
    if (error) throw new MpError("QUEDADAS.REPORT_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── getQuedadaManageData (lectura para panel de gestión + detalle/calendario) ─
export async function getQuedadaManageData(input: unknown): Promise<ActionResult<unknown>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: q, error: qErr } = await supabase
      .from("quedadas")
      .select(
        "id,creator_id,title,description,format,match_mode,visibility,status,starts_at,location_text,fee_cents,max_players,courts_count,hours,court_price_cents,perks_text,payment_account,prizes,payment_info,prizes_text,invite_code",
      )
      .eq("id", quedadaId)
      .maybeSingle();
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);

    const [cats, pairs, parts, cohosts, matches] = await Promise.all([
      supabase.from("quedada_categories").select("id,name,level_label,starts_at,court_label,max_slots,sort_order").eq("quedada_id", quedadaId).order("sort_order", { ascending: true }),
      supabase.from("quedada_pairs").select("id,category_id,slot_no,player_a_id,player_b_id").eq("quedada_id", quedadaId).order("slot_no", { ascending: true }),
      supabase.from("quedada_participants").select("user_id,status,paid,points,final_rank,profiles(display_name,username)").eq("quedada_id", quedadaId),
      supabase.from("quedada_cohosts").select("user_id,profiles(display_name,username)").eq("quedada_id", quedadaId),
      supabase.from("quedada_matches").select("id,category_id,group_no,court_no,round_no,pair_a_id,pair_b_id,points_a,points_b,status").eq("quedada_id", quedadaId).order("round_no", { ascending: true }),
    ]);

    const canManage =
      (q.creator_id as string) === userId ||
      ((cohosts.data ?? []) as Array<{ user_id: string }>).some((c) => c.user_id === userId);

    return {
      quedada: q,
      isCreator: (q.creator_id as string) === userId,
      canManage,
      meUserId: userId,
      categories: cats.data ?? [],
      pairs: pairs.data ?? [],
      participants: parts.data ?? [],
      cohosts: cohosts.data ?? [],
      matches: matches.data ?? [],
    };
  });
}

// ════════════════ Panel de gestión (v1.x) ════════════════
// Las policies RLS gatean: categorías/cohosts/logística = solo creador;
// parejas/slots/paid = creador o co-host (mp_quedada_can_manage). Acá confiamos
// en RLS y devolvemos el error si la operación no está permitida.

// ── Co-hosts (solo creador) ──────────────────────────────────────────────────
export async function addCohost(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(CohostSchema, input, async ({ quedadaId, userId }) => {
    const callerId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("quedada_cohosts")
      .upsert({ quedada_id: quedadaId, user_id: userId, added_by: callerId }, { onConflict: "quedada_id,user_id" });
    if (error) throw new MpError("QUEDADAS.COHOST_FAILED", error.message, 500);
    await notify({
      userId,
      role: "user",
      kind: "quedada_cohost_added",
      title: "Te hicieron co-host de una quedada",
      payload: { quedadaId },
    });
    return { ok: true as const };
  });
}

export async function removeCohost(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(CohostSchema, input, async ({ quedadaId, userId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("quedada_cohosts")
      .delete()
      .eq("quedada_id", quedadaId)
      .eq("user_id", userId);
    if (error) throw new MpError("QUEDADAS.COHOST_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Categorías (solo creador) ────────────────────────────────────────────────
export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(CreateCategorySchema, input, async (d) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("quedada_categories")
      .insert({
        quedada_id: d.quedadaId,
        name: d.name,
        level_label: d.levelLabel ?? null,
        starts_at: d.startsAt ?? null,
        court_label: d.courtLabel ?? null,
        max_slots: d.maxSlots ?? null,
      })
      .select("id")
      .single();
    if (error || !data) throw new MpError("QUEDADAS.CATEGORY_FAILED", error?.message ?? "error", 500);
    return { id: data.id as string };
  });
}

export async function updateCategory(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdateCategorySchema, input, async (d) => {
    await requireUserId();
    const supabase = await getServerClient();
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.levelLabel !== undefined) patch.level_label = d.levelLabel;
    if (d.startsAt !== undefined) patch.starts_at = d.startsAt;
    if (d.courtLabel !== undefined) patch.court_label = d.courtLabel;
    if (d.maxSlots !== undefined) patch.max_slots = d.maxSlots;
    const { error } = await supabase.from("quedada_categories").update(patch as never).eq("id", d.categoryId);
    if (error) throw new MpError("QUEDADAS.CATEGORY_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function deleteCategory(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(CategoryIdSchema, input, async ({ categoryId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase.from("quedada_categories").delete().eq("id", categoryId);
    if (error) throw new MpError("QUEDADAS.CATEGORY_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Parejas / slots (creador o co-host) ──────────────────────────────────────
export async function assignPair(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(AssignPairSchema, input, async (d) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase.from("quedada_pairs").upsert(
      {
        quedada_id: d.quedadaId,
        category_id: d.categoryId,
        slot_no: d.slotNo,
        player_a_id: d.playerAId,
        player_b_id: d.playerBId ?? null,
      },
      { onConflict: "category_id,slot_no" },
    );
    if (error) throw new MpError("QUEDADAS.PAIR_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── autoAssignCategory (popcorn) ─────────────────────────────────────────────
// Mezcla los inscritos joined que aún no están asignados en la categoría y los
// reparte en los cupos vacíos (2 por cupo en dobles, 1 en singles).
export async function autoAssignCategory(input: unknown): Promise<ActionResult<{ assigned: number }>> {
  return runAction(AutoAssignCategorySchema, input, async ({ quedadaId, categoryId }) => {
    await requireUserId();
    const supabase = await getServerClient();

    const { data: q } = await supabase.from("quedadas").select("match_mode").eq("id", quedadaId).maybeSingle();
    const isDoubles = (q?.match_mode ?? "doubles") === "doubles";

    const { data: cat } = await supabase.from("quedada_categories").select("max_slots").eq("id", categoryId).maybeSingle();
    const maxSlots = (cat?.max_slots as number | null) ?? 0;
    if (maxSlots <= 0) throw new MpError("QUEDADAS.NO_SLOTS", "La categoría no tiene cupos definidos", 400);

    const { data: pairs } = await supabase
      .from("quedada_pairs")
      .select("slot_no,player_a_id,player_b_id")
      .eq("category_id", categoryId);
    const occupied = new Set<number>();
    const assigned = new Set<string>();
    for (const p of pairs ?? []) {
      occupied.add(p.slot_no as number);
      assigned.add(p.player_a_id as string);
      if (p.player_b_id) assigned.add(p.player_b_id as string);
    }

    const { data: parts } = await supabase
      .from("quedada_participants")
      .select("user_id,status")
      .eq("quedada_id", quedadaId)
      .eq("status", "joined");
    const available: string[] = (parts ?? [])
      .map((p: { user_id: string }) => p.user_id)
      .filter((id: string) => !assigned.has(id));
    // Shuffle (Fisher–Yates).
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    const emptySlots: number[] = [];
    for (let n = 1; n <= maxSlots; n++) if (!occupied.has(n)) emptySlots.push(n);

    const perSlot = isDoubles ? 2 : 1;
    const rows: Record<string, unknown>[] = [];
    let idx = 0;
    for (const slot of emptySlots) {
      if (available.length - idx < perSlot) break; // sin suficientes para una pareja completa
      const playerA = available[idx++];
      const playerB = isDoubles ? available[idx++] : null;
      rows.push({ quedada_id: quedadaId, category_id: categoryId, slot_no: slot, player_a_id: playerA, player_b_id: playerB });
    }
    if (rows.length === 0) {
      throw new MpError("QUEDADAS.NOTHING_TO_ASSIGN", "No hay inscritos disponibles para llenar cupos", 400);
    }
    const { error } = await supabase.from("quedada_pairs").insert(rows as never);
    if (error) throw new MpError("QUEDADAS.AUTOASSIGN_FAILED", error.message, 500);
    return { assigned: rows.length };
  });
}

export async function removePair(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RemovePairSchema, input, async ({ pairId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase.from("quedada_pairs").delete().eq("id", pairId);
    if (error) throw new MpError("QUEDADAS.PAIR_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Pago por participante (creador o co-host) ────────────────────────────────
export async function setParticipantPaid(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetParticipantPaidSchema, input, async ({ quedadaId, userId, paid }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("quedada_participants")
      .update({ paid })
      .eq("quedada_id", quedadaId)
      .eq("user_id", userId);
    if (error) throw new MpError("QUEDADAS.PAID_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Logística + bancarios + premios (solo creador) ───────────────────────────
export async function updateQuedadaLogistics(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaLogisticsSchema, input, async (d) => {
    await requireUserId();
    const supabase = await getServerClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (d.courtsCount !== undefined) patch.courts_count = d.courtsCount;
    if (d.hours !== undefined) patch.hours = d.hours;
    if (d.courtPriceCents !== undefined) patch.court_price_cents = d.courtPriceCents;
    if (d.paymentAccount !== undefined) patch.payment_account = d.paymentAccount;
    if (d.prizes !== undefined) patch.prizes = d.prizes;
    if (d.paymentInfo !== undefined) patch.payment_info = d.paymentInfo;
    if (d.prizesText !== undefined) patch.prizes_text = d.prizesText;
    const { error } = await supabase.from("quedadas").update(patch as never).eq("id", d.quedadaId);
    if (error) throw new MpError("QUEDADAS.LOGISTICS_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Unirse por link (invite_code) ────────────────────────────────────────────
// Resuelve el código con admin client (las privadas están ocultas por RLS al
// no-miembro); el insert del participante va con el JWT del user (RLS lo permite).
export async function joinByInviteCode(
  input: unknown,
): Promise<ActionResult<{ ok: true; quedadaId: string; transactionId?: string }>> {
  return runAction(JoinByCodeSchema, input, async ({ code }) => {
    const userId = await requireUserId();
    const admin = getAdminClient();
    const { data: q } = await admin
      .from("quedadas")
      .select("id,status,fee_cents,club_id,max_players")
      .eq("invite_code", code)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.CODE_INVALID", "Link inválido", 404);
    if (q.status !== "registration_open") throw new MpError("QUEDADAS.CLOSED", "Inscripciones cerradas", 409);

    const supabase = await getServerClient();
    let transactionId: string | undefined;
    const fee = (q.fee_cents as number) ?? 0;
    if (fee > 0) {
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          club_id: (q.club_id as string | null) ?? null,
          kind: "quedada",
          ref_id: q.id,
          customer_user_id: userId,
          amount_cents: fee,
          currency: "USD",
          method: "transfer",
          status: "pending_proof",
          created_by: userId,
        })
        .select("id")
        .single();
      if (txErr || !tx) throw new MpError("QUEDADAS.TX_FAILED", txErr?.message ?? "tx error", 500);
      transactionId = tx.id as string;
    }
    const { error: pErr } = await supabase
      .from("quedada_participants")
      .upsert(
        { quedada_id: q.id, user_id: userId, status: "joined", paid_transaction_id: transactionId ?? null },
        { onConflict: "quedada_id,user_id" },
      );
    if (pErr) throw new MpError("QUEDADAS.JOIN_FAILED", pErr.message, 500);
    return { ok: true as const, quedadaId: q.id as string, transactionId };
  });
}

// ── Plantillas (hasta 5/usuario) ─────────────────────────────────────────────
// Config personal del wizard (RLS = dueño). El cap se valida acá.
type QuedadaTemplateRow = { id: string; name: string; config: unknown; created_at: string };

export async function listQuedadaTemplates(input: unknown): Promise<ActionResult<QuedadaTemplateRow[]>> {
  return runAction(ListQuedadaTemplatesSchema, input ?? {}, async () => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("quedada_templates")
      .select("id,name,config,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new MpError("QUEDADAS.TEMPLATES_FAILED", error.message, 500);
    return (data ?? []) as QuedadaTemplateRow[];
  });
}

export async function saveQuedadaTemplate(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(SaveQuedadaTemplateSchema, input, async (d) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { count } = await supabase
      .from("quedada_templates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= MAX_QUEDADA_TEMPLATES) {
      throw new MpError("QUEDADAS.TEMPLATE_LIMIT", `Máximo ${MAX_QUEDADA_TEMPLATES} plantillas. Borra una para guardar otra.`, 409);
    }
    const { data, error } = await supabase
      .from("quedada_templates")
      .insert({ user_id: userId, name: d.name, config: d.config } as never)
      .select("id")
      .single();
    if (error || !data) throw new MpError("QUEDADAS.TEMPLATE_SAVE_FAILED", error?.message ?? "No se pudo guardar", 500);
    return { id: data.id as string };
  });
}

export async function deleteQuedadaTemplate(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaTemplateIdSchema, input, async ({ templateId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    // RLS limita el delete a las plantillas del propio usuario.
    const { error } = await supabase.from("quedada_templates").delete().eq("id", templateId);
    if (error) throw new MpError("QUEDADAS.TEMPLATE_DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Motor de juego (v2): partidos por ronda + puntos ─────────────────────────
// Programación round-robin (método del círculo): genera rondas balanceadas.
function roundRobinSchedule(ids: string[]): { round: number; a: string; b: string }[] {
  const arr = [...ids];
  if (arr.length % 2 !== 0) arr.push("__BYE__");
  const n = arr.length;
  const half = n / 2;
  let list = arr.slice();
  const out: { round: number; a: string; b: string }[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") out.push({ round: r + 1, a, b });
    }
    list = [list[0], list[n - 1], ...list.slice(1, n - 1)];
  }
  return out;
}

export async function generateRoundRobin(input: unknown): Promise<ActionResult<{ created: number }>> {
  return runAction(GenerateRoundRobinSchema, input, async ({ quedadaId, categoryId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { count } = await supabase
      .from("quedada_matches")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);
    if ((count ?? 0) > 0) throw new MpError("QUEDADAS.MATCHES_EXIST", "Ya hay partidos en esta categoría. Bórralos antes de regenerar.", 409);

    const { data: pairs } = await supabase
      .from("quedada_pairs")
      .select("id")
      .eq("category_id", categoryId);
    const ids = (pairs ?? []).map((p) => p.id as string);
    if (ids.length < 2) throw new MpError("QUEDADAS.NOT_ENOUGH_PAIRS", "Necesitas al menos 2 parejas asignadas", 400);

    const sched = roundRobinSchedule(ids);
    const rows = sched.map((m) => ({
      quedada_id: quedadaId,
      category_id: categoryId,
      round_no: m.round,
      pair_a_id: m.a,
      pair_b_id: m.b,
      status: "scheduled",
    }));
    const { error } = await supabase.from("quedada_matches").insert(rows as never);
    if (error) throw new MpError("QUEDADAS.MATCHES_FAILED", error.message, 500);
    return { created: rows.length };
  });
}

export async function generateGroupStage(input: unknown): Promise<ActionResult<{ created: number; groups: number }>> {
  return runAction(GenerateGroupStageSchema, input, async ({ quedadaId, categoryId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data: q } = await supabase.from("quedadas").select("courts_count").eq("id", quedadaId).maybeSingle();
    const courts = (q?.courts_count as number | null) ?? 0;

    const { data: pairs } = await supabase.from("quedada_pairs").select("id").eq("category_id", categoryId);
    const ids = (pairs ?? []).map((p) => p.id as string);
    if (ids.length < 2) throw new MpError("QUEDADAS.NOT_ENOUGH_PAIRS", "Necesitas al menos 2 parejas asignadas", 400);

    // Nº de grupos = matemático: 1 grupo por cancha, pero cada grupo con ≥2
    // parejas (floor(parejas/2)). Sin canchas definidas → un solo grupo.
    const ng = Math.max(1, Math.min(courts > 0 ? courts : 1, Math.floor(ids.length / 2)));
    // Shuffle (al azar — anti-arreglo de partidos).
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const groups: string[][] = Array.from({ length: ng }, () => []);
    ids.forEach((id, idx) => groups[idx % ng].push(id));

    const rows: Record<string, unknown>[] = [];
    groups.forEach((gids, gi) => {
      const courtNo = courts > 0 ? (gi % courts) + 1 : gi + 1;
      for (const m of roundRobinSchedule(gids)) {
        rows.push({ quedada_id: quedadaId, category_id: categoryId, group_no: gi + 1, court_no: courtNo, round_no: m.round, pair_a_id: m.a, pair_b_id: m.b, status: "scheduled" });
      }
    });
    if (rows.length === 0) throw new MpError("QUEDADAS.TOO_MANY_GROUPS", "Demasiados grupos para las parejas que hay", 400);

    await supabase.from("quedada_matches").delete().eq("category_id", categoryId);
    const { error } = await supabase.from("quedada_matches").insert(rows as never);
    if (error) throw new MpError("QUEDADAS.MATCHES_FAILED", error.message, 500);
    return { created: rows.length, groups: ng };
  });
}

export async function addQuedadaMatch(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(AddQuedadaMatchSchema, input, async (d) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("quedada_matches")
      .insert({
        quedada_id: d.quedadaId,
        category_id: d.categoryId,
        round_no: d.roundNo,
        pair_a_id: d.pairAId,
        pair_b_id: d.pairBId,
        status: "scheduled",
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new MpError("QUEDADAS.MATCH_FAILED", error?.message ?? "No se pudo crear el partido", 500);
    return { id: data.id as string };
  });
}

export async function reportQuedadaMatch(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ReportQuedadaMatchSchema, input, async ({ matchId, pointsA, pointsB }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("quedada_matches")
      .update({ points_a: pointsA, points_b: pointsB, status: "played", updated_at: new Date().toISOString() } as never)
      .eq("id", matchId);
    if (error) throw new MpError("QUEDADAS.MATCH_REPORT_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function deleteQuedadaMatch(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaMatchIdSchema, input, async ({ matchId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase.from("quedada_matches").delete().eq("id", matchId);
    if (error) throw new MpError("QUEDADAS.MATCH_DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
