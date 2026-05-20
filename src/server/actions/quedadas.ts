"use server";

// Quedadas (juego social) — server actions. v1: organizar + resultados casuales.
// Pagos por comprobante (kind='quedada', sin payout — el organizador maneja el
// dinero). Ranked y motor en vivo = v2. Ver docs/product + memoria del proyecto.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { notify } from "@/server/notifications/dispatch";
import {
  CreateQuedadaSchema,
  QuedadaIdSchema,
  InviteToQuedadaSchema,
  SetQuedadaResultsSchema,
  ReportQuedadaSchema,
} from "@/lib/schemas/quedadas";

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
    // Tablas de quedadas aún no están en los tipos generados → cliente sin tipar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;
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
        ranked: false, // v1: siempre casual
      } as never)
      .select("id")
      .single();
    if (error || !row) throw new MpError("QUEDADAS.CREATE_FAILED", error?.message ?? "No se pudo crear", 500);

    // El organizador queda inscrito automáticamente.
    await supabase
      .from("quedada_participants")
      .insert({ quedada_id: row.id, user_id: userId, status: "joined" } as never);

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
    // Tablas de quedadas aún no están en los tipos generados → cliente sin tipar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;

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
    // Tablas de quedadas aún no están en los tipos generados → cliente sin tipar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;
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
    // Tablas de quedadas aún no están en los tipos generados → cliente sin tipar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;
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
    // Tablas de quedadas aún no están en los tipos generados → cliente sin tipar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;
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
    // Tablas de quedadas aún no están en los tipos generados → cliente sin tipar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;
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

// ── reportQuedada (soporte/moderación) ───────────────────────────────────────
export async function reportQuedada(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ReportQuedadaSchema, input, async ({ quedadaId, reason }) => {
    const userId = await requireUserId();
    // Tablas de quedadas aún no están en los tipos generados → cliente sin tipar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;
    const { error } = await supabase
      .from("quedada_reports")
      .insert({ quedada_id: quedadaId, reporter_id: userId, reason } as never);
    if (error) throw new MpError("QUEDADAS.REPORT_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
