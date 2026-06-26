"use server";

// Quedadas (juego social) — server actions. v1: organizar + resultados casuales.
// Pagos por comprobante (kind='quedada', sin payout — el organizador maneja el
// dinero). Ranked y motor en vivo = v2. Ver docs/product + memoria del proyecto.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { notify } from "@/server/notifications/dispatch";
import { quedadaNotifyContext } from "@/server/notifications/enrich";
import {
  CreateQuedadaSchema,
  QuedadaIdSchema,
  JoinQuedadaSchema,
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
  SetParticipantCheckedInSchema,
  SetAllCheckedInSchema,
  RemindQuedadaPaymentSchema,
  QuedadaPlayerHistorySchema,
  MyQuedadasFinanceStatsSchema,
  UpdateQuedadaDetailsSchema,
  QuedadaLogisticsSchema,
  JoinByCodeSchema,
  ListQuedadaTemplatesSchema,
  SaveQuedadaTemplateSchema,
  QuedadaTemplateIdSchema,
  GenerateAmericanoRoundSchema,
  GenerateQuedadaRoundSchema,
  CreateManualQuedadaGameSchema,
  ReportGameSchema,
  RoundIdSchema,
  FinishQuedadaSchema,
  FinishQuedadaCategorySchema,
} from "@/lib/schemas/quedadas";
import { pickNextCourtMatch, type PriorGame, type AmericanoMode } from "@/lib/quedadas/americano";
import { getQuedadaEngine, rosterModeFor } from "@/lib/quedadas/engines/registry";
import { individualStandings, type GameForStandings } from "@/lib/quedadas/standings";
import { pairStandings } from "@/lib/quedadas/pair-standings";
import { sendSystemMessage } from "@/lib/messages/system";
import {
  ensureQuedadaConversationId,
} from "@/server/queries/quedada-chat";
import {
  announceQuedadaCategoryFinished,
  announceQuedadaRoundCompletedIfReady,
  announceQuedadaRoundPublished,
  announceQuedadaStatus,
} from "@/server/queries/quedada-chat-events";

// Cooldown del aviso de pago: no reenviar a la misma persona en < 30 min.
const PAYMENT_REMINDER_COOLDOWN_MS = 30 * 60 * 1000;

function moneyLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Valida que el caller pueda gestionar la quedada (creador o co-host) y devuelve
// los datos pedidos. Necesario para actions que mutan vía admin client (saltan RLS).
async function assertCanManageQuedada(
  quedadaId: string,
  userId: string,
  columns = "id,creator_id",
): Promise<Record<string, unknown>> {
  const supabase = await getServerClient();
  const { data: q, error } = await supabase
    .from("quedadas")
    .select(columns)
    .eq("id", quedadaId)
    .maybeSingle();
  if (error) throw new MpError("QUEDADAS.READ_FAILED", error.message, 500);
  if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
  const row = q as unknown as Record<string, unknown>;
  if (row.creator_id === userId) return row;
  const { data: co } = await supabase
    .from("quedada_cohosts")
    .select("user_id")
    .eq("quedada_id", quedadaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!co) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador o co-host gestiona pagos");
  return row;
}

async function assertQuedadaEditable(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  quedadaId: string,
): Promise<void> {
  const { data: q, error } = await supabase
    .from("quedadas")
    .select("status")
    .eq("id", quedadaId)
    .maybeSingle();
  if (error) throw new MpError("QUEDADAS.READ_FAILED", error.message, 500);
  if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
  const st = q.status as string;
  if (st === "finished" || st === "cancelled") {
    throw new MpError("QUEDADAS.LOCKED", "La quedada ya está cerrada; no se puede editar", 409);
  }
}

async function assertCategoryPlayable(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  categoryId: string,
): Promise<void> {
  const { data: cat, error } = await supabase
    .from("quedada_categories")
    .select("status,quedada_id")
    .eq("id", categoryId)
    .maybeSingle();
  if (error) throw new MpError("QUEDADAS.READ_FAILED", error.message, 500);
  if (!cat) throw new MpError("QUEDADAS.NOT_FOUND", "Categoría no encontrada", 404);
  if (cat.status === "finished") {
    throw new MpError("QUEDADAS.CATEGORY_FINISHED", "Esta categoría ya finalizó", 409);
  }
}

async function activateFirstQuedadaCategory(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  quedadaId: string,
): Promise<void> {
  const { data: cats } = await supabase
    .from("quedada_categories")
    .select("id,status")
    .eq("quedada_id", quedadaId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!cats || cats.length === 0) return;
  const hasActive = cats.some((c) => c.status === "active");
  if (hasActive) return;
  const firstOpen = cats.find((c) => c.status !== "finished");
  if (!firstOpen) return;
  await supabase.from("quedada_categories").update({ status: "active" } as never).eq("id", firstOpen.id);
}

async function writeCategoryPodiumRanks(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  quedadaId: string,
  categoryId: string,
): Promise<void> {
  const [{ data: qData }, { data: gamesData }, { data: pairsData }] = await Promise.all([
    supabase.from("quedadas").select("format,match_mode").eq("id", quedadaId).maybeSingle(),
    supabase
      .from("quedada_games")
      .select("category_id,side_a_p1,side_a_p2,side_b_p1,side_b_p2,points_a,points_b,status")
      .eq("quedada_id", quedadaId)
      .eq("category_id", categoryId),
    supabase.from("quedada_pairs").select("id,category_id,player_a_id,player_b_id").eq("quedada_id", quedadaId).eq("category_id", categoryId),
  ]);
  const games = (gamesData ?? []) as Array<GameForStandings>;
  const pairs = (pairsData ?? []) as Array<{ id: string; category_id: string; player_a_id: string; player_b_id: string | null }>;
  const engine = getQuedadaEngine((qData?.format as string | undefined) ?? "americano");
  const mode = ((qData?.match_mode as string) === "singles" ? "singles" : "doubles") as AmericanoMode;
  const standingsMode = engine.standingsMode(mode);
  const players = Array.from(
    new Set(pairs.flatMap((p) => [p.player_a_id, p.player_b_id]).filter((x): x is string => !!x)),
  );
  if (players.length === 0) return;
  const standings =
    standingsMode === "pair" ? pairStandings(games, pairs) : individualStandings(games, players);
  for (let idx = 0; idx < Math.min(3, standings.length); idx++) {
    const row = standings[idx];
    const rank = idx + 1;
    const ids = "playerIds" in row && Array.isArray(row.playerIds) ? row.playerIds : [row.userId];
    for (const uid of ids) {
      const { error: upErr } = await supabase
        .from("quedada_participants")
        .update({ final_rank: rank } as never)
        .eq("quedada_id", quedadaId)
        .eq("user_id", uid);
      if (upErr) throw new MpError("QUEDADAS.FINISH_FAILED", upErr.message, 500);
    }
  }
}


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
        target_points: d.targetPoints ?? null,
        payment_account: d.paymentAccount ?? null,
        prizes: d.prizes ?? null,
        rules: d.rules ?? [],
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
          target_points: c.targetPoints ?? null,
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
): Promise<ActionResult<{ ok: true }>> {
  return runAction(JoinQuedadaSchema, input, async ({ quedadaId, categoryId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: q, error: qErr } = await supabase
      .from("quedadas")
      .select("id,creator_id,visibility,status,max_players,fee_cents,club_id,format,match_mode,title,starts_at,location_text")
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

    // Cupo. En motores individuales el jugador puede elegir categoría al
    // inscribirse (1 jugador por slot). En formatos de
    // parejas fijas, la inscripción es a la quedada y el organizador arma los
    // slots después; así evitamos medio llenar una pareja con un solo jugador.
    const { data: catRows } = await supabase
      .from("quedada_categories")
      .select("id,max_slots")
      .eq("quedada_id", quedadaId);
    const categories = (catRows ?? []) as Array<{ id: string; max_slots: number | null }>;
    const matchMode = (q.match_mode as string) === "singles" ? "singles" : "doubles";
    const individualRoster = rosterModeFor(q.format as string, matchMode) === "individual";
    let assignSlot: { categoryId: string; slotNo: number } | null = null;

    if (categories.length > 0 && individualRoster) {
      if (!categoryId) throw new MpError("QUEDADAS.CATEGORY_REQUIRED", "Elige una categoría", 400);
      const cat = categories.find((c) => c.id === categoryId);
      if (!cat) throw new MpError("QUEDADAS.CATEGORY_NOT_FOUND", "Categoría inválida", 400);
      const maxSlots = cat.max_slots ?? 0;
      const { data: occ } = await supabase.from("quedada_pairs").select("slot_no").eq("category_id", categoryId);
      const taken = new Set(((occ ?? []) as Array<{ slot_no: number }>).map((p) => p.slot_no));
      let free = 0;
      const cap = maxSlots > 0 ? maxSlots : 999;
      for (let n = 1; n <= cap; n++) {
        if (!taken.has(n)) {
          free = n;
          break;
        }
      }
      if (free === 0) throw new MpError("QUEDADAS.CATEGORY_FULL", "Esa categoría está llena", 409);
      assignSlot = { categoryId, slotNo: free };
    } else if (categories.length > 0) {
      const perSlot = individualRoster ? 1 : 2;
      const capacity = categories.reduce((sum, c) => sum + ((c.max_slots ?? 0) * perSlot), 0);
      if (capacity > 0) {
        const { count } = await supabase
          .from("quedada_participants")
          .select("user_id", { count: "exact", head: true })
          .eq("quedada_id", quedadaId)
          .eq("status", "joined");
        if ((count ?? 0) >= capacity) {
          throw new MpError("QUEDADAS.FULL", "La quedada está llena", 409);
        }
      }
    } else if (q.max_players != null) {
      const { count } = await supabase
        .from("quedada_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("quedada_id", quedadaId)
        .eq("status", "joined");
      if ((count ?? 0) >= (q.max_players as number)) {
        throw new MpError("QUEDADAS.FULL", "La quedada está llena", 409);
      }
    }

    // Inscripción. El pago es OFFLINE (transferencia / en sitio); el organizador
    // marca 'paid' en la pestaña Pagos. No se crea transacción ni se cobra acá.
    const { error: pErr } = await supabase
      .from("quedada_participants")
      .upsert(
        { quedada_id: quedadaId, user_id: userId, status: "joined" } as never,
        { onConflict: "quedada_id,user_id" },
      );
    if (pErr) throw new MpError("QUEDADAS.JOIN_FAILED", pErr.message, 500);

    // Asignar el cupo en la categoría elegida. La RLS de quedada_pairs solo deja
    // mutar a can_manage, así que el insert va con admin client POST-validación
    // (ya validamos visibilidad + cupo libre) + setAuditActor para atribuir al jugador.
    if (assignSlot) {
      const admin = getAdminClient();
      await setAuditActor(admin, userId, "user");
      const { error: prErr } = await admin.from("quedada_pairs").insert({
        quedada_id: quedadaId,
        category_id: assignSlot.categoryId,
        slot_no: assignSlot.slotNo,
        player_a_id: userId,
        player_b_id: null,
      } as never);
      if (prErr) {
        // Compensación: no dejamos al jugador `joined` sin cupo. Si venía de una
        // invitación, restauramos ese estado; si era una inscripción nueva,
        // removemos la fila creada.
        if (existing) {
          await supabase
            .from("quedada_participants")
            .update({ status: existing.status } as never)
            .eq("quedada_id", quedadaId)
            .eq("user_id", userId);
        } else {
          await supabase
            .from("quedada_participants")
            .delete()
            .eq("quedada_id", quedadaId)
            .eq("user_id", userId);
        }
        throw new MpError("QUEDADAS.CATEGORY_FULL", "Ese cupo se acaba de ocupar, intenta de nuevo", 409);
      }
    }

    // Avisar al organizador (si no es él mismo).
    if (q.creator_id !== userId) {
      const { data: joiner } = await supabase
        .from("profiles")
        .select("display_name,username")
        .eq("id", userId)
        .maybeSingle();
      const joinerName =
        ((joiner?.display_name as string | null) ?? (joiner?.username as string | null) ?? "Un jugador").trim();
      const ctx = quedadaNotifyContext({
        id: quedadaId,
        title: q.title as string,
        starts_at: q.starts_at as string,
        location_text: (q.location_text as string | null) ?? null,
      });
      await notify({
        userId: q.creator_id as string,
        role: "user",
        kind: "quedada_joined",
        title: `${joinerName} se unió a tu quedada`,
        body: ctx.body,
        payload: { ...ctx.payload, joiner_name: joinerName, actor_name: joinerName },
      });
    }

    if ((q.status as string) !== "registration_open") {
      await ensureQuedadaConversationId(quedadaId, q.status as string, true);
    }

    return { ok: true as const };
  });
}

// ── leaveQuedada ─────────────────────────────────────────────────────────────
export async function leaveQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: gamesWithPlayer, error: gamesErr } = await supabase
      .from("quedada_games")
      .select("id")
      .eq("quedada_id", quedadaId)
      .or(`side_a_p1.eq.${userId},side_a_p2.eq.${userId},side_b_p1.eq.${userId},side_b_p2.eq.${userId}`)
      .limit(1);
    if (gamesErr) throw new MpError("QUEDADAS.LEAVE_FAILED", gamesErr.message, 500);
    if ((gamesWithPlayer ?? []).length > 0) {
      throw new MpError("QUEDADAS.LEAVE_LOCKED", "Ya hay partidos generados contigo. Pide al organizador que ajuste el roster.", 409);
    }

    const { error } = await supabase
      .from("quedada_participants")
      .update({ status: "cancelled" } as never)
      .eq("quedada_id", quedadaId)
      .eq("user_id", userId);
    if (error) throw new MpError("QUEDADAS.LEAVE_FAILED", error.message, 500);

    const admin = getAdminClient();
    await setAuditActor(admin, userId, "user");
    const { data: slots, error: slotsErr } = await admin
      .from("quedada_pairs")
      .select("id,player_a_id,player_b_id")
      .eq("quedada_id", quedadaId)
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`);
    if (slotsErr) throw new MpError("QUEDADAS.LEAVE_FAILED", slotsErr.message, 500);

    for (const slot of (slots ?? []) as Array<{ id: string; player_a_id: string; player_b_id: string | null }>) {
      if (slot.player_a_id === userId && slot.player_b_id) {
        const { error: moveErr } = await admin
          .from("quedada_pairs")
          .update({ player_a_id: slot.player_b_id, player_b_id: null } as never)
          .eq("id", slot.id);
        if (moveErr) throw new MpError("QUEDADAS.LEAVE_FAILED", moveErr.message, 500);
      } else if (slot.player_b_id === userId) {
        const { error: clearErr } = await admin
          .from("quedada_pairs")
          .update({ player_b_id: null } as never)
          .eq("id", slot.id);
        if (clearErr) throw new MpError("QUEDADAS.LEAVE_FAILED", clearErr.message, 500);
      } else {
        const { error: deleteErr } = await admin.from("quedada_pairs").delete().eq("id", slot.id);
        if (deleteErr) throw new MpError("QUEDADAS.LEAVE_FAILED", deleteErr.message, 500);
      }
    }

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
      .select("creator_id,title,starts_at,location_text")
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

    const ctx = quedadaNotifyContext({
      id: quedadaId,
      title: q.title as string,
      starts_at: q.starts_at as string,
      location_text: (q.location_text as string | null) ?? null,
    });
    await Promise.all(
      userIds.map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "quedada_invite",
          title: `Te invitaron a «${q.title as string}»`,
          body: ctx.body,
          payload: ctx.payload,
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
      .select("creator_id,status,title,starts_at,location_text")
      .eq("id", quedadaId)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.creator_id !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador cancela");
    if (q.status === "cancelled") return { ok: true as const };

    await announceQuedadaStatus(quedadaId, "cancelled");

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
    const ctx = quedadaNotifyContext({
      id: quedadaId,
      title: q.title as string,
      starts_at: q.starts_at as string,
      location_text: (q.location_text as string | null) ?? null,
    });
    await Promise.all(
      ((parts ?? []) as Array<{ user_id: string }>)
        .filter((p) => p.user_id !== userId)
        .map((p) =>
          notify({
            userId: p.user_id,
            role: "user",
            kind: "quedada_cancelled",
            title: `Se canceló «${q.title as string}»`,
            body: ctx.body,
            payload: ctx.payload,
          }),
        ),
    );
    return { ok: true as const };
  });
}

// ── deleteQuedada (creador) — solo si está cancelada (limpieza de la lista) ───
// Borrado duro: las tablas hijas (participants/categories/pairs/rounds/games/
// cohosts/reports) caen por `on delete cascade`. Se restringe a status
// 'cancelled' para no borrar por accidente una quedada activa.
export async function deleteQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: q } = await supabase
      .from("quedadas")
      .select("creator_id,status")
      .eq("id", quedadaId)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.creator_id !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador borra la quedada");
    if (q.status !== "cancelled") throw new MpError("QUEDADAS.DELETE_BLOCKED", "Solo puedes borrar quedadas canceladas. Cancélala primero.", 409);

    const { error } = await supabase.from("quedadas").delete().eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.DELETE_FAILED", error.message, 500);
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
      .select("creator_id,status")
      .eq("id", quedadaId)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (q.creator_id !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador carga resultados");
    if (q.status === "finished" || q.status === "cancelled") {
      throw new MpError("QUEDADAS.LOCKED", "La quedada ya está cerrada; no se puede editar", 409);
    }

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
export async function setQuedadaStatus(
  input: unknown,
): Promise<ActionResult<{ ok: true; bootstrapped?: { created: number; roundNo: number; byes: number } }>> {
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
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "live") {
      patch.live_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("quedadas")
      .update(patch as never)
      .eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.STATUS_FAILED", error.message, 500);

    if (status === "live" && (q.status as string) !== "live") {
      await activateFirstQuedadaCategory(supabase, quedadaId);
    }

    if (
      (status === "registration_closed" || status === "live") &&
      status !== (q.status as string)
    ) {
      await ensureQuedadaConversationId(quedadaId, status, true);
      if (status === "registration_closed") {
        await announceQuedadaStatus(quedadaId, "registration_closed");
      }
      if (status === "live") {
        await announceQuedadaStatus(quedadaId, "live");
      }
    }

    let bootstrapped: { created: number; roundNo: number; byes: number } | undefined;
    if (status === "live") {
      try {
        const b = await bootstrapQuedadaOnLive(supabase, userId, quedadaId);
        if (b) bootstrapped = b;
      } catch {
        // La quedada queda en vivo aunque falten jugadores/cupos para armar partidos.
      }
    }
    return bootstrapped ? { ok: true as const, bootstrapped } : { ok: true as const };
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

// ── getQuedadaManageData (lectura SOLO para panel de gestión) ────────────────
export async function getQuedadaManageData(input: unknown): Promise<ActionResult<unknown>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    // Primero verificamos permiso con datos mínimos. En quedadas abiertas, RLS
    // permite leer la fila base; no debemos devolver invite_code, banco, pagos ni
    // co-hosts a alguien que solo puede verla como jugador/espectador.
    const { data: permissionRow, error: permissionErr } = await supabase
      .from("quedadas")
      .select("id,creator_id")
      .eq("id", quedadaId)
      .maybeSingle();
    if (permissionErr) throw new MpError("QUEDADAS.READ_FAILED", permissionErr.message, 500);
    if (!permissionRow) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);

    const { data: cohostRows, error: cohostErr } = await supabase
      .from("quedada_cohosts")
      .select("user_id")
      .eq("quedada_id", quedadaId);
    if (cohostErr) throw new MpError("QUEDADAS.READ_FAILED", cohostErr.message, 500);

    const { data: adminRoleRows, error: adminRoleErr } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .limit(1);
    if (adminRoleErr) throw new MpError("QUEDADAS.READ_FAILED", adminRoleErr.message, 500);

    const canManage =
      (adminRoleRows ?? []).length > 0 ||
      (permissionRow.creator_id as string) === userId ||
      ((cohostRows ?? []) as Array<{ user_id: string }>).some((c) => c.user_id === userId);
    if (!canManage) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador o co-host puede ver la gestión");
    }

    const { data: q, error: qErr } = await supabase
      .from("quedadas")
      .select(
        "id,creator_id,title,description,format,match_mode,visibility,status,starts_at,live_at,updated_at,location_text,fee_cents,max_players,courts_count,hours,court_price_cents,target_points,perks_text,payment_account,prizes,rules,payment_info,prizes_text,invite_code,engine_mode",
      )
      .eq("id", quedadaId)
      .maybeSingle();
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);

    const [cats, pairs, parts, cohosts, rounds, games] = await Promise.all([
      supabase.from("quedada_categories").select("id,name,level_label,starts_at,court_label,max_slots,target_points,sort_order,status,finished_at").eq("quedada_id", quedadaId).order("sort_order", { ascending: true }),
      supabase.from("quedada_pairs").select("id,category_id,slot_no,player_a_id,player_b_id").eq("quedada_id", quedadaId).order("slot_no", { ascending: true }),
      supabase.from("quedada_participants").select("user_id,status,paid,checked_in_at,payment_reminded_at,points,final_rank,profiles!quedada_participants_user_id_fkey(display_name,username,avatar_url)").eq("quedada_id", quedadaId),
      supabase.from("quedada_cohosts").select("user_id,profiles!quedada_cohosts_user_id_fkey(display_name,username)").eq("quedada_id", quedadaId),
      supabase.from("quedada_rounds").select("id,category_id,round_no,status").eq("quedada_id", quedadaId).order("round_no", { ascending: true }),
      supabase.from("quedada_games").select("id,category_id,round_id,round_no,court_no,court_match_no,side_a_p1,side_a_p2,side_b_p1,side_b_p2,points_a,points_b,status,created_at,updated_at").eq("quedada_id", quedadaId).order("created_at", { ascending: true }),
    ]);

    return {
      quedada: q,
      isCreator: (q.creator_id as string) === userId,
      canManage,
      meUserId: userId,
      categories: cats.data ?? [],
      pairs: pairs.data ?? [],
      participants: parts.data ?? [],
      cohosts: cohosts.data ?? [],
      rounds: rounds.data ?? [],
      games: games.data ?? [],
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
    await assertQuedadaEditable(supabase, quedadaId);
    const { error } = await supabase
      .from("quedada_cohosts")
      .upsert({ quedada_id: quedadaId, user_id: userId, added_by: callerId }, { onConflict: "quedada_id,user_id" });
    if (error) throw new MpError("QUEDADAS.COHOST_FAILED", error.message, 500);
    const { data: qRow } = await supabase
      .from("quedadas")
      .select("id,title,starts_at,location_text")
      .eq("id", quedadaId)
      .maybeSingle();
    if (qRow) {
      const ctx = quedadaNotifyContext({
        id: quedadaId,
        title: qRow.title as string,
        starts_at: qRow.starts_at as string,
        location_text: (qRow.location_text as string | null) ?? null,
      });
      await notify({
        userId,
        role: "user",
        kind: "quedada_cohost_added",
        title: `Te hicieron co-host de «${qRow.title as string}»`,
        body: ctx.body,
        payload: ctx.payload,
      });
    } else {
      await notify({
        userId,
        role: "user",
        kind: "quedada_cohost_added",
        title: "Te hicieron co-host de una quedada",
        payload: { quedadaId },
      });
    }
    return { ok: true as const };
  });
}

export async function removeCohost(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(CohostSchema, input, async ({ quedadaId, userId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    await assertQuedadaEditable(supabase, quedadaId);
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
    await assertQuedadaEditable(supabase, d.quedadaId);
    const { data, error } = await supabase
      .from("quedada_categories")
      .insert({
        quedada_id: d.quedadaId,
        name: d.name,
        level_label: d.levelLabel ?? null,
        starts_at: d.startsAt ?? null,
        court_label: d.courtLabel ?? null,
        max_slots: d.maxSlots ?? null,
        target_points: d.targetPoints ?? null,
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
    const { data: cat } = await supabase.from("quedada_categories").select("quedada_id").eq("id", d.categoryId).maybeSingle();
    if (!cat) throw new MpError("QUEDADAS.NOT_FOUND", "Categoría no encontrada", 404);
    await assertQuedadaEditable(supabase, cat.quedada_id as string);
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.levelLabel !== undefined) patch.level_label = d.levelLabel;
    if (d.startsAt !== undefined) patch.starts_at = d.startsAt;
    if (d.courtLabel !== undefined) patch.court_label = d.courtLabel;
    if (d.maxSlots !== undefined) patch.max_slots = d.maxSlots;
    if (d.targetPoints !== undefined) patch.target_points = d.targetPoints;
    const { error } = await supabase.from("quedada_categories").update(patch as never).eq("id", d.categoryId);
    if (error) throw new MpError("QUEDADAS.CATEGORY_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function deleteCategory(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(CategoryIdSchema, input, async ({ categoryId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data: cat } = await supabase.from("quedada_categories").select("quedada_id").eq("id", categoryId).maybeSingle();
    if (!cat) throw new MpError("QUEDADAS.NOT_FOUND", "Categoría no encontrada", 404);
    await assertQuedadaEditable(supabase, cat.quedada_id as string);
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
    await assertQuedadaEditable(supabase, d.quedadaId);
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
    await assertQuedadaEditable(supabase, quedadaId);

    const { data: q } = await supabase.from("quedadas").select("match_mode,format").eq("id", quedadaId).maybeSingle();
    const matchMode = (q?.match_mode ?? "doubles") === "singles" ? "singles" : "doubles";
    const individualRoster = rosterModeFor((q?.format as string | undefined) ?? "americano", matchMode) === "individual";
    const isDoubles = !individualRoster && matchMode === "doubles";

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
    const { data: pair } = await supabase.from("quedada_pairs").select("quedada_id").eq("id", pairId).maybeSingle();
    if (pair) await assertQuedadaEditable(supabase, pair.quedada_id as string);
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
    await assertQuedadaEditable(supabase, quedadaId);
    const { error } = await supabase
      .from("quedada_participants")
      .update({ paid })
      .eq("quedada_id", quedadaId)
      .eq("user_id", userId);
    if (error) throw new MpError("QUEDADAS.PAID_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Check-in de asistencia (informativo; creador/co-host) ────────────────────
// No bloquea el motor ni el pago: solo registra quién llegó. RLS qp_update cubre
// el acceso (self/can_manage/admin); el organizador setea checked_in_by = él.
export async function setParticipantCheckedIn(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetParticipantCheckedInSchema, input, async ({ quedadaId, userId, checkedIn }) => {
    const callerId = await requireUserId();
    const supabase = await getServerClient();
    await assertQuedadaEditable(supabase, quedadaId);
    const { error } = await supabase
      .from("quedada_participants")
      .update({ checked_in_at: checkedIn ? new Date().toISOString() : null, checked_in_by: checkedIn ? callerId : null })
      .eq("quedada_id", quedadaId)
      .eq("user_id", userId);
    if (error) throw new MpError("QUEDADAS.CHECKIN_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function setAllCheckedIn(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetAllCheckedInSchema, input, async ({ quedadaId, checkedIn }) => {
    const callerId = await requireUserId();
    const supabase = await getServerClient();
    await assertQuedadaEditable(supabase, quedadaId);
    const { error } = await supabase
      .from("quedada_participants")
      .update({ checked_in_at: checkedIn ? new Date().toISOString() : null, checked_in_by: checkedIn ? callerId : null })
      .eq("quedada_id", quedadaId)
      .eq("status", "joined");
    if (error) throw new MpError("QUEDADAS.CHECKIN_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Aviso de pago a los pendientes (creador/co-host) ─────────────────────────
// Envía notif inapp + DM del sistema a los inscritos joined con paid=false.
// Cooldown de 30min por persona (payment_reminded_at). Devuelve cuántos se
// notificaron y cuántos se saltaron por cooldown. Best-effort por canal.
export async function remindQuedadaPayment(
  input: unknown,
): Promise<ActionResult<{ sent: number; skipped: number }>> {
  return runAction(RemindQuedadaPaymentSchema, input, async ({ quedadaId, userIds }) => {
    const callerId = await requireUserId();
    const supabase = await getServerClient();
    await assertQuedadaEditable(supabase, quedadaId);
    const q = await assertCanManageQuedada(quedadaId, callerId, "id,title,fee_cents,payment_account,status");
    const title = (q.title as string) ?? "una quedada";
    const fee = (q.fee_cents as number) ?? 0;
    const acct = q.payment_account as { bank?: string; accountNumber?: string } | null;

    const admin = getAdminClient();
    let query = admin
      .from("quedada_participants")
      .select("user_id,paid,payment_reminded_at,profiles!quedada_participants_user_id_fkey(display_name,username)")
      .eq("quedada_id", quedadaId)
      .eq("status", "joined")
      .eq("paid", false);
    if (userIds && userIds.length > 0) query = query.in("user_id", userIds);
    const { data: pend, error: pErr } = await query;
    if (pErr) throw new MpError("QUEDADAS.READ_FAILED", pErr.message, 500);

    const now = Date.now();
    const targets = (pend ?? []).filter((p) => {
      const last = p.payment_reminded_at ? new Date(p.payment_reminded_at as string).getTime() : 0;
      return now - last >= PAYMENT_REMINDER_COOLDOWN_MS;
    });
    const skipped = (pend ?? []).length - targets.length;
    if (targets.length === 0) return { sent: 0, skipped };

    const amountLabel = fee > 0 ? moneyLabel(fee) : "";
    const amountClause = amountLabel ? ` de ${amountLabel}` : "";
    const paymentClause = acct?.bank
      ? `Transfiere a ${acct.bank}${acct.accountNumber ? ` · ${acct.accountNumber}` : ""}. `
      : "";

    await setAuditActor(admin, callerId, "user");
    await Promise.all(
      targets.map(async (p) => {
        const uid = p.user_id as string;
        const prof = p.profiles as { display_name?: string; username?: string } | null;
        const firstName = (prof?.display_name ?? prof?.username ?? "jugador").split(" ")[0];
        // Notif inapp (campanita).
        await notify({
          userId: uid,
          role: "user",
          kind: "quedada_payment_reminder",
          title: `Pago pendiente · ${title}`,
          body: amountLabel ? `${title} · ${amountLabel}` : title,
          payload: { quedada_id: quedadaId, quedadaId, quedada_title: title, amount_label: amountLabel },
        });
        // DM del sistema (chat).
        await sendSystemMessage({
          recipientUserId: uid,
          kind: "quedada_payment_reminder",
          body: `Hola ${firstName}, te recordamos completar el pago de la quedada "${title}"${amountClause}. ${paymentClause}¡Nos vemos en cancha!`,
          payload: { quedada_id: quedadaId },
        });
      }),
    );
    // Marca el cooldown.
    const { error: upErr } = await admin
      .from("quedada_participants")
      .update({ payment_reminded_at: new Date().toISOString() })
      .eq("quedada_id", quedadaId)
      .in("user_id", targets.map((t) => t.user_id as string));
    if (upErr) console.error("[remindQuedadaPayment] cooldown update failed:", upErr.message);

    return { sent: targets.length, skipped };
  });
}

// ── Logística + bancarios + premios (solo creador) ───────────────────────────
export async function updateQuedadaLogistics(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(QuedadaLogisticsSchema, input, async (d) => {
    await requireUserId();
    const supabase = await getServerClient();
    await assertQuedadaEditable(supabase, d.quedadaId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (d.courtsCount !== undefined) patch.courts_count = d.courtsCount;
    if (d.hours !== undefined) patch.hours = d.hours;
    if (d.courtPriceCents !== undefined) patch.court_price_cents = d.courtPriceCents;
    if (d.targetPoints !== undefined) patch.target_points = d.targetPoints;
    if (d.paymentAccount !== undefined) patch.payment_account = d.paymentAccount;
    if (d.prizes !== undefined) patch.prizes = d.prizes;
    if (d.rules !== undefined) patch.rules = d.rules ?? [];
    if (d.paymentInfo !== undefined) patch.payment_info = d.paymentInfo;
    if (d.prizesText !== undefined) patch.prizes_text = d.prizesText;
    // engine_mode (rondas/rolling): solo se puede cambiar si aún NO hay games
    // (cambiarlo en vivo rompe el modelo de rondas/canchas).
    if (d.engineMode !== undefined) {
      if (d.engineMode === "rolling") {
        throw new MpError("QUEDADAS.ROLLING_WIP", "El modo continuo por cancha todavía no está disponible.", 400);
      }
      const { count } = await supabase
        .from("quedada_games")
        .select("id", { count: "exact", head: true })
        .eq("quedada_id", d.quedadaId);
      if ((count ?? 0) > 0) throw new MpError("QUEDADAS.ENGINE_LOCKED", "No puedes cambiar el motor con partidos ya generados.", 409);
      patch.engine_mode = d.engineMode;
    }
    const { error } = await supabase.from("quedadas").update(patch as never).eq("id", d.quedadaId);
    if (error) throw new MpError("QUEDADAS.LOGISTICS_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Editar datos generales (solo creador) ────────────────────────────────────
// Título, descripción, fecha, sede, visibilidad, cupo, perks. Formato y modo NO
// se editan. Si cambia la fecha → avisa a los inscritos (quedada_rescheduled).
export async function updateQuedadaDetails(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdateQuedadaDetailsSchema, input, async (d) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    await assertQuedadaEditable(supabase, d.quedadaId);
    const { data: q, error: qErr } = await supabase
      .from("quedadas")
      .select("creator_id,title,starts_at")
      .eq("id", d.quedadaId)
      .maybeSingle();
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if ((q.creator_id as string) !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador edita los datos");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if (d.startsAt !== undefined) patch.starts_at = d.startsAt;
    if (d.locationText !== undefined) patch.location_text = d.locationText;
    if (d.visibility !== undefined) patch.visibility = d.visibility;
    if (d.maxPlayers !== undefined) patch.max_players = d.maxPlayers;
    if (d.perks !== undefined) patch.perks_text = d.perks;

    const { error } = await supabase.from("quedadas").update(patch as never).eq("id", d.quedadaId);
    if (error) throw new MpError("QUEDADAS.DETAILS_FAILED", error.message, 500);

    // Reprogramación: si cambió la fecha, avisa a los inscritos joined.
    const dateChanged = d.startsAt !== undefined && d.startsAt !== (q.starts_at as string);
    if (dateChanged) {
      const admin = getAdminClient();
      const title = (d.title ?? (q.title as string)) || "una quedada";
      const startsLabel = new Date(d.startsAt as string).toLocaleString("es-EC", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
      const { data: parts } = await admin
        .from("quedada_participants")
        .select("user_id")
        .eq("quedada_id", d.quedadaId)
        .eq("status", "joined");
      const recipients = ((parts ?? []) as Array<{ user_id: string }>).filter((p) => p.user_id !== userId);
      if (recipients.length > 0) {
        await setAuditActor(admin, userId, "user");
        await Promise.all(
          recipients.map((p) =>
            notify({
              userId: p.user_id,
              role: "user",
              kind: "quedada_rescheduled",
              title: `«${title}» cambió de fecha`,
              body: `${title} · ${startsLabel}`,
              payload: { quedada_id: d.quedadaId, quedadaId: d.quedadaId, quedada_title: title, starts_label: startsLabel },
            }),
          ),
        );
      }
      await announceQuedadaStatus(
        d.quedadaId,
        "rescheduled",
        `«${title}» · nueva fecha: ${startsLabel}`,
      );
    }
    return { ok: true as const };
  });
}

// ── Regenerar el link de invitación (solo creador) ───────────────────────────
// Invalida el link viejo (`/q/[code]`) generando un invite_code nuevo.
export async function regenerateInviteCode(input: unknown): Promise<ActionResult<{ inviteCode: string }>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: q, error: qErr } = await supabase
      .from("quedadas")
      .select("creator_id")
      .eq("id", quedadaId)
      .maybeSingle();
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if ((q.creator_id as string) !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el organizador regenera el link");
    await assertQuedadaEditable(supabase, quedadaId);

    // gen_quedada_invite_code() vive en DB (mig 133); lo invocamos vía RPC.
    const admin = getAdminClient();
    const { data: code, error: rpcErr } = await admin.rpc("gen_quedada_invite_code");
    if (rpcErr || !code) throw new MpError("QUEDADAS.INVITE_FAILED", rpcErr?.message ?? "No se pudo generar el código", 500);
    const { error } = await supabase.from("quedadas").update({ invite_code: code } as never).eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.INVITE_FAILED", error.message, 500);
    return { inviteCode: code as string };
  });
}

// ── Unirse por link (invite_code) ────────────────────────────────────────────
// Resuelve el código con admin client (las privadas están ocultas por RLS al
// no-miembro); el insert del participante va con el JWT del user (RLS lo permite).
export async function joinByInviteCode(
  input: unknown,
): Promise<ActionResult<{ ok: true; quedadaId: string }>> {
  return runAction(JoinByCodeSchema, input, async ({ code }) => {
    const userId = await requireUserId();
    const admin = getAdminClient();
    const { data: q } = await admin
      .from("quedadas")
      .select("id,status")
      .eq("invite_code", code)
      .maybeSingle();
    if (!q) throw new MpError("QUEDADAS.CODE_INVALID", "Link inválido", 404);
    if (q.status !== "registration_open") throw new MpError("QUEDADAS.CLOSED", "Inscripciones cerradas", 409);

    // Pago offline (transferencia / en sitio); el organizador marca 'paid'. Sin
    // transacción. La asignación de categoría se hace luego desde la quedada.
    const supabase = await getServerClient();
    const { error: pErr } = await supabase
      .from("quedada_participants")
      .upsert({ quedada_id: q.id, user_id: userId, status: "joined" }, { onConflict: "quedada_id,user_id" });
    if (pErr) throw new MpError("QUEDADAS.JOIN_FAILED", pErr.message, 500);
    return { ok: true as const, quedadaId: q.id as string };
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

// ════════════════ Motor de juego (rediseño · registry por formato) ════════════
// Todos los formatos escriben sobre quedada_rounds + quedada_games; el engine solo
// decide cómo armar el draft de partidos y cómo se interpreta la tabla.

type RoundPlanResult = { created: number; roundNo: number; byes: number };

async function insertQuedadaRoundPlan(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  userId: string,
  quedadaId: string,
  categoryId: string,
): Promise<RoundPlanResult> {
  await assertQuedadaEditable(supabase, quedadaId);
  await assertCategoryPlayable(supabase, categoryId);
  const { data: q } = await supabase
    .from("quedadas")
    .select("format,match_mode,courts_count")
    .eq("id", quedadaId)
    .maybeSingle();
  if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
  const engine = getQuedadaEngine(q.format as string);
  if (!engine.canGenerateRound) {
    throw new MpError("QUEDADAS.FORMAT_MANUAL", "Este formato usa partidos manuales", 400);
  }

  const { data: pairs } = await supabase
    .from("quedada_pairs")
    .select("id,slot_no,player_a_id,player_b_id")
    .eq("category_id", categoryId);
  const mode = ((q.match_mode as string) === "singles" ? "singles" : "doubles") as AmericanoMode;
  const perGame = mode === "singles" ? 2 : 4;
  const players = Array.from(
    new Set((pairs ?? []).flatMap((p) => [p.player_a_id, p.player_b_id]).filter((x): x is string => !!x)),
  );
  if (players.length < perGame) {
    throw new MpError("QUEDADAS.NOT_ENOUGH_PLAYERS", `Necesitas al menos ${perGame} jugadores asignados`, 400);
  }

  const { data: prevGames } = await supabase
    .from("quedada_games")
    .select("round_no,side_a_p1,side_a_p2,side_b_p1,side_b_p2,points_a,points_b,status")
    .eq("category_id", categoryId);
  const prior = (prevGames ?? []) as PriorGame[];

  const courts = (q.courts_count as number | null) ?? 0;
  const plan = engine.planNextRound({
    pairs: ((pairs ?? []) as Array<{ id: string; slot_no: number; player_a_id: string; player_b_id: string | null }>).map((p) => ({
      id: p.id,
      slot_no: p.slot_no,
      player_a_id: p.player_a_id,
      player_b_id: p.player_b_id,
    })),
    prior,
    mode,
    courts,
  });
  if (!plan) throw new MpError("QUEDADAS.NOT_ENOUGH_PLAYERS", "No alcanza para armar una ronda", 400);

  const { data: roundRow, error: rErr } = await supabase
    .from("quedada_rounds")
    .insert({
      quedada_id: quedadaId,
      category_id: categoryId,
      round_no: plan.roundNo,
      status: "active",
      created_by: userId,
    } as never)
    .select("id")
    .single();
  if (rErr || !roundRow) throw new MpError("QUEDADAS.ROUND_FAILED", rErr?.message ?? "No se pudo crear la ronda", 500);
  const roundId = roundRow.id as string;

  const rows = plan.games.map((g) => ({
    quedada_id: quedadaId,
    category_id: categoryId,
    round_id: roundId,
    round_no: plan.roundNo,
    court_no: g.courtNo,
    side_a_p1: g.sideA[0],
    side_a_p2: g.sideA[1] ?? null,
    side_b_p1: g.sideB[0],
    side_b_p2: g.sideB[1] ?? null,
    status: "scheduled",
    created_by: userId,
  }));
  const { error: gErr } = await supabase.from("quedada_games").insert(rows as never);
  if (gErr) {
    await supabase.from("quedada_rounds").delete().eq("id", roundId);
    throw new MpError("QUEDADAS.GAMES_FAILED", gErr.message, 500);
  }
  await announceQuedadaRoundPublished(
    supabase,
    quedadaId,
    plan.roundNo,
    roundId,
    plan.byes.length,
    plan.byes,
  );
  return { created: rows.length, roundNo: plan.roundNo, byes: plan.byes.length };
}

/** Al pasar a `live`, arma la primera ronda si el motor lo permite y aún no hay partidos. */
async function bootstrapQuedadaOnLive(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  userId: string,
  quedadaId: string,
): Promise<RoundPlanResult | null> {
  const { data: q } = await supabase
    .from("quedadas")
    .select("format,engine_mode")
    .eq("id", quedadaId)
    .maybeSingle();
  if (!q || (q.engine_mode as string) === "rolling") return null;

  const engine = getQuedadaEngine(q.format as string);
  if (!engine.canGenerateRound) return null;

  const { count } = await supabase
    .from("quedada_games")
    .select("id", { count: "exact", head: true })
    .eq("quedada_id", quedadaId);
  if ((count ?? 0) > 0) return null;

  const { data: cat } = await supabase
    .from("quedada_categories")
    .select("id")
    .eq("quedada_id", quedadaId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  const fallback = cat
    ? cat
    : (
        await supabase
          .from("quedada_categories")
          .select("id")
          .eq("quedada_id", quedadaId)
          .neq("status", "finished")
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle()
      ).data;
  if (!fallback) return null;

  return insertQuedadaRoundPlan(supabase, userId, quedadaId, fallback.id as string);
}

export async function generateQuedadaRound(
  input: unknown,
): Promise<ActionResult<RoundPlanResult>> {
  return runAction(GenerateQuedadaRoundSchema, input, async ({ quedadaId, categoryId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    return insertQuedadaRoundPlan(supabase, userId, quedadaId, categoryId);
  });
}

export async function generateAmericanoRound(
  input: unknown,
): Promise<ActionResult<{ created: number; roundNo: number; byes: number }>> {
  return generateQuedadaRound(input);
}

export async function createManualQuedadaGame(input: unknown): Promise<ActionResult<{ ok: true; roundNo: number }>> {
  return runAction(CreateManualQuedadaGameSchema, input, async ({ quedadaId, categoryId, sideA, sideB, courtNo }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    await assertQuedadaEditable(supabase, quedadaId);
    const q = await assertCanManageQuedada(quedadaId, userId, "id,creator_id,format,match_mode");
    const engine = getQuedadaEngine(q.format as string);
    if (!engine.canManualGame) {
      throw new MpError("QUEDADAS.MANUAL_UNSUPPORTED", "Este formato se genera desde su motor", 400);
    }
    const mode = (q.match_mode as string) === "singles" ? "singles" : "doubles";
    const expectedSideSize = mode === "doubles" ? 2 : 1;
    if (sideA.length !== expectedSideSize || sideB.length !== expectedSideSize) {
      throw new MpError("QUEDADAS.INVALID_GAME", "El partido no coincide con el modo de la quedada", 400);
    }
    const repeated = new Set([...sideA, ...sideB]);
    if (repeated.size !== sideA.length + sideB.length) {
      throw new MpError("QUEDADAS.INVALID_GAME", "Un jugador no puede estar en ambos lados", 400);
    }
    const { data: categoryPairs, error: pairErr } = await supabase
      .from("quedada_pairs")
      .select("player_a_id,player_b_id")
      .eq("quedada_id", quedadaId)
      .eq("category_id", categoryId);
    if (pairErr) throw new MpError("QUEDADAS.READ_FAILED", pairErr.message, 500);
    const allowed = new Set(
      ((categoryPairs ?? []) as Array<{ player_a_id: string; player_b_id: string | null }>)
        .flatMap((p) => [p.player_a_id, p.player_b_id])
        .filter((id): id is string => !!id),
    );
    if ([...repeated].some((id) => !allowed.has(id))) {
      throw new MpError("QUEDADAS.INVALID_GAME", "Todos los jugadores deben estar en la categoría", 400);
    }
    const { data: prevGames } = await supabase
      .from("quedada_games")
      .select("round_no")
      .eq("category_id", categoryId);
    const roundNo = (prevGames ?? []).reduce((m, g) => Math.max(m, (g.round_no as number | null) ?? 0), 0) + 1;
    const { data: roundRow, error: rErr } = await supabase
      .from("quedada_rounds")
      .insert({
        quedada_id: quedadaId,
        category_id: categoryId,
        round_no: roundNo,
        status: "active",
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (rErr || !roundRow) throw new MpError("QUEDADAS.ROUND_FAILED", rErr?.message ?? "No se pudo crear el partido", 500);
    const { error: gErr } = await supabase.from("quedada_games").insert({
      quedada_id: quedadaId,
      category_id: categoryId,
      round_id: roundRow.id as string,
      round_no: roundNo,
      court_no: courtNo ?? null,
      side_a_p1: sideA[0],
      side_a_p2: sideA[1] ?? null,
      side_b_p1: sideB[0],
      side_b_p2: sideB[1] ?? null,
      status: "scheduled",
      created_by: userId,
    } as never);
    if (gErr) {
      await supabase.from("quedada_rounds").delete().eq("id", roundRow.id as string);
      throw new MpError("QUEDADAS.GAMES_FAILED", gErr.message, 500);
    }
    return { ok: true as const, roundNo };
  });
}

// Reporta el marcador de un game (organizador, directo, sin doble confirmación).
export async function reportGame(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ReportGameSchema, input, async ({ gameId, pointsA, pointsB }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data: gameRow } = await supabase
      .from("quedada_games")
      .select("quedada_id,category_id,round_no")
      .eq("id", gameId)
      .maybeSingle();
    if (gameRow) {
      await assertQuedadaEditable(supabase, gameRow.quedada_id as string);
      await assertCategoryPlayable(supabase, gameRow.category_id as string);
    }
    const { error } = await supabase
      .from("quedada_games")
      .update({ points_a: pointsA, points_b: pointsB, status: "played", updated_at: new Date().toISOString() } as never)
      .eq("id", gameId);
    if (error) throw new MpError("QUEDADAS.GAME_REPORT_FAILED", error.message, 500);
    if (gameRow) {
      await announceQuedadaRoundCompletedIfReady(
        supabase,
        gameRow.quedada_id as string,
        gameRow.category_id as string,
        gameRow.round_no as number | null,
      );
    }
    return { ok: true as const };
  });
}

// ── Motor ROLLING (continuo por cancha) ──────────────────────────────────────
// Asigna el SIGUIENTE partido en una cancha (rolling). Devuelve true si asignó,
// false si conviene esperar (sin banca) o no alcanzan jugadores. Calcula solo el
// pool libre (jugadores no ocupados en otras canchas) a partir de los games.
async function assignCourtMatch(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  args: { quedadaId: string; categoryId: string; courtNo: number; mode: AmericanoMode; userId: string; justFinished: string[] },
): Promise<boolean> {
  const { quedadaId, categoryId, courtNo, mode, userId, justFinished } = args;

  const { data: pairs } = await supabase
    .from("quedada_pairs")
    .select("player_a_id,player_b_id")
    .eq("category_id", categoryId);
  const players = Array.from(
    new Set((pairs ?? []).flatMap((p) => [p.player_a_id, p.player_b_id]).filter((x): x is string => !!x)),
  );

  const { data: allGames } = await supabase
    .from("quedada_games")
    .select("round_no,side_a_p1,side_a_p2,side_b_p1,side_b_p2,court_no,court_match_no,status")
    .eq("category_id", categoryId);
  const games = allGames ?? [];
  const prior: PriorGame[] = games.map((g) => ({
    round_no: (g.round_no as number | null) ?? 0,
    side_a_p1: g.side_a_p1,
    side_a_p2: g.side_a_p2,
    side_b_p1: g.side_b_p1,
    side_b_p2: g.side_b_p2,
  }));

  // Ocupados = jugadores en partidos EN JUEGO de OTRAS canchas.
  const scheduledOther = games.filter((g) => g.status === "scheduled" && g.court_no !== courtNo);
  const busy = scheduledOther
    .flatMap((g) => [g.side_a_p1, g.side_a_p2, g.side_b_p1, g.side_b_p2])
    .filter((x): x is string => !!x);
  const otherCourtsActive = scheduledOther.length > 0;

  const draft = pickNextCourtMatch(players, prior, busy, justFinished, mode, otherCourtsActive);
  if (!draft) return false;

  const courtMatchNo =
    games.filter((g) => g.court_no === courtNo).reduce((m, g) => Math.max(m, (g.court_match_no as number | null) ?? 0), 0) + 1;

  const { error } = await supabase.from("quedada_games").insert({
    quedada_id: quedadaId,
    category_id: categoryId,
    round_id: null,
    round_no: null,
    court_no: courtNo,
    court_match_no: courtMatchNo,
    side_a_p1: draft.sideA[0],
    side_a_p2: draft.sideA[1] ?? null,
    side_b_p1: draft.sideB[0],
    side_b_p2: draft.sideB[1] ?? null,
    status: "scheduled",
    created_by: userId,
  } as never);
  if (error) throw new MpError("QUEDADAS.GAMES_FAILED", error.message, 500);
  return true;
}

// Inicia el motor rolling: marca la quedada como 'rolling' y LLENA todas las
// canchas libres con un partido inicial (cada cancha = una ranura).
export async function startAmericanoRolling(
  input: unknown,
): Promise<ActionResult<{ filled: number }>> {
  return runAction(GenerateAmericanoRoundSchema, input, async () => {
    throw new MpError("QUEDADAS.ROLLING_WIP", "El modo continuo por cancha todavía no está disponible.", 400);
  });
}

// Reporta el marcador de un partido (rolling) Y asigna el siguiente en esa cancha.
export async function reportRollingGame(
  input: unknown,
): Promise<ActionResult<{ advanced: boolean }>> {
  return runAction(ReportGameSchema, input, async ({ gameId, pointsA, pointsB }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: game } = await supabase
      .from("quedada_games")
      .select("id,quedada_id,category_id,court_no,side_a_p1,side_a_p2,side_b_p1,side_b_p2")
      .eq("id", gameId)
      .maybeSingle();
    if (!game) throw new MpError("QUEDADAS.NOT_FOUND", "Partido no encontrado", 404);
    await assertQuedadaEditable(supabase, game.quedada_id as string);

    const { error: upErr } = await supabase
      .from("quedada_games")
      .update({ points_a: pointsA, points_b: pointsB, status: "played", updated_at: new Date().toISOString() } as never)
      .eq("id", gameId);
    if (upErr) throw new MpError("QUEDADAS.GAME_REPORT_FAILED", upErr.message, 500);

    const { data: q } = await supabase
      .from("quedadas")
      .select("format,match_mode,engine_mode")
      .eq("id", game.quedada_id)
      .maybeSingle();
    // Fuera de rolling americano (o sin cancha) no se auto-asigna.
    if (!q || (q.engine_mode as string) !== "rolling" || (q.format as string) !== "americano" || game.court_no == null) {
      return { advanced: false };
    }
    const mode = ((q.match_mode as string) === "singles" ? "singles" : "doubles") as AmericanoMode;
    const justFinished = [game.side_a_p1, game.side_a_p2, game.side_b_p1, game.side_b_p2].filter((x): x is string => !!x);

    const advanced = await assignCourtMatch(supabase, {
      quedadaId: game.quedada_id,
      categoryId: game.category_id,
      courtNo: game.court_no as number,
      mode,
      userId,
      justFinished,
    });
    return { advanced };
  });
}

// Borra una ronda completa (sus games caen por ON DELETE CASCADE). Para regenerar.
export async function deleteRound(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RoundIdSchema, input, async ({ roundId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data: round } = await supabase.from("quedada_rounds").select("quedada_id").eq("id", roundId).maybeSingle();
    if (round) await assertQuedadaEditable(supabase, round.quedada_id as string);
    const { error } = await supabase.from("quedada_rounds").delete().eq("id", roundId);
    if (error) throw new MpError("QUEDADAS.ROUND_DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// Cierra TODAS las categorías pendientes de una vez (atajo). Preferir
// finishQuedadaCategory cuando hay varias categorías en secuencia.
export async function finishQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(FinishQuedadaSchema, input, async ({ quedadaId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data: stRow } = await supabase.from("quedadas").select("status").eq("id", quedadaId).maybeSingle();
    if (!stRow) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (stRow.status === "finished" || stRow.status === "cancelled") {
      throw new MpError("QUEDADAS.LOCKED", "La quedada ya está cerrada", 409);
    }
    if (stRow.status !== "live") {
      throw new MpError("QUEDADAS.INVALID_STATUS", "Solo puedes finalizar una quedada en vivo", 409);
    }

    const { data: openCats } = await supabase
      .from("quedada_categories")
      .select("id")
      .eq("quedada_id", quedadaId)
      .neq("status", "finished")
      .order("sort_order", { ascending: true });
    const now = new Date().toISOString();
    for (const c of openCats ?? []) {
      await writeCategoryPodiumRanks(supabase, quedadaId, c.id as string);
      await supabase
        .from("quedada_categories")
        .update({ status: "finished", finished_at: now } as never)
        .eq("id", c.id);
    }

    const { error } = await supabase
      .from("quedadas")
      .update({ status: "finished", updated_at: now } as never)
      .eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.FINISH_FAILED", error.message, 500);
    await announceQuedadaStatus(quedadaId, "finished");
    return { ok: true as const };
  });
}

// Cierra la categoría activa, publica su podio y activa la siguiente (si hay).
// Si era la última, la quedada pasa a 'finished'.
export async function finishQuedadaCategory(
  input: unknown,
): Promise<ActionResult<{ ok: true; quedadaFinished: boolean; nextCategoryId: string | null; nextCategoryName: string | null }>> {
  return runAction(FinishQuedadaCategorySchema, input, async ({ quedadaId, categoryId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data: stRow } = await supabase.from("quedadas").select("status").eq("id", quedadaId).maybeSingle();
    if (!stRow) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);
    if (stRow.status === "finished" || stRow.status === "cancelled") {
      throw new MpError("QUEDADAS.LOCKED", "La quedada ya está cerrada", 409);
    }
    if (stRow.status !== "live") {
      throw new MpError("QUEDADAS.INVALID_STATUS", "Solo puedes finalizar categorías con la quedada en vivo", 409);
    }

    const { data: cat } = await supabase
      .from("quedada_categories")
      .select("id,status,name,sort_order")
      .eq("id", categoryId)
      .eq("quedada_id", quedadaId)
      .maybeSingle();
    if (!cat) throw new MpError("QUEDADAS.NOT_FOUND", "Categoría no encontrada", 404);
    if (cat.status === "finished") {
      throw new MpError("QUEDADAS.CATEGORY_FINISHED", "Esta categoría ya finalizó", 409);
    }
    if (cat.status !== "active") {
      throw new MpError("QUEDADAS.CATEGORY_NOT_ACTIVE", "Solo puedes finalizar la categoría activa", 409);
    }

    await writeCategoryPodiumRanks(supabase, quedadaId, categoryId);
    const now = new Date().toISOString();
    const { error: catErr } = await supabase
      .from("quedada_categories")
      .update({ status: "finished", finished_at: now } as never)
      .eq("id", categoryId);
    if (catErr) throw new MpError("QUEDADAS.FINISH_FAILED", catErr.message, 500);

    const { data: remaining } = await supabase
      .from("quedada_categories")
      .select("id,name,status,sort_order")
      .eq("quedada_id", quedadaId)
      .eq("status", "scheduled")
      .order("sort_order", { ascending: true })
      .limit(1);

    const next = remaining?.[0] as { id: string; name: string } | undefined;
    if (next) {
      await supabase.from("quedada_categories").update({ status: "active" } as never).eq("id", next.id);
      await announceQuedadaCategoryFinished(
        supabase,
        quedadaId,
        cat.name as string,
        next.name,
        false,
      );
      return {
        ok: true as const,
        quedadaFinished: false,
        nextCategoryId: next.id,
        nextCategoryName: next.name,
      };
    }

    const { error } = await supabase
      .from("quedadas")
      .update({ status: "finished", updated_at: now } as never)
      .eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.FINISH_FAILED", error.message, 500);
    await announceQuedadaCategoryFinished(
      supabase,
      quedadaId,
      cat.name as string,
      null,
      true,
    );
    return {
      ok: true as const,
      quedadaFinished: true,
      nextCategoryId: null,
      nextCategoryName: null,
    };
  });
}

// Lectura read-only para el JUGADOR inscrito (pantalla de detalle). No expone
// datos de gestión (invite_code, cohosts, payment_account) → anti-leak.
export async function getQuedadaPlayerView(input: unknown): Promise<ActionResult<unknown>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const { loadQuedadaPlayerView } = await import("@/server/queries/quedada-player-view");
    return loadQuedadaPlayerView(quedadaId);
  });
}

// Lectura para el MODAL de detalles (preview desde la tarjeta). Devuelve datos
// públicos de la quedada + reglas + premios + inscritos con su MPR y tag de team.
// El MPR/team son data pública (ranking/teams); se leen con admin client DESPUÉS
// de validar que el caller puede ver la quedada (RLS de quedadas), para no
// depender de la RLS por-fila de player_stats/team_members. Solo lectura → sin audit.
export async function getQuedadaDetails(input: unknown): Promise<ActionResult<unknown>> {
  return runAction(QuedadaIdSchema, input, async ({ quedadaId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: q, error: qErr } = await supabase
      .from("quedadas")
      .select(
        "id,creator_id,title,description,format,match_mode,visibility,status,starts_at,location_text,fee_cents,max_players,perks_text,prizes,rules,target_points",
      )
      .eq("id", quedadaId)
      .maybeSingle();
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);

    const [{ data: partsData }, { data: catsData }, { data: pairsData }] = await Promise.all([
      supabase.from("quedada_participants").select("user_id,status,profiles!quedada_participants_user_id_fkey(display_name,username)").eq("quedada_id", quedadaId).eq("status", "joined"),
      supabase.from("quedada_categories").select("id,name,max_slots,sort_order").eq("quedada_id", quedadaId).order("sort_order", { ascending: true }),
      supabase.from("quedada_pairs").select("category_id,player_a_id,player_b_id").eq("quedada_id", quedadaId),
    ]);
    const parts = (partsData ?? []) as Array<{
      user_id: string;
      profiles: { display_name: string | null; username: string | null } | null;
    }>;
    const userIds = parts.map((p) => p.user_id);

    // Ocupación por categoría (nº de cupos tomados = filas en quedada_pairs).
    const takenByCat = new Map<string, number>();
    const catsByUser = new Map<string, Set<string>>();
    for (const pr of (pairsData ?? []) as Array<{ category_id: string; player_a_id: string; player_b_id: string | null }>) {
      takenByCat.set(pr.category_id, (takenByCat.get(pr.category_id) ?? 0) + 1);
      for (const uid of [pr.player_a_id, pr.player_b_id]) {
        if (!uid) continue;
        const set = catsByUser.get(uid) ?? new Set<string>();
        set.add(pr.category_id);
        catsByUser.set(uid, set);
      }
    }
    const categories = ((catsData ?? []) as Array<{ id: string; name: string; max_slots: number | null }>).map((c) => ({
      id: c.id,
      name: c.name,
      maxSlots: c.max_slots,
      taken: takenByCat.get(c.id) ?? 0,
    }));

    // MPR (máx current_rating por jugador) + tag (3 letras del slug) del primer team.
    const mprById = new Map<string, number>();
    const teamTagById = new Map<string, string>();
    if (userIds.length > 0) {
      const admin = getAdminClient();
      const [{ data: stats }, { data: tms }] = await Promise.all([
        admin.from("player_stats").select("user_id,current_rating").in("user_id", userIds),
        admin
          .from("team_members")
          .select("user_id,joined_at,teams(slug)")
          .in("user_id", userIds)
          .order("joined_at", { ascending: true }),
      ]);
      for (const s of (stats ?? []) as Array<{ user_id: string; current_rating: number | null }>) {
        if (s.current_rating == null) continue;
        const prev = mprById.get(s.user_id);
        if (prev == null || s.current_rating > prev) mprById.set(s.user_id, s.current_rating);
      }
      for (const tm of (tms ?? []) as Array<{ user_id: string; teams: { slug: string | null } | null }>) {
        const slug = tm.teams?.slug;
        if (!teamTagById.has(tm.user_id) && slug) teamTagById.set(tm.user_id, slug.slice(0, 3).toUpperCase());
      }
    }

    const nameOf = (p: { display_name: string | null; username: string | null } | null): string =>
      p?.display_name || (p?.username ? `@${p.username}` : "Jugador");

    return {
      quedada: q,
      meUserId: userId,
      isMember: (q.creator_id as string) === userId || userIds.includes(userId),
      joinedCount: parts.length,
      categories,
      participants: parts.map((p) => ({
        userId: p.user_id,
        name: nameOf(p.profiles),
        mpr: mprById.get(p.user_id) ?? null,
        teamTag: teamTagById.get(p.user_id) ?? null,
        categoryIds: [...(catsByUser.get(p.user_id) ?? [])],
      })),
    };
  });
}

// ── Stats financieras del organizador (todas SUS quedadas) ───────────────────
// Read-only, scoped a creator_id = caller (RLS de quedadas lo permite). El
// recaudado es estimado: paidCount × fee_cents (pago offline, sin transacción).
export async function getMyQuedadasFinanceStats(input: unknown): Promise<ActionResult<{
  quedadasCount: number;
  totalCollectedCents: number;
  totalExpectedCents: number;
  pendingCents: number;
  totalJoined: number;
  totalPaid: number;
  payRatePct: number;
  avgAttendance: number;
}>> {
  return runAction(MyQuedadasFinanceStatsSchema, input ?? {}, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: qs, error: qErr } = await supabase
      .from("quedadas")
      .select("id,fee_cents")
      .eq("creator_id", userId);
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    const quedadas = (qs ?? []) as Array<{ id: string; fee_cents: number }>;
    if (quedadas.length === 0) {
      return { quedadasCount: 0, totalCollectedCents: 0, totalExpectedCents: 0, pendingCents: 0, totalJoined: 0, totalPaid: 0, payRatePct: 0, avgAttendance: 0 };
    }
    const feeById = new Map(quedadas.map((q) => [q.id, q.fee_cents ?? 0]));
    const { data: parts, error: pErr } = await supabase
      .from("quedada_participants")
      .select("quedada_id,paid")
      .in("quedada_id", quedadas.map((q) => q.id))
      .eq("status", "joined");
    if (pErr) throw new MpError("QUEDADAS.READ_FAILED", pErr.message, 500);

    let totalCollectedCents = 0, totalExpectedCents = 0, totalJoined = 0, totalPaid = 0;
    for (const p of (parts ?? []) as Array<{ quedada_id: string; paid: boolean }>) {
      const fee = feeById.get(p.quedada_id) ?? 0;
      totalJoined += 1;
      totalExpectedCents += fee;
      if (p.paid) { totalPaid += 1; totalCollectedCents += fee; }
    }
    return {
      quedadasCount: quedadas.length,
      totalCollectedCents,
      totalExpectedCents,
      pendingCents: totalExpectedCents - totalCollectedCents,
      totalJoined,
      totalPaid,
      payRatePct: totalJoined ? Math.round((totalPaid / totalJoined) * 100) : 0,
      avgAttendance: quedadas.length ? Math.round((totalJoined / quedadas.length) * 10) / 10 : 0,
    };
  });
}

// ── Ficha de un jugador en MIS quedadas (historial relacional) ───────────────
// Cuántas veces participó, cuánto pagó y % de veces que pagó, solo en las
// quedadas del caller. Read-only scoped a creator_id = caller.
export async function getQuedadaPlayerHistory(input: unknown): Promise<ActionResult<{
  appearances: number;
  timesPaid: number;
  totalPaidCents: number;
  payRatePct: number;
  attendanceRatePct: number;
  lastJoinedAt: string | null;
}>> {
  return runAction(QuedadaPlayerHistorySchema, input, async ({ playerUserId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: qs, error: qErr } = await supabase
      .from("quedadas")
      .select("id,fee_cents")
      .eq("creator_id", userId);
    if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
    const quedadas = (qs ?? []) as Array<{ id: string; fee_cents: number }>;
    if (quedadas.length === 0) {
      return { appearances: 0, timesPaid: 0, totalPaidCents: 0, payRatePct: 0, attendanceRatePct: 0, lastJoinedAt: null };
    }
    const feeById = new Map(quedadas.map((q) => [q.id, q.fee_cents ?? 0]));
    const { data: parts, error: pErr } = await supabase
      .from("quedada_participants")
      .select("quedada_id,paid,checked_in_at,joined_at")
      .in("quedada_id", quedadas.map((q) => q.id))
      .eq("user_id", playerUserId)
      .eq("status", "joined");
    if (pErr) throw new MpError("QUEDADAS.READ_FAILED", pErr.message, 500);
    const rows = (parts ?? []) as Array<{ quedada_id: string; paid: boolean; checked_in_at: string | null; joined_at: string }>;

    let timesPaid = 0, totalPaidCents = 0, attended = 0;
    let lastJoinedAt: string | null = null;
    for (const r of rows) {
      if (r.paid) { timesPaid += 1; totalPaidCents += feeById.get(r.quedada_id) ?? 0; }
      if (r.checked_in_at) attended += 1;
      if (!lastJoinedAt || r.joined_at > lastJoinedAt) lastJoinedAt = r.joined_at;
    }
    const appearances = rows.length;
    return {
      appearances,
      timesPaid,
      totalPaidCents,
      payRatePct: appearances ? Math.round((timesPaid / appearances) * 100) : 0,
      attendanceRatePct: appearances ? Math.round((attended / appearances) * 100) : 0,
      lastJoinedAt,
    };
  });
}
