"use server";

// Comunicación de club: anuncios broadcast + giveaways + helpers de canal.
// Ver docs/product/09-club-comms-giveaways.md
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { notify } from "@/server/notifications/dispatch";
import { isClubMembershipActive } from "@/lib/clubs/membership";
import { isGiveawayEligible } from "@/lib/clubs/comms-eligibility";
import {
  ClubIdOnlySchema,
  PublishClubAnnouncementSchema,
  CreateClubGiveawaySchema,
  GiveawayIdSchema,
  EnterClubGiveawaySchema,
  ClubGiveawayViewSchema,
  type ClubGiveawayView,
} from "@/lib/schemas/club-comms";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

async function assertAnnouncementsPublisher(clubId: string): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data: assignments, error: raErr } = await supabase
    .from("role_assignments")
    .select("role, club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (raErr) throw new MpError("CLUB_COMMS.AUTH_FAILED", raErr.message, 500);

  const canPublish = (assignments ?? []).some(
    (row) =>
      row.role === "admin" ||
      ((row.role === "owner" || row.role === "manager") && row.club_id === clubId),
  );
  if (!canPublish) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "Solo owner o manager pueden publicar anuncios");
  }
  return userId;
}

type ClubChannelIds = {
  communityId: string | null;
  announcementsId: string | null;
};

export async function getClubChannelIds(input: unknown): Promise<ActionResult<ClubChannelIds>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("id,kind")
      .eq("club_id", clubId)
      .in("kind", ["club_channel", "club_announcements"]);
    if (error) throw new MpError("CLUB_COMMS.READ_FAILED", error.message, 500);
    let communityId: string | null = null;
    let announcementsId: string | null = null;
    for (const row of data ?? []) {
      if (row.kind === "club_channel") communityId = row.id as string;
      if (row.kind === "club_announcements") announcementsId = row.id as string;
    }
    return { communityId, announcementsId };
  });
}

async function ensureAnnouncementConversation(clubId: string, userId: string): Promise<string> {
  const admin = getAdminClient();
  const { data: rows, error: rpcErr } = await (admin as any).rpc("fn_ensure_club_channels", {
    p_club_id: clubId,
  });
  if (rpcErr) throw new MpError("CLUB_COMMS.CHANNEL_FAILED", rpcErr.message, 500);
  const annId = (rows?.[0]?.announcements_id as string | undefined) ?? null;
  if (annId) return annId;

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("club_id", clubId)
    .eq("kind", "club_announcements")
    .maybeSingle();
  if (conv?.id) return conv.id as string;
  throw new MpError("CLUB_COMMS.CHANNEL_MISSING", "Canal de anuncios no disponible", 500);
}

async function notifyAnnouncementAudience(args: {
  clubId: string;
  conversationId: string;
  clubName: string;
  title: string;
  excludeUserId: string;
}): Promise<number> {
  const admin = getAdminClient();
  const { data: members, error } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", args.conversationId)
    .is("left_at", null);
  if (error) {
    console.error("[notifyAnnouncementAudience]", error.message);
    return 0;
  }
  let sent = 0;
  for (const row of members ?? []) {
    const uid = row.user_id as string;
    if (uid === args.excludeUserId) continue;
    const id = await notify({
      userId: uid,
      role: "user",
      kind: "club_announcement_new",
      title: args.title,
      body: `${args.clubName} publicó un anuncio`,
      payload: {
        club_id: args.clubId,
        conversation_id: args.conversationId,
        club_name: args.clubName,
      },
    });
    if (id) sent += 1;
  }
  return sent;
}

export async function publishClubAnnouncement(
  input: unknown,
): Promise<ActionResult<{ messageId: string; conversationId: string }>> {
  return runAction(PublishClubAnnouncementSchema, input, async (data) => {
    const userId = await assertAnnouncementsPublisher(data.clubId);
    const convId = await ensureAnnouncementConversation(data.clubId, userId);
    const supabase = await getServerClient();

    const { data: msg, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        sender_id: userId,
        body: data.body,
        kind: "announcement_post",
        payload: { title: data.title },
      } as never)
      .select("id")
      .single();
    if (error || !msg) {
      throw new MpError("CLUB_COMMS.PUBLISH_FAILED", error?.message ?? "No se pudo publicar", 500);
    }

    const admin = getAdminClient();
    const { data: club } = await admin.from("clubs").select("name").eq("id", data.clubId).maybeSingle();
    const clubName = (club?.name as string | null) ?? "Tu club";
    const now = new Date().toISOString();

    await admin.from("club_feed_posts").insert({
      club_id: data.clubId,
      kind: "notice",
      title: data.title,
      body: data.body,
      badge: "AVISO",
      payload: { source: "announcement" },
      published_by: userId,
      published_at: now,
    } as never);

    await notifyAnnouncementAudience({
      clubId: data.clubId,
      conversationId: convId,
      clubName,
      title: data.title,
      excludeUserId: userId,
    });

    return { messageId: msg.id as string, conversationId: convId };
  });
}

export async function listClubGiveaways(input: unknown): Promise<ActionResult<ClubGiveawayView[]>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    const userId = await requireUserId();
    await assertAnnouncementsPublisher(clubId);
    const admin = getAdminClient();
    const { data: rows, error } = await (admin as any)
      .from("club_giveaways")
      .select("id,club_id,conversation_id,message_id,title,description,prize_label,eligibility,status,max_winners,opens_at,closes_at,drawn_at")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new MpError("CLUB_COMMS.READ_FAILED", error.message, 500);

    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    const entryCounts = new Map<string, number>();
    if (ids.length) {
      const { data: entries } = await admin.from("club_giveaway_entries").select("giveaway_id").in("giveaway_id", ids);
      for (const e of entries ?? []) {
        const gid = e.giveaway_id as string;
        entryCounts.set(gid, (entryCounts.get(gid) ?? 0) + 1);
      }
    }

    return Promise.all(
      (rows ?? []).map(async (row: Record<string, unknown>) => {
        const gid = row.id as string;
        const { data: winners } = await admin
          .from("club_giveaway_winners")
          .select("user_id,rank,profiles(display_name)")
          .eq("giveaway_id", gid)
          .order("rank", { ascending: true });
        const { data: myEntry } = await admin
          .from("club_giveaway_entries")
          .select("user_id")
          .eq("giveaway_id", gid)
          .eq("user_id", userId)
          .maybeSingle();

        return ClubGiveawayViewSchema.parse({
          id: gid,
          clubId: row.club_id,
          conversationId: row.conversation_id,
          messageId: row.message_id ?? null,
          title: row.title,
          description: row.description ?? null,
          prizeLabel: row.prize_label,
          eligibility: row.eligibility,
          status: row.status,
          maxWinners: row.max_winners,
          opensAt: row.opens_at ?? null,
          closesAt: row.closes_at ?? null,
          drawnAt: row.drawn_at ?? null,
          entryCount: entryCounts.get(gid) ?? 0,
          hasEntered: !!myEntry,
          winners: (winners ?? []).map((w: Record<string, unknown>) => ({
            userId: w.user_id,
            rank: w.rank,
            displayName: ((w.profiles as { display_name?: string } | null)?.display_name) ?? "Jugador",
          })),
        });
      }),
    );
  });
}

export async function createClubGiveaway(
  input: unknown,
): Promise<ActionResult<{ giveawayId: string; conversationId: string; messageId: string | null }>> {
  return runAction(CreateClubGiveawaySchema, input, async (data) => {
    const userId = await assertAnnouncementsPublisher(data.clubId);
    const convId = await ensureAnnouncementConversation(data.clubId, userId);
    const admin = getAdminClient();
    const now = new Date();
    const status = data.publish ? "open" : "draft";
    const opensAt = data.publish ? now.toISOString() : null;

    const { data: giveaway, error } = await (admin as any)
      .from("club_giveaways")
      .insert({
        club_id: data.clubId,
        conversation_id: convId,
        created_by: userId,
        title: data.title,
        description: data.description ?? null,
        prize_label: data.prizeLabel,
        eligibility: data.eligibility,
        max_winners: data.maxWinners,
        status,
        opens_at: opensAt,
        closes_at: data.closesAt ?? null,
      })
      .select("id")
      .single();
    if (error || !giveaway) {
      throw new MpError("CLUB_COMMS.GIVEAWAY_FAILED", error?.message ?? "No se pudo crear el sorteo", 500);
    }

    let messageId: string | null = null;
    if (data.publish) {
      const { data: msg, error: msgErr } = await admin
        .from("messages")
        .insert({
          conversation_id: convId,
          sender_id: userId,
          body: data.description ?? data.title,
          kind: "giveaway_post",
          payload: {
            title: data.title,
            giveaway_id: giveaway.id,
            prize_label: data.prizeLabel,
          },
        } as never)
        .select("id")
        .single();
      if (msgErr || !msg) {
        throw new MpError("CLUB_COMMS.GIVEAWAY_POST_FAILED", msgErr?.message ?? "No se pudo publicar el sorteo", 500);
      }
      messageId = msg.id as string;
      await (admin as any).from("club_giveaways").update({ message_id: messageId }).eq("id", giveaway.id);

      const { data: club } = await admin.from("clubs").select("name").eq("id", data.clubId).maybeSingle();
      await notifyAnnouncementAudience({
        clubId: data.clubId,
        conversationId: convId,
        clubName: (club?.name as string | null) ?? "Tu club",
        title: `Sorteo: ${data.title}`,
        excludeUserId: userId,
      });
    }

    return { giveawayId: giveaway.id as string, conversationId: convId, messageId };
  });
}

async function loadGiveawayContext(giveawayId: string) {
  const admin = getAdminClient();
  const { data: g, error } = await (admin as any)
    .from("club_giveaways")
    .select("id,club_id,conversation_id,eligibility,status,max_winners,closes_at,title,prize_label")
    .eq("id", giveawayId)
    .maybeSingle();
  if (error) throw new MpError("CLUB_COMMS.READ_FAILED", error.message, 500);
  if (!g) throw new MpError("CLUB_COMMS.NOT_FOUND", "Sorteo no encontrado", 404);
  return g as {
    id: string;
    club_id: string;
    conversation_id: string;
    eligibility: "followers" | "members" | "all";
    status: string;
    max_winners: number;
    closes_at: string | null;
    title: string;
    prize_label: string;
  };
}

async function userGiveawayFlags(userId: string, clubId: string) {
  const admin = getAdminClient();
  const [{ data: follower }, { data: membership }] = await Promise.all([
    admin.from("club_followers").select("club_id").eq("club_id", clubId).eq("user_id", userId).maybeSingle(),
    (admin as any)
      .from("club_memberships")
      .select("status,expires_at")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const isFollower = !!follower;
  const isVipActive = membership
    ? isClubMembershipActive({
        status: membership.status as string,
        expires_at: membership.expires_at as string | null,
      })
    : false;
  return { isFollower, isVipActive };
}

export async function enterClubGiveaway(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(EnterClubGiveawaySchema, input, async ({ giveawayId }) => {
    const userId = await requireUserId();
    const g = await loadGiveawayContext(giveawayId);
    if (g.status !== "open") {
      throw new MpError("CLUB_COMMS.GIVEAWAY_CLOSED", "Este sorteo ya no acepta participantes", 409);
    }
    if (g.closes_at && new Date(g.closes_at) < new Date()) {
      throw new MpError("CLUB_COMMS.GIVEAWAY_CLOSED", "El sorteo ya cerró", 409);
    }

    const flags = await userGiveawayFlags(userId, g.club_id);
    if (!isGiveawayEligible({ eligibility: g.eligibility, ...flags })) {
      throw new MpError("CLUB_COMMS.NOT_ELIGIBLE", "No cumples los requisitos para participar", 403);
    }

    const supabase = await getServerClient();
    const { error } = await supabase.from("club_giveaway_entries").insert({
      giveaway_id: giveawayId,
      user_id: userId,
    } as never);
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        return { ok: true as const };
      }
      throw new MpError("CLUB_COMMS.ENTER_FAILED", error.message, 500);
    }
    return { ok: true as const };
  });
}

export async function getClubGiveaway(
  input: unknown,
): Promise<ActionResult<ClubGiveawayView>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    const userId = await requireUserId();
    const admin = getAdminClient();
    const g = await loadGiveawayContext(giveawayId);
    const { data: row } = await (admin as any)
      .from("club_giveaways")
      .select("id,club_id,conversation_id,message_id,title,description,prize_label,eligibility,status,max_winners,opens_at,closes_at,drawn_at")
      .eq("id", giveawayId)
      .maybeSingle();
    const { count } = await admin
      .from("club_giveaway_entries")
      .select("*", { count: "exact", head: true })
      .eq("giveaway_id", giveawayId);
    const { data: myEntry } = await admin
      .from("club_giveaway_entries")
      .select("user_id")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: winners } = await admin
      .from("club_giveaway_winners")
      .select("user_id,rank,profiles(display_name)")
      .eq("giveaway_id", giveawayId)
      .order("rank", { ascending: true });

    return ClubGiveawayViewSchema.parse({
      id: row.id,
      clubId: row.club_id,
      conversationId: row.conversation_id,
      messageId: row.message_id ?? null,
      title: row.title,
      description: row.description ?? null,
      prizeLabel: row.prize_label,
      eligibility: row.eligibility,
      status: row.status,
      maxWinners: row.max_winners,
      opensAt: row.opens_at ?? null,
      closesAt: row.closes_at ?? null,
      drawnAt: row.drawn_at ?? null,
      entryCount: count ?? 0,
      hasEntered: !!myEntry,
      winners: (winners ?? []).map((w: Record<string, unknown>) => ({
        userId: w.user_id,
        rank: w.rank,
        displayName: ((w.profiles as { display_name?: string } | null)?.display_name) ?? "Jugador",
      })),
    });
  });
}

/** Sorteo manual (owner/manager). Fisher-Yates en servidor. */
export async function drawClubGiveawayWinners(
  input: unknown,
): Promise<ActionResult<{ winnerIds: string[] }>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    const userId = await requireUserId();
    const g = await loadGiveawayContext(giveawayId);
    await assertAnnouncementsPublisher(g.club_id);

    if (g.status === "drawn" || g.status === "cancelled") {
      throw new MpError("CLUB_COMMS.ALREADY_DRAWN", "Este sorteo ya fue cerrado", 409);
    }

    const admin = getAdminClient();
    const { data: entries, error: entErr } = await admin
      .from("club_giveaway_entries")
      .select("user_id")
      .eq("giveaway_id", giveawayId);
    if (entErr) throw new MpError("CLUB_COMMS.DRAW_FAILED", entErr.message, 500);

    const pool = (entries ?? []).map((e) => e.user_id as string);
    if (pool.length === 0) {
      throw new MpError("CLUB_COMMS.NO_ENTRIES", "No hay participantes para sortear", 409);
    }

    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const winnerIds = pool.slice(0, Math.min(g.max_winners, pool.length));
    const now = new Date().toISOString();

    await (admin as any).from("club_giveaways").update({ status: "drawn", drawn_at: now }).eq("id", giveawayId);

    let rank = 1;
    for (const wid of winnerIds) {
      await admin.from("club_giveaway_winners").insert({
        giveaway_id: giveawayId,
        user_id: wid,
        rank,
        notified_at: now,
      } as never);
      rank += 1;
      await notify({
        userId: wid,
        role: "user",
        kind: "giveaway_won",
        title: "¡Ganaste un sorteo!",
        body: `Premio: ${g.prize_label}`,
        payload: {
          club_id: g.club_id,
          giveaway_id: giveawayId,
          conversation_id: g.conversation_id,
          prize_label: g.prize_label,
        },
      });
    }

    const winnerNames: string[] = [];
    for (const wid of winnerIds) {
      const { data: p } = await admin.from("profiles").select("display_name").eq("id", wid).maybeSingle();
      winnerNames.push((p?.display_name as string | null) ?? "Jugador");
    }

    await admin.from("messages").insert({
      conversation_id: g.conversation_id,
      sender_id: userId,
      body: `Sorteo "${g.title}" — ganador(es): ${winnerNames.join(", ")}`,
      kind: "giveaway_result",
      payload: { giveaway_id: giveawayId, winner_ids: winnerIds },
    } as never);

    return { winnerIds };
  });
}

export async function getClubCommsStaffOverview(input: unknown): Promise<
  ActionResult<{
    clubId: string;
    clubName: string;
    announcementsConversationId: string | null;
    communityConversationId: string | null;
    followerCount: number;
    vipCount: number;
  }>
> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await assertAnnouncementsPublisher(clubId);
    const admin = getAdminClient();
    const [{ data: club }, { data: convRows }, { count: followerCount }, { count: vipCount }] =
      await Promise.all([
        admin.from("clubs").select("name").eq("id", clubId).maybeSingle(),
        admin
          .from("conversations")
          .select("id,kind")
          .eq("club_id", clubId)
          .in("kind", ["club_channel", "club_announcements"]),
        admin.from("club_followers").select("*", { count: "exact", head: true }).eq("club_id", clubId),
        (admin as any)
          .from("club_memberships")
          .select("*", { count: "exact", head: true })
          .eq("club_id", clubId)
          .eq("status", "active"),
      ]);
    let announcementsConversationId: string | null = null;
    let communityConversationId: string | null = null;
    for (const row of convRows ?? []) {
      if (row.kind === "club_announcements") announcementsConversationId = row.id as string;
      if (row.kind === "club_channel") communityConversationId = row.id as string;
    }
    return {
      clubId,
      clubName: (club?.name as string | null) ?? "Tu club",
      announcementsConversationId,
      communityConversationId,
      followerCount: followerCount ?? 0,
      vipCount: vipCount ?? 0,
    };
  });
}
