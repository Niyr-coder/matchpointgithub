"use server";

// Giveaways v2 — feed, wizard, entradas ponderadas, sorteo en vivo.
// Ver docs/product/10-giveaways.md
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { notify } from "@/server/notifications/dispatch";
import { isClubGiveawaysEnabledForUser, requireClubGiveawaysEnabled } from "@/server/flags/club-giveaways-flag";
import { isClubMembershipActive } from "@/lib/clubs/membership";
import { isGiveawayEligible } from "@/lib/clubs/comms-eligibility";
import { resolveMechanicWeightApplied, MAX_PAY_TICKETS } from "@/lib/giveaways/mechanic-weight";
import { isGiveawayQualified, qualifiedProbabilityPct } from "@/lib/giveaways/qualification";
import {
  mechanicByKind,
  maxEntriesFromMechanics,
  parseMechanics,
  type MechanicKind,
} from "@/lib/giveaways/mechanics";
import { ClubIdOnlySchema, GiveawayIdSchema } from "@/lib/schemas/club-comms";
import {
  SaveGiveawayPremioSchema,
  SaveGiveawayMechanicsSchema,
  SaveGiveawayRulesSchema,
  PublishGiveawaySchema,
  CreateClubFeedPostSchema,
  EnterGiveawayPrereqSchema,
  SubmitGiveawayShareSchema,
  ReviewGiveawayManualSchema,
  ClubFeedPostViewSchema,
  GiveawayDetailViewSchema,
  MyGiveawayRowSchema,
  MyGiveawaysDashboardSchema,
  GiveawayOrgManageViewSchema,
  GiveawayOrgWinnerViewSchema,
  type ClubFeedPostView,
  type GiveawayDetailView,
  type MyGiveawayRow,
  type MyGiveawaysDashboard,
  type GiveawayOrgManageView,
  type GiveawayOrgWinnerView,
} from "@/lib/schemas/giveaways";
import { z } from "zod";
import { toggleFollowClub } from "@/server/actions/clubs";
import { executeGiveawayDraw } from "@/server/giveaways/execute-draw";
import { buildMyGiveawaysDashboard, type GiveawayBundle } from "@/lib/giveaways/build-my-dashboard";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

async function assertGiveawayStaff(clubId: string): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data, error } = await (supabase as any).rpc("mp_club_staff", { p_club_id: clubId });
  if (error) throw new MpError("GIVEAWAY.AUTH_FAILED", error.message, 500);
  if (!data) {
    throw new AuthError(
      "AUTH.ROLE_REQUIRED",
      "No tienes permiso para gestionar sorteos de este club. Revisa que el club activo sea el correcto.",
    );
  }
  return userId;
}

async function ensureAnnouncementConversation(clubId: string): Promise<string> {
  const admin = getAdminClient();
  const { data: rows, error: rpcErr } = await (admin as any).rpc("fn_ensure_club_channels", {
    p_club_id: clubId,
  });
  if (rpcErr) throw new MpError("GIVEAWAY.CHANNEL_FAILED", rpcErr.message, 500);
  const annId = (rows?.[0]?.announcements_id as string | undefined) ?? null;
  if (annId) return annId;
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("club_id", clubId)
    .eq("kind", "club_announcements")
    .maybeSingle();
  if (conv?.id) return conv.id as string;
  throw new MpError("GIVEAWAY.CHANNEL_MISSING", "Canal de anuncios no disponible", 500);
}

type GiveawayRow = Record<string, unknown>;

async function loadGiveawayRow(giveawayId: string): Promise<GiveawayRow> {
  const admin = getAdminClient();
  const { data, error } = await (admin as any)
    .from("club_giveaways")
    .select("*")
    .eq("id", giveawayId)
    .maybeSingle();
  if (error) throw new MpError("GIVEAWAY.READ_FAILED", error.message, 500);
  if (!data) throw new MpError("GIVEAWAY.NOT_FOUND", "Sorteo no encontrado", 404);
  return data as GiveawayRow;
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

async function recalculateUserEntries(giveawayId: string, userId: string): Promise<number> {
  const g = await loadGiveawayRow(giveawayId);
  const mechanics = parseMechanics(g.mechanics).filter((m) => m.enabled);

  const admin = getAdminClient();
  const { data: progress } = await admin
    .from("club_giveaway_mechanic_progress")
    .select("kind,weight_applied")
    .eq("giveaway_id", giveawayId)
    .eq("user_id", userId);

  const doneKinds = new Set(
    (progress ?? []).filter((p) => Number(p.weight_applied) > 0).map((p) => p.kind as string),
  );
  const qualified = isGiveawayQualified(mechanics, doneKinds);
  const total = qualified ? 1 : 0;

  const { data: existing } = await admin
    .from("club_giveaway_entries")
    .select("user_id")
    .eq("giveaway_id", giveawayId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await (admin as any)
      .from("club_giveaway_entries")
      .update({ total_entries: total })
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId);
  }

  return total;
}

async function recalculateGiveawayPool(giveawayId: string): Promise<number> {
  const admin = getAdminClient();
  const { data: entries } = await admin
    .from("club_giveaway_entries")
    .select("total_entries")
    .eq("giveaway_id", giveawayId);
  const qualifierCount = (entries ?? []).filter((e) => Number(e.total_entries) >= 1).length;
  await (admin as any).from("club_giveaways").update({ total_entry_weight: qualifierCount }).eq("id", giveawayId);
  return qualifierCount;
}

const FEED_BADGE_BY_KIND: Record<string, string> = {
  event: "TORNEO",
  photo: "FOTO",
  notice: "AVISO",
  spotlight: "SPOTLIGHT",
  announcement: "AVISO",
};

export async function createClubFeedPost(
  input: unknown,
): Promise<ActionResult<{ feedPostId: string }>> {
  return runAction(CreateClubFeedPostSchema, input, async (data) => {
    const userId = await assertGiveawayStaff(data.clubId);
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const badge = FEED_BADGE_BY_KIND[data.kind] ?? "AVISO";

    const { data: row, error } = await admin
      .from("club_feed_posts")
      .insert({
        club_id: data.clubId,
        kind: data.kind,
        ref_id: data.refId ?? null,
        title: data.title,
        body: data.body ?? null,
        media_url: data.mediaUrl ?? null,
        badge,
        cta_label: data.ctaLabel ?? null,
        cta_href: data.ctaHref ?? null,
        payload: {},
        published_by: userId,
        published_at: now,
      } as never)
      .select("id")
      .single();
    if (error || !row) {
      throw new MpError("GIVEAWAY.FEED_POST_FAILED", error?.message ?? "No se pudo publicar", 500);
    }
    return { feedPostId: row.id as string };
  });
}

export async function listClubFeedPosts(input: unknown): Promise<ActionResult<ClubFeedPostView[]>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await requireUserId();
    const giveawaysOn = await isClubGiveawaysEnabledForUser();
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("club_feed_posts")
      .select(
        "id,club_id,kind,ref_id,title,body,media_url,badge,cta_label,cta_href,published_at,payload",
      )
      .eq("club_id", clubId)
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) throw new MpError("GIVEAWAY.FEED_FAILED", error.message, 500);
    return (data ?? [])
      .filter((row) => giveawaysOn || (row.kind as string) !== "giveaway")
      .map((row) =>
        ClubFeedPostViewSchema.parse({
          id: row.id,
          clubId: row.club_id,
          kind: row.kind,
          refId: row.ref_id ?? null,
          title: row.title,
          body: row.body ?? null,
          mediaUrl: row.media_url ?? null,
          badge: row.badge ?? null,
          ctaLabel: row.cta_label ?? null,
          ctaHref: row.cta_href ?? null,
          publishedAt: row.published_at,
          payload: (row.payload as Record<string, unknown>) ?? {},
        }),
      );
  });
}

export async function listActiveClubGiveaways(
  input: unknown,
): Promise<ActionResult<{ id: string; title: string; subtitle: string | null; closesAt: string | null; entries: number }[]>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await requireUserId();
    if (!(await isClubGiveawaysEnabledForUser())) return [];
    const admin = getAdminClient();
    const { data, error } = await (admin as any)
      .from("club_giveaways")
      .select("id,title,subtitle,closes_at,total_entry_weight,status")
      .eq("club_id", clubId)
      .in("status", ["open", "closing"])
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw new MpError("GIVEAWAY.READ_FAILED", error.message, 500);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      title: r.title as string,
      subtitle: (r.subtitle as string | null) ?? null,
      closesAt: (r.closes_at as string | null) ?? null,
      entries: Number(r.total_entry_weight) || 0,
    }));
  });
}

export async function saveGiveawayPremio(
  input: unknown,
): Promise<ActionResult<{ giveawayId: string }>> {
  return runAction(SaveGiveawayPremioSchema, input, async (data) => {
    await requireClubGiveawaysEnabled();
    const userId = await assertGiveawayStaff(data.clubId);
    const admin = getAdminClient();
    const convId = await ensureAnnouncementConversation(data.clubId);

    if (data.giveawayId) {
      const existing = await loadGiveawayRow(data.giveawayId);
      if (existing.club_id !== data.clubId) {
        throw new MpError("GIVEAWAY.FORBIDDEN", "Sorteo de otro club", 403);
      }
      await (admin as any)
        .from("club_giveaways")
        .update({
          title: data.title,
          subtitle: data.subtitle ?? null,
          prize_label: data.prizeLabel,
          category: data.category ?? null,
          description: data.description ?? null,
          prize_image_url: data.prizeImageUrl ?? null,
          estimated_value_cents: data.estimatedValueCents ?? null,
        })
        .eq("id", data.giveawayId);
      return { giveawayId: data.giveawayId };
    }

    const { data: row, error } = await (admin as any)
      .from("club_giveaways")
      .insert({
        club_id: data.clubId,
        conversation_id: convId,
        created_by: userId,
        title: data.title,
        subtitle: data.subtitle ?? null,
        prize_label: data.prizeLabel,
        category: data.category ?? null,
        description: data.description ?? null,
        prize_image_url: data.prizeImageUrl ?? null,
        estimated_value_cents: data.estimatedValueCents ?? null,
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !row) {
      throw new MpError("GIVEAWAY.SAVE_FAILED", error?.message ?? "No se pudo guardar", 500);
    }
    return { giveawayId: row.id as string };
  });
}

export async function saveGiveawayMechanics(
  input: unknown,
): Promise<ActionResult<{ giveawayId: string; maxEntriesPerUser: number }>> {
  return runAction(SaveGiveawayMechanicsSchema, input, async (data) => {
    await requireClubGiveawaysEnabled();
    const g = await loadGiveawayRow(data.giveawayId);
    await assertGiveawayStaff(g.club_id as string);
    const maxEntries =
      data.maxEntriesPerUser ?? maxEntriesFromMechanics(data.mechanics);
    const admin = getAdminClient();
    await (admin as any)
      .from("club_giveaways")
      .update({
        mechanics: data.mechanics,
        max_entries_per_user: maxEntries,
      })
      .eq("id", data.giveawayId);
    return { giveawayId: data.giveawayId, maxEntriesPerUser: maxEntries };
  });
}

export async function saveGiveawayRules(
  input: unknown,
): Promise<ActionResult<{ giveawayId: string }>> {
  return runAction(SaveGiveawayRulesSchema, input, async (data) => {
    await requireClubGiveawaysEnabled();
    const g = await loadGiveawayRow(data.giveawayId);
    await assertGiveawayStaff(g.club_id as string);
    const admin = getAdminClient();
    await (admin as any)
      .from("club_giveaways")
      .update({
        eligibility: data.eligibility,
        opens_at: data.opensAt ?? null,
        closes_at: data.closesAt ?? null,
        draw_at: data.drawAt ?? null,
        draw_channel: data.drawChannel ?? null,
        rules: data.rules,
        max_winners: data.maxWinners,
      })
      .eq("id", data.giveawayId);
    return { giveawayId: data.giveawayId };
  });
}

export async function publishGiveawayV2(
  input: unknown,
): Promise<ActionResult<{ giveawayId: string; feedPostId: string }>> {
  return runAction(PublishGiveawaySchema, input, async ({ giveawayId }) => {
    await requireClubGiveawaysEnabled();
    const g = await loadGiveawayRow(giveawayId);
    const userId = await assertGiveawayStaff(g.club_id as string);
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const clubId = g.club_id as string;
    const convId = g.conversation_id as string;

    const { data: feedPost, error: feedErr } = await admin
      .from("club_feed_posts")
      .insert({
        club_id: clubId,
        kind: "giveaway",
        ref_id: giveawayId,
        title: g.title as string,
        body: (g.description as string | null) ?? (g.subtitle as string | null),
        media_url: (g.prize_image_url as string | null) ?? null,
        badge: "GIVEAWAY",
        cta_label: "Participar",
        cta_href: `/dashboard/clubes/giveaways/${giveawayId}`,
        payload: {
          prize_label: g.prize_label,
          subtitle: g.subtitle,
          max_entries_per_user: g.max_entries_per_user,
        },
        published_by: userId,
        published_at: now,
      } as never)
      .select("id")
      .single();
    if (feedErr || !feedPost) {
      throw new MpError("GIVEAWAY.PUBLISH_FAILED", feedErr?.message ?? "No se pudo publicar en el feed", 500);
    }

    const { data: msg, error: msgErr } = await admin
      .from("messages")
      .insert({
        conversation_id: convId,
        sender_id: userId,
        body: (g.description as string | null) ?? (g.title as string),
        kind: "giveaway_post",
        payload: {
          title: g.title,
          giveaway_id: giveawayId,
          prize_label: g.prize_label,
          feed_post_id: feedPost.id,
        },
      } as never)
      .select("id")
      .single();
    if (msgErr) {
      throw new MpError("GIVEAWAY.ANNOUNCE_FAILED", msgErr.message, 500);
    }

    await (admin as any)
      .from("club_giveaways")
      .update({
        status: "open",
        opens_at: now,
        feed_post_id: feedPost.id,
        message_id: msg?.id ?? null,
      })
      .eq("id", giveawayId);

    const { data: club } = await admin.from("clubs").select("name,slug").eq("id", clubId).maybeSingle();
    const clubName = (club?.name as string | null) ?? "Tu club";

    const { data: members } = await admin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", convId)
      .is("left_at", null);
    for (const m of members ?? []) {
      const uid = m.user_id as string;
      if (uid === userId) continue;
      await notify({
        userId: uid,
        role: "user",
        kind: "giveaway_started",
        title: `Sorteo: ${g.title as string}`,
        body: `${clubName} publicó un nuevo sorteo`,
        payload: {
          club_id: clubId,
          giveaway_id: giveawayId,
          club_slug: club?.slug,
        },
      });
    }

    return { giveawayId, feedPostId: feedPost.id as string };
  });
}

export async function getGiveawayDetail(input: unknown): Promise<ActionResult<GiveawayDetailView>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    await requireClubGiveawaysEnabled();
    const userId = await requireUserId();
    const g = await loadGiveawayRow(giveawayId);
    const admin = getAdminClient();
    const clubId = g.club_id as string;

    const { data: club } = await admin.from("clubs").select("name,slug").eq("id", clubId).maybeSingle();

    const mechanicsConfig = parseMechanics(g.mechanics);
    const { data: progressRows } = await admin
      .from("club_giveaway_mechanic_progress")
      .select("kind")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId);
    const doneKinds = new Set((progressRows ?? []).map((p) => p.kind as string));

    const { data: shareSub } = await admin
      .from("club_giveaway_manual_submissions")
      .select("status")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId)
      .eq("kind", "share")
      .maybeSingle();

    const mechanics = mechanicsConfig
      .filter((m) => m.enabled)
      .map((m) => {
        const def = mechanicByKind(m.kind);
        const done = doneKinds.has(m.kind);
        const pending = m.kind === "share" && shareSub?.status === "pending" && !done;
        return {
          kind: m.kind,
          label: def?.label ?? m.kind,
          weight: m.weight,
          done,
          pending,
          autoVerify: def?.autoVerify ?? true,
        };
      });

    const { data: myEntry } = await admin
      .from("club_giveaway_entries")
      .select("total_entries")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId)
      .maybeSingle();

    const myEntries = Number(myEntry?.total_entries) || 0;
    const poolSize = Number(g.total_entry_weight) || 0;
    const { data: winners } = await admin
      .from("club_giveaway_winners")
      .select("user_id,rank,profiles(display_name)")
      .eq("giveaway_id", giveawayId)
      .order("rank", { ascending: true });

    const rulesRaw = g.rules;
    const rules = Array.isArray(rulesRaw)
      ? rulesRaw.filter((r): r is string => typeof r === "string")
      : [];

    const winnerRows = winners ?? [];
    const iWon = g.status === "drawn" ? winnerRows.some((w) => (w.user_id as string) === userId) : null;

    return GiveawayDetailViewSchema.parse({
      id: giveawayId,
      clubId,
      clubName: (club?.name as string | null) ?? "Club",
      clubSlug: (club?.slug as string | null) ?? "",
      title: g.title as string,
      subtitle: (g.subtitle as string | null) ?? null,
      prizeLabel: g.prize_label as string,
      prizeImageUrl: (g.prize_image_url as string | null) ?? null,
      description: (g.description as string | null) ?? null,
      ownerType: (g.owner_type as string) ?? "club",
      status: g.status as string,
      eligibility: g.eligibility as string,
      maxWinners: Number(g.max_winners) || 1,
      maxEntriesPerUser: Number(g.max_entries_per_user) || 1,
      opensAt: (g.opens_at as string | null) ?? null,
      closesAt: (g.closes_at as string | null) ?? null,
      drawAt: (g.draw_at as string | null) ?? null,
      drawChannel: (g.draw_channel as string | null) ?? null,
      rules,
      mechanics,
      entryCount: poolSize,
      totalEntryWeight: poolSize,
      myEntries,
      myProbabilityPct: qualifiedProbabilityPct(myEntries >= 1, poolSize),
      hasJoined: Boolean(myEntry),
      won: iWon,
      winners: winnerRows.map((w: Record<string, unknown>) => ({
        userId: w.user_id,
        rank: w.rank,
        displayName: ((w.profiles as { display_name?: string } | null)?.display_name) ?? "Jugador",
      })),
    });
  });
}

export async function enterGiveawayWithPrereqs(
  input: unknown,
): Promise<ActionResult<{ myEntries: number; maxEntries: number }>> {
  return runAction(EnterGiveawayPrereqSchema, input, async (data) => {
    await requireClubGiveawaysEnabled();
    if (!data.acceptRules) {
      throw new MpError("GIVEAWAY.RULES_REQUIRED", "Debes aceptar las reglas del sorteo", 400);
    }

    const userId = await requireUserId();
    const g = await loadGiveawayRow(data.giveawayId);
    const status = g.status as string;
    if (status !== "open" && status !== "closing") {
      throw new MpError("GIVEAWAY.CLOSED", "Este sorteo ya no acepta participantes", 409);
    }
    if (g.closes_at && new Date(g.closes_at as string) < new Date()) {
      throw new MpError("GIVEAWAY.CLOSED", "El sorteo ya cerró", 409);
    }

    const clubId = g.club_id as string;
    let flags = await userGiveawayFlags(userId, clubId);

    if (data.followClub && !flags.isFollower) {
      const followRes = await toggleFollowClub({ clubId });
      if (!followRes.ok) {
        throw new MpError("GIVEAWAY.FOLLOW_FAILED", followRes.error.message, 500);
      }
      flags = await userGiveawayFlags(userId, clubId);
    }

    if (!isGiveawayEligible({ eligibility: g.eligibility as "followers" | "members" | "all", ...flags })) {
      throw new MpError("GIVEAWAY.NOT_ELIGIBLE", "No cumples los requisitos para participar", 403);
    }

    const admin = getAdminClient();
    const now = new Date().toISOString();
    const mechanics = parseMechanics(g.mechanics);
    const followMech = mechanics.find((m) => m.enabled && m.kind === "follow");

    if (followMech && flags.isFollower) {
      await admin.from("club_giveaway_mechanic_progress").upsert(
        {
          giveaway_id: data.giveawayId,
          user_id: userId,
          kind: "follow",
          weight_applied: followMech.weight,
          completed_at: now,
        } as never,
        { onConflict: "giveaway_id,user_id,kind" },
      );
    }

    await (admin as any).from("club_giveaway_entries").upsert(
      {
        giveaway_id: data.giveawayId,
        user_id: userId,
        total_entries: 0,
        rules_accepted_at: now,
        entered_at: now,
      },
      { onConflict: "giveaway_id,user_id" },
    );

    const myEntries = await recalculateUserEntries(data.giveawayId, userId);
    await recalculateGiveawayPool(data.giveawayId);

    return {
      myEntries,
      maxEntries: 1,
    };
  });
}

async function applyMechanicSyncForUser(giveawayId: string, userId: string): Promise<number> {
  const g = await loadGiveawayRow(giveawayId);
  const clubId = g.club_id as string;
  const flags = await userGiveawayFlags(userId, clubId);
  const mechanics = parseMechanics(g.mechanics);
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const verifyCtx = {
    giveawayId,
    clubId,
    userId,
    opensAt: (g.opens_at as string | null) ?? null,
    closesAt: (g.closes_at as string | null) ?? null,
  };

  for (const m of mechanics) {
    if (!m.enabled) continue;
    const weightApplied = await resolveMechanicWeightApplied(
      admin,
      m.kind,
      verifyCtx,
      { isFollower: flags.isFollower },
      m.weight,
    );
    if (weightApplied <= 0) continue;
    await admin.from("club_giveaway_mechanic_progress").upsert(
      {
        giveaway_id: giveawayId,
        user_id: userId,
        kind: m.kind as MechanicKind,
        weight_applied: weightApplied,
        completed_at: now,
      } as never,
      { onConflict: "giveaway_id,user_id,kind" },
    );
  }

  const myEntries = await recalculateUserEntries(giveawayId, userId);
  await recalculateGiveawayPool(giveawayId);
  return myEntries;
}

/** Tras un referido nuevo — sincroniza mecánica invite en sorteos activos del referidor. */
export async function syncActiveGiveawayMechanicsForReferrer(referrerUserId: string): Promise<void> {
  try {
    const admin = getAdminClient();
    const { data: rows } = await admin
      .from("club_giveaway_entries")
      .select("giveaway_id, club_giveaways!inner(id, status)")
      .eq("user_id", referrerUserId)
      .in("club_giveaways.status", ["open", "closing"]);
    const ids = [...new Set((rows ?? []).map((r) => r.giveaway_id as string))];
    for (const giveawayId of ids) {
      await applyMechanicSyncForUser(giveawayId, referrerUserId);
    }
  } catch (err) {
    console.error("[syncActiveGiveawayMechanicsForReferrer]", err);
  }
}

/** Tras reservar, seguir, comprar, etc. — sincroniza mecánicas en sorteos activos del club. */
export async function syncActiveGiveawayMechanicsForClubUser(userId: string, clubId: string): Promise<void> {
  if (!(await isClubGiveawaysEnabledForUser())) return;
  try {
    const admin = getAdminClient();
    const { data: rows } = await admin
      .from("club_giveaway_entries")
      .select("giveaway_id, club_giveaways!inner(id, club_id, status)")
      .eq("user_id", userId)
      .eq("club_giveaways.club_id", clubId)
      .in("club_giveaways.status", ["open", "closing"]);
    const ids = [...new Set((rows ?? []).map((r) => r.giveaway_id as string))];
    for (const giveawayId of ids) {
      await applyMechanicSyncForUser(giveawayId, userId);
    }
  } catch (err) {
    console.error("[syncActiveGiveawayMechanicsForClubUser]", err);
  }
}

export async function syncGiveawayMechanicsForUser(
  input: unknown,
): Promise<ActionResult<{ myEntries: number }>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    await requireClubGiveawaysEnabled();
    const userId = await requireUserId();
    const myEntries = await applyMechanicSyncForUser(giveawayId, userId);
    return { myEntries };
  });
}

export async function submitGiveawayShareClaim(
  input: unknown,
): Promise<ActionResult<{ status: "pending" }>> {
  return runAction(SubmitGiveawayShareSchema, input, async ({ giveawayId, evidenceUrl }) => {
    await requireClubGiveawaysEnabled();
    const userId = await requireUserId();
    const g = await loadGiveawayRow(giveawayId);
    const status = g.status as string;
    if (status !== "open" && status !== "closing") {
      throw new MpError("GIVEAWAY.CLOSED", "Este sorteo ya no acepta acciones", 409);
    }

    const { data: entry } = await getAdminClient()
      .from("club_giveaway_entries")
      .select("user_id")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!entry) {
      throw new MpError("GIVEAWAY.NOT_JOINED", "Primero debes participar en el sorteo", 403);
    }

    const admin = getAdminClient();
    const { error } = await admin.from("club_giveaway_manual_submissions").upsert(
      {
        giveaway_id: giveawayId,
        user_id: userId,
        kind: "share",
        evidence_url: evidenceUrl,
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
      } as never,
      { onConflict: "giveaway_id,user_id,kind" },
    );
    if (error) throw new MpError("GIVEAWAY.SHARE_FAILED", error.message, 500);
    return { status: "pending" };
  });
}

export async function createGiveawayPayEntry(
  input: unknown,
): Promise<ActionResult<{ transactionId: string; checkoutUrl: string }>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    await requireClubGiveawaysEnabled();
    const userId = await requireUserId();
    const g = await loadGiveawayRow(giveawayId);
    const status = g.status as string;
    if (status !== "open" && status !== "closing") {
      throw new MpError("GIVEAWAY.CLOSED", "Este sorteo ya no acepta pagos extra", 409);
    }

    const admin = getAdminClient();
    const { data: entry } = await admin
      .from("club_giveaway_entries")
      .select("user_id")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!entry) {
      throw new MpError("GIVEAWAY.NOT_JOINED", "Primero debes participar en el sorteo", 403);
    }

    const since = (g.opens_at as string | null) ?? new Date(0).toISOString();
    const { count: paidCount } = await admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("club_id", g.club_id as string)
      .eq("customer_user_id", userId)
      .eq("kind", "custom")
      .eq("ref_id", giveawayId)
      .in("status", ["captured", "pending_proof", "proof_submitted"])
      .gte("created_at", since);
    if ((paidCount ?? 0) >= MAX_PAY_TICKETS) {
      throw new MpError("GIVEAWAY.PAY_LIMIT", `Máximo ${MAX_PAY_TICKETS} entradas pagadas`, 409);
    }

    const { data: club } = await admin.from("clubs").select("currency").eq("id", g.club_id as string).maybeSingle();
    const currency = (club?.currency as string | null) ?? "USD";

    const { data: tx, error } = await admin
      .from("transactions")
      .insert({
        club_id: g.club_id as string,
        kind: "custom",
        ref_id: giveawayId,
        customer_user_id: userId,
        customer_name: null,
        amount_cents: 100,
        currency,
        method: "transfer",
        status: "pending_proof",
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error || !tx) throw new MpError("GIVEAWAY.PAY_FAILED", error?.message ?? "No se pudo crear el pago", 500);

    return { transactionId: tx.id as string, checkoutUrl: `/pagos/${tx.id as string}` };
  });
}

export async function reviewGiveawayManualSubmission(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(ReviewGiveawayManualSchema, input, async ({ submissionId, decision }) => {
    await requireClubGiveawaysEnabled();
    const staffId = await requireUserId();
    const admin = getAdminClient();
    const { data: sub, error: readErr } = await admin
      .from("club_giveaway_manual_submissions")
      .select("id,giveaway_id,user_id,kind,status")
      .eq("id", submissionId)
      .maybeSingle();
    if (readErr || !sub) throw new MpError("GIVEAWAY.SUBMISSION_NOT_FOUND", "Envío no encontrado", 404);
    if (sub.status !== "pending") {
      throw new MpError("GIVEAWAY.SUBMISSION_DONE", "Este envío ya fue revisado", 409);
    }

    const g = await loadGiveawayRow(sub.giveaway_id as string);
    await assertGiveawayStaff(g.club_id as string);

    const now = new Date().toISOString();
    await admin
      .from("club_giveaway_manual_submissions")
      .update({
        status: decision,
        reviewed_by: staffId,
        reviewed_at: now,
      } as never)
      .eq("id", submissionId);

    if (decision === "approved") {
      const mechanics = parseMechanics(g.mechanics);
      const mech = mechanics.find((m) => m.enabled && m.kind === sub.kind);
      if (mech) {
        await admin.from("club_giveaway_mechanic_progress").upsert(
          {
            giveaway_id: sub.giveaway_id,
            user_id: sub.user_id,
            kind: sub.kind,
            weight_applied: mech.weight,
            completed_at: now,
            verified_by: staffId,
          } as never,
          { onConflict: "giveaway_id,user_id,kind" },
        );
        await recalculateUserEntries(sub.giveaway_id as string, sub.user_id as string);
        await recalculateGiveawayPool(sub.giveaway_id as string);
      }
    }

    return { ok: true as const };
  });
}

export async function startGiveawayDraw(
  input: unknown,
): Promise<ActionResult<{ winnerIds: string[]; winnerNames: string[] }>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    await requireClubGiveawaysEnabled();
    const userId = await requireUserId();
    const g = await loadGiveawayRow(giveawayId);
    await assertGiveawayStaff(g.club_id as string);

    const result = await executeGiveawayDraw(giveawayId, userId, { force: true });
    if (result.skipped) {
      throw new MpError("GIVEAWAY.DRAW_NOT_READY", "Este sorteo aún no está listo para sortear", 409);
    }
    return { winnerIds: result.winnerIds, winnerNames: result.winnerNames };
  });
}

export async function listMyGiveaways(input: unknown): Promise<ActionResult<MyGiveawayRow[]>> {
  return runAction(z.object({}).optional(), input ?? {}, async () => {
    await requireClubGiveawaysEnabled();
    const userId = await requireUserId();
    const admin = getAdminClient();
    const { data: entries, error } = await admin
      .from("club_giveaway_entries")
      .select("giveaway_id,total_entries")
      .eq("user_id", userId)
      .order("entered_at", { ascending: false })
      .limit(50);
    if (error) throw new MpError("GIVEAWAY.READ_FAILED", error.message, 500);
    const ids = (entries ?? []).map((e) => e.giveaway_id as string);
    if (!ids.length) return [];

    const { data: giveaways } = await (admin as any)
      .from("club_giveaways")
      .select("id,title,status,closes_at,draw_at,prize_image_url,owner_type,max_entries_per_user,club_id")
      .in("id", ids);

    const clubIds: string[] = [
      ...new Set<string>((giveaways ?? []).map((g: { club_id: string }) => g.club_id)),
    ];
    const { data: clubs } = await admin.from("clubs").select("id,name,slug").in("id", clubIds);
    const clubMap = new Map((clubs ?? []).map((c) => [c.id as string, c]));

    const { data: wins } = await admin
      .from("club_giveaway_winners")
      .select("giveaway_id")
      .eq("user_id", userId)
      .in("giveaway_id", ids);
    const wonSet = new Set((wins ?? []).map((w) => w.giveaway_id as string));

    const entryMap = new Map(
      (entries ?? []).map((e) => [e.giveaway_id as string, Number(e.total_entries) || 1]),
    );

    return (giveaways ?? []).map((g: Record<string, unknown>) => {
      const club = clubMap.get(g.club_id as string);
      const gid = g.id as string;
      const status = g.status as string;
      let won: boolean | null = null;
      if (status === "drawn") won = wonSet.has(gid);
      return MyGiveawayRowSchema.parse({
        id: gid,
        title: g.title as string,
        clubName: (club?.name as string | null) ?? "Club",
        clubSlug: (club?.slug as string | null) ?? "",
        ownerType: (g.owner_type as string) ?? "club",
        status,
        myEntries: entryMap.get(gid) ?? 0,
        maxEntries: Number(g.max_entries_per_user) || 1,
        closesAt: (g.closes_at as string | null) ?? null,
        drawAt: (g.draw_at as string | null) ?? null,
        prizeImageUrl: (g.prize_image_url as string | null) ?? null,
        won,
      });
    });
  });
}

export async function getMyGiveawaysDashboard(
  input: unknown,
): Promise<ActionResult<MyGiveawaysDashboard>> {
  return runAction(z.object({}).optional(), input ?? {}, async () => {
    await requireClubGiveawaysEnabled();
    const userId = await requireUserId();
    const admin = getAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name,username")
      .eq("id", userId)
      .maybeSingle();

    const displayName =
      (profile?.display_name as string | null) ??
      (profile?.username as string | null) ??
      "Jugador";
    const username = (profile?.username as string | null) ?? null;

    const { data: entries, error } = await admin
      .from("club_giveaway_entries")
      .select("giveaway_id,total_entries,entered_at")
      .eq("user_id", userId)
      .order("entered_at", { ascending: false })
      .limit(80);
    if (error) throw new MpError("GIVEAWAY.READ_FAILED", error.message, 500);

    const giveawayIds = (entries ?? []).map((e) => e.giveaway_id as string);
    if (!giveawayIds.length) {
      return MyGiveawaysDashboardSchema.parse({
        displayName,
        username,
        adentro: [],
        pendientes: [],
        ganados: [],
        pasados: [],
        unlockActions: [],
        nextDraw: null,
        stats: { adentro: 0, pendientes: 0, ganados: 0, pasados: 0, winRatePct: 0 },
      });
    }

    const { data: giveaways } = await (admin as any)
      .from("club_giveaways")
      .select(
        "id,title,subtitle,status,closes_at,draw_at,draw_channel,prize_label,prize_image_url,owner_type,club_id,total_entry_weight,mechanics,drawn_at",
      )
      .in("id", giveawayIds);

    const clubIds = [
      ...new Set<string>((giveaways ?? []).map((g: { club_id: string }) => g.club_id)),
    ];
    const { data: clubs } = await admin.from("clubs").select("id,name,slug").in("id", clubIds);
    const clubMap = new Map((clubs ?? []).map((c) => [c.id as string, c]));

    const { data: progressRows } = await admin
      .from("club_giveaway_mechanic_progress")
      .select("giveaway_id,kind,weight_applied")
      .eq("user_id", userId)
      .in("giveaway_id", giveawayIds);

    const progressByGiveaway = new Map<string, Set<string>>();
    for (const row of progressRows ?? []) {
      if (Number(row.weight_applied) <= 0) continue;
      const gid = row.giveaway_id as string;
      if (!progressByGiveaway.has(gid)) progressByGiveaway.set(gid, new Set());
      progressByGiveaway.get(gid)!.add(row.kind as string);
    }

    const { data: shareSubs } = await admin
      .from("club_giveaway_manual_submissions")
      .select("giveaway_id,status")
      .eq("user_id", userId)
      .eq("kind", "share")
      .in("giveaway_id", giveawayIds);
    const sharePendingSet = new Set(
      (shareSubs ?? [])
        .filter((s) => s.status === "pending")
        .map((s) => s.giveaway_id as string),
    );

    const { data: myWins } = await admin
      .from("club_giveaway_winners")
      .select("giveaway_id")
      .eq("user_id", userId)
      .in("giveaway_id", giveawayIds);
    const wonSet = new Set((myWins ?? []).map((w) => w.giveaway_id as string));

    const drawnIds = (giveaways ?? [])
      .filter((g: { status: string }) => g.status === "drawn")
      .map((g: { id: string }) => g.id as string);

    const winnerNameByGiveaway = new Map<string, string>();
    if (drawnIds.length) {
      const { data: topWinners } = await admin
        .from("club_giveaway_winners")
        .select("giveaway_id,profiles(display_name)")
        .in("giveaway_id", drawnIds)
        .eq("rank", 1);
      for (const w of topWinners ?? []) {
        const name =
          ((w.profiles as { display_name?: string } | null)?.display_name as string | undefined) ??
          "Jugador";
        winnerNameByGiveaway.set(w.giveaway_id as string, name);
      }
    }

    const entryMap = new Map(
      (entries ?? []).map((e) => [e.giveaway_id as string, Number(e.total_entries) || 0]),
    );
    const giveawayMap = new Map<string, Record<string, unknown>>(
      (giveaways ?? []).map((g: Record<string, unknown>) => [g.id as string, g]),
    );

    const bundles: GiveawayBundle[] = giveawayIds
      .map((gid) => {
        const g = giveawayMap.get(gid);
        if (!g) return null;
        const club = clubMap.get(g.club_id as string);
        return {
          id: gid,
          title: g.title as string,
          subtitle: (g.subtitle as string | null) ?? null,
          status: g.status as string,
          closesAt: (g.closes_at as string | null) ?? null,
          drawAt: (g.draw_at as string | null) ?? null,
          drawChannel: (g.draw_channel as string | null) ?? null,
          prizeLabel: (g.prize_label as string) ?? "Premio",
          prizeImageUrl: (g.prize_image_url as string | null) ?? null,
          ownerType: (g.owner_type as string) ?? "club",
          clubId: g.club_id as string,
          clubName: (club?.name as string | null) ?? "Club",
          clubSlug: (club?.slug as string | null) ?? "",
          qualifierCount: Number(g.total_entry_weight) || 0,
          mechanics: parseMechanics(g.mechanics),
          doneKinds: progressByGiveaway.get(gid) ?? new Set<string>(),
          sharePending: sharePendingSet.has(gid),
          totalEntries: entryMap.get(gid) ?? 0,
          drawnAt: (g.drawn_at as string | null) ?? null,
          winnerName: winnerNameByGiveaway.get(gid) ?? null,
          userWon: wonSet.has(gid),
        } satisfies GiveawayBundle;
      })
      .filter((b): b is GiveawayBundle => b !== null);

    const dashboard = buildMyGiveawaysDashboard({ displayName, username, bundles });
    return MyGiveawaysDashboardSchema.parse(dashboard);
  });
}

export async function listOrgGiveaways(input: unknown): Promise<ActionResult<GiveawayDetailView[]>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await requireClubGiveawaysEnabled();
    await assertGiveawayStaff(clubId);
    const admin = getAdminClient();
    const { data, error } = await (admin as any)
      .from("club_giveaways")
      .select("id")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new MpError("GIVEAWAY.READ_FAILED", error.message, 500);
    const out: GiveawayDetailView[] = [];
    for (const row of data ?? []) {
      const res = await getGiveawayDetail({ giveawayId: row.id as string });
      if (res.ok) out.push(res.data);
    }
    return out;
  });
}

export type ClubGiveawaysOrgOverview = {
  clubId: string;
  clubName: string;
  followerCount: number;
};

/** Datos mínimos para la consola org de sorteos (no reutiliza anuncios). */
export async function getClubGiveawaysOrgOverview(
  input: unknown,
): Promise<ActionResult<ClubGiveawaysOrgOverview>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await requireClubGiveawaysEnabled();
    await assertGiveawayStaff(clubId);
    const admin = getAdminClient();
    const [{ data: club }, { count: followerCount }] = await Promise.all([
      admin.from("clubs").select("name").eq("id", clubId).maybeSingle(),
      admin.from("club_followers").select("*", { count: "exact", head: true }).eq("club_id", clubId),
    ]);
    return {
      clubId,
      clubName: (club?.name as string | null) ?? "Tu club",
      followerCount: followerCount ?? 0,
    };
  });
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function getGiveawayOrgManage(input: unknown): Promise<ActionResult<GiveawayOrgManageView>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    const detailRes = await getGiveawayDetail({ giveawayId });
    if (!detailRes.ok) throw new MpError(detailRes.error.code, detailRes.error.message, 404);
    const giveaway = detailRes.data;
    await assertGiveawayStaff(giveaway.clubId);

    const admin = getAdminClient();
    const { data: club } = await admin.from("clubs").select("name").eq("id", giveaway.clubId).maybeSingle();
    const { count: followerCount } = await admin
      .from("club_followers")
      .select("club_id", { count: "exact", head: true })
      .eq("club_id", giveaway.clubId);

    const { data: entries } = await admin
      .from("club_giveaway_entries")
      .select("user_id,total_entries,profiles(display_name,username)")
      .eq("giveaway_id", giveawayId)
      .order("total_entries", { ascending: false })
      .limit(20);

    const participantCount = entries?.length ?? 0;
    const enabledMechanics = giveaway.mechanics;

    const { data: progressRows } = await admin
      .from("club_giveaway_mechanic_progress")
      .select("user_id,kind,weight_applied")
      .eq("giveaway_id", giveawayId);

    const progressByUser = new Map<string, Map<string, number>>();
    for (const row of progressRows ?? []) {
      const uid = row.user_id as string;
      if (!progressByUser.has(uid)) progressByUser.set(uid, new Map());
      progressByUser.get(uid)!.set(row.kind as string, Number(row.weight_applied) || 0);
    }

    const userIds = (entries ?? []).map((e) => e.user_id as string);
    const followsSet = new Set<string>();
    if (userIds.length > 0) {
      const { data: follows } = await admin
        .from("club_followers")
        .select("user_id")
        .eq("club_id", giveaway.clubId)
        .in("user_id", userIds);
      for (const f of follows ?? []) followsSet.add(f.user_id as string);
    }

    const topParticipants = (entries ?? []).map((e) => {
      const uid = e.user_id as string;
      const profile = e.profiles as { display_name?: string; username?: string } | null;
      const breakdown = enabledMechanics
        .map((m) => {
          const w = progressByUser.get(uid)?.get(m.kind);
          return w && w > 0 ? String(w) : "0";
        })
        .join("+");
      return {
        userId: uid,
        displayName: profile?.display_name ?? "Jugador",
        totalEntries: Number(e.total_entries) || 0,
        breakdown: breakdown || "—",
        followsClub: followsSet.has(uid),
      };
    });

    const mechanicStats = enabledMechanics.map((m) => {
      const completed = (progressRows ?? []).filter((r) => r.kind === m.kind).length;
      return {
        kind: m.kind,
        label: m.label,
        weight: m.weight,
        completedCount: completed,
        participantCount,
      };
    });

    const { data: pendingSubs } = await admin
      .from("club_giveaway_manual_submissions")
      .select("id,user_id,kind,evidence_url,created_at,profiles(display_name)")
      .eq("giveaway_id", giveawayId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const SIGNED_URL_TTL = 60 * 30;
    const pendingSubmissions = await Promise.all(
      (pendingSubs ?? []).map(async (row) => {
        const profile = row.profiles as { display_name?: string } | null;
        const path = row.evidence_url as string;
        let evidenceUrl = path;
        if (path && !path.startsWith("http")) {
          const { data: signed } = await admin.storage.from("payment_proofs").createSignedUrl(path, SIGNED_URL_TTL);
          evidenceUrl = signed?.signedUrl ?? path;
        }
        return {
          id: row.id as string,
          userId: row.user_id as string,
          displayName: profile?.display_name ?? "Jugador",
          kind: row.kind as string,
          evidenceUrl,
          createdAt: row.created_at as string,
        };
      }),
    );

    const pendingManualReviews = pendingSubmissions.length;

    return GiveawayOrgManageViewSchema.parse({
      giveaway,
      clubName: (club?.name as string | null) ?? giveaway.clubName,
      followerCount: followerCount ?? 0,
      participantCount,
      topParticipants,
      mechanicStats,
      pendingManualReviews,
      pendingSubmissions,
    });
  });
}

export async function getGiveawayOrgWinner(input: unknown): Promise<ActionResult<GiveawayOrgWinnerView>> {
  return runAction(GiveawayIdSchema, input, async ({ giveawayId }) => {
    const detailRes = await getGiveawayDetail({ giveawayId });
    if (!detailRes.ok) throw new MpError(detailRes.error.code, detailRes.error.message, 404);
    const giveaway = detailRes.data;
    await assertGiveawayStaff(giveaway.clubId);

    const winner = giveaway.winners[0];
    if (!winner) {
      throw new MpError("GIVEAWAY.NO_WINNER", "Este sorteo aún no tiene ganador", 404);
    }

    const admin = getAdminClient();
    const { data: club } = await admin.from("clubs").select("name").eq("id", giveaway.clubId).maybeSingle();

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name,username,phone")
      .eq("id", winner.userId)
      .maybeSingle();

    const { data: entry } = await admin
      .from("club_giveaway_entries")
      .select("total_entries")
      .eq("giveaway_id", giveawayId)
      .eq("user_id", winner.userId)
      .maybeSingle();

    const { data: follow } = await admin
      .from("club_followers")
      .select("user_id")
      .eq("club_id", giveaway.clubId)
      .eq("user_id", winner.userId)
      .maybeSingle();

    const displayName = (profile?.display_name as string | null) ?? winner.displayName;

    const { count: participantCount } = await admin
      .from("club_giveaway_entries")
      .select("giveaway_id", { count: "exact", head: true })
      .eq("giveaway_id", giveawayId);

    return GiveawayOrgWinnerViewSchema.parse({
      giveaway,
      clubName: (club?.name as string | null) ?? giveaway.clubName,
      winner: {
        userId: winner.userId,
        displayName,
        initials: initialsFromName(displayName),
        username: (profile?.username as string | null) ?? null,
        phone: (profile?.phone as string | null) ?? null,
        email: null,
        totalEntries: Number(entry?.total_entries) || 0,
        followsClub: Boolean(follow),
      },
      totalEntries: giveaway.totalEntryWeight,
      participantCount: participantCount ?? 0,
    });
  });
}
