import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { MpError } from "@/lib/api/errors";
import { buildWeightedPool, pickWeightedWinners } from "@/lib/giveaways/draw";
import { notify } from "@/server/notifications/dispatch";

type GiveawayRow = Record<string, unknown>;

async function loadGiveawayRow(giveawayId: string): Promise<GiveawayRow> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("club_giveaways").select("*").eq("id", giveawayId).maybeSingle();
  if (error) throw new MpError("GIVEAWAY.READ_FAILED", error.message, 500);
  if (!data) throw new MpError("GIVEAWAY.NOT_FOUND", "Sorteo no encontrado", 404);
  return data as GiveawayRow;
}

export type ExecuteGiveawayDrawResult = {
  winnerIds: string[];
  winnerNames: string[];
  skipped?: boolean;
  reason?: string;
};

/** Sorteo ponderado autoritativo — usado por staff y cron. */
export async function executeGiveawayDraw(
  giveawayId: string,
  actorUserId: string,
  options?: { force?: boolean },
): Promise<ExecuteGiveawayDrawResult> {
  const g = await loadGiveawayRow(giveawayId);
  const status = g.status as string;

  if (status === "drawn" || status === "cancelled") {
    return { winnerIds: [], winnerNames: [], skipped: true, reason: "already_closed" };
  }

  const force = options?.force === true;
  const closesAt = g.closes_at as string | null;
  if (!force && closesAt && new Date(closesAt).getTime() > Date.now()) {
    return { winnerIds: [], winnerNames: [], skipped: true, reason: "closes_at_pending" };
  }

  const drawAt = g.draw_at as string | null;
  if (!force && drawAt && new Date(drawAt).getTime() > Date.now()) {
    return { winnerIds: [], winnerNames: [], skipped: true, reason: "draw_at_pending" };
  }

  const admin = getAdminClient();
  const { data: entries, error: entErr } = await admin
    .from("club_giveaway_entries")
    .select("user_id,total_entries")
    .eq("giveaway_id", giveawayId);
  if (entErr) throw new MpError("GIVEAWAY.DRAW_FAILED", entErr.message, 500);

  const pool = buildWeightedPool(
    (entries ?? []).map((e) => ({
      userId: e.user_id as string,
      totalEntries: Number(e.total_entries) || 1,
    })),
  );
  if (pool.length === 0) {
    throw new MpError("GIVEAWAY.NO_ENTRIES", "No hay participantes para sortear", 409);
  }

  const winnerIds = pickWeightedWinners(pool, Number(g.max_winners) || 1);
  const now = new Date().toISOString();
  const clubId = g.club_id as string;
  const title = g.title as string;
  const prizeLabel = g.prize_label as string;

  await admin.from("club_giveaways").update({ status: "drawn", drawn_at: now }).eq("id", giveawayId);

  let rank = 1;
  const winnerNames: string[] = [];
  for (const wid of winnerIds) {
    await admin.from("club_giveaway_winners").insert({
      giveaway_id: giveawayId,
      user_id: wid,
      rank,
      notified_at: now,
    } as never);
    rank += 1;
    const { data: p } = await admin.from("profiles").select("display_name").eq("id", wid).maybeSingle();
    const name = (p?.display_name as string | null) ?? "Jugador";
    winnerNames.push(name);
    await notify({
      userId: wid,
      role: "user",
      kind: "giveaway_won",
      title: "¡Ganaste un sorteo!",
      body: `Premio: ${prizeLabel}`,
      payload: {
        club_id: clubId,
        giveaway_id: giveawayId,
      },
    });
  }

  const resultBody = `Ganador${winnerNames.length !== 1 ? "es" : ""}: ${winnerNames.join(", ")} · ${prizeLabel}`;

  await admin.from("club_feed_posts").insert({
    club_id: clubId,
    kind: "result",
    ref_id: giveawayId,
    title: `Resultado · ${title}`,
    body: resultBody,
    badge: "RESULTADO",
    cta_label: "Ver sorteo",
    cta_href: `/dashboard/clubes/giveaways/${giveawayId}`,
    payload: { winner_ids: winnerIds, winner_names: winnerNames },
    published_by: actorUserId,
    published_at: now,
  } as never);

  if (g.conversation_id) {
    await admin.from("messages").insert({
      conversation_id: g.conversation_id as string,
      sender_id: actorUserId,
      body: `Sorteo "${title}" — ganador(es): ${winnerNames.join(", ")}`,
      kind: "giveaway_result",
      payload: { giveaway_id: giveawayId, winner_ids: winnerIds },
    } as never);
  }

  return { winnerIds, winnerNames };
}

/** Cierra sorteos cuya ventana de entradas ya pasó. */
export async function closeExpiredGiveaways(): Promise<number> {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("club_giveaways")
    .update({ status: "closed" })
    .in("status", ["open", "closing"])
    .lte("closes_at", now)
    .not("closes_at", "is", null)
    .select("id");
  if (error) {
    console.error("[closeExpiredGiveaways]", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/** Sorteos con draw_at vencido listos para ejecutar. */
export async function listDueGiveawayDraws(limit = 20): Promise<string[]> {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("club_giveaways")
    .select("id,created_by,closes_at,draw_at,status")
    .in("status", ["open", "closing", "closed"])
    .not("draw_at", "is", null)
    .lte("draw_at", now)
    .order("draw_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[listDueGiveawayDraws]", error.message);
    return [];
  }
  return (data ?? [])
    .filter((row) => {
      const closes = row.closes_at as string | null;
      if (closes && new Date(closes).getTime() > Date.now()) return false;
      return true;
    })
    .map((row) => row.id as string);
}

export async function getGiveawayCreatedBy(giveawayId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin.from("club_giveaways").select("created_by").eq("id", giveawayId).maybeSingle();
  return (data?.created_by as string | null) ?? null;
}
