"use server";

// Club domain Server Actions (post-approval entities).
// See docs/architecture/40-api.md §3.1.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { runOptimisticUpdate } from "@/lib/api/optimisticLock";
import { summarizeWeeklyOpenHours } from "@/server/clubs/club-profile-hours";
import {
  ClubDetailSchema,
  ClubFeaturedSchema,
  ClubListParamsSchema,
  ClubReviewCreateSchema,
  ClubReviewSchema,
  ClubReviewStatsSchema,
  ClubSchema,
  ClubSocialViewSchema,
  ClubUpdateSchema,
  type Club,
  type ClubDetail,
  type ClubFeatured,
  type ClubReview,
  type ClubReviewStats,
  type ClubSocialActivity,
  type ClubSocialMember,
  type ClubSocialTournament,
  type ClubSocialView,
} from "@/lib/schemas/clubs";
import { isClubMembershipActive } from "@/lib/clubs/membership";
import { normalizeClubSlugForRead } from "@/lib/clubs/slug-read";
import { loadCourtOccupancy } from "@/server/queries/court-occupancy";
import type { PageMeta } from "@/lib/api/response";
import { UuidSchema } from "@/lib/schemas/common";

function mapClub(row: Record<string, unknown>): Club {
  return ClubSchema.parse({
    id: row.id,
    slug: normalizeClubSlugForRead(row.slug),
    name: row.name,
    description: row.description ?? null,
    logoUrl: row.logo_url ?? null,
    coverUrl: row.cover_url ?? null,
    country: row.country,
    city: row.city,
    address: row.address ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    timezone: row.timezone,
    currency: row.currency,
    sports: row.sports ?? [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version ?? 1,
  });
}

async function requireSession() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function requireClubStaff(clubId: string): Promise<void> {
  const userId = await requireSession();
  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);

  const staff = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!staff) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
}

// ── listClubs (public) ──────────────────────────────────────────────────
export async function listClubs(
  input: unknown,
): Promise<ActionResult<Club[]> & { meta?: PageMeta }> {
  return runAction(ClubListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let q = supabase
      .from("clubs")
      .select("*", { count: "exact" })
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (params.q) q = q.ilike("name", `%${params.q}%`);
    if (params.country) q = q.eq("country", params.country);
    if (params.city) q = q.ilike("city", `%${params.city}%`);
    if (params.sport) q = q.contains("sports", [params.sport]);

    const { data, error, count } = await q;
    if (error) throw new MpError("CLUBS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapClub);
  });
}

// ── listFeaturedClubs (public, for landing) ─────────────────────────────
const FeaturedParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(4),
});

export async function listFeaturedClubs(
  input: unknown = {},
): Promise<ActionResult<ClubFeatured[]>> {
  return runAction(FeaturedParamsSchema, input, async ({ limit }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("clubs_public_summary")
      .select("*")
      .order("courts_count", { ascending: false })
      .limit(limit);
    if (error) throw new MpError("CLUBS.DB_ERROR", error.message, 500);

    const rows = data ?? [];
    if (rows.length === 0) return [];

    // featured_until + description + address viven en la tabla `clubs`
    // (no en la vista pública). Lo traemos en un segundo query y unimos.
    const ids = rows.map((r) => r.id as string);
    const { data: extraRows } = await supabase
      .from("clubs")
      .select("id,featured_until,description,address,latitude,longitude")
      .in("id", ids);
    type Extra = {
      featuredUntil: string | null;
      description: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
    };
    const extraById = new Map<string, Extra>();
    for (const f of extraRows ?? []) {
      const fid = f.id as string;
      const until = (f.featured_until as string | null) ?? null;
      // Tratamos como null si ya expiró: la UI no debe destacarlo.
      const stillActive = until != null && new Date(until) > new Date();
      const lat = f.latitude as number | null;
      const lng = f.longitude as number | null;
      extraById.set(fid, {
        featuredUntil: stillActive ? until : null,
        description: (f.description as string | null) ?? null,
        address: (f.address as string | null) ?? null,
        latitude: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : null,
        longitude: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : null,
      });
    }

    // open_hours vive en club_settings (jsonb { monday: {open, close}, ... }).
    // Calculamos el rango de hoy para mostrarlo en la card.
    const { data: settingsRows } = await supabase
      .from("club_settings")
      .select("club_id,open_hours")
      .in("club_id", ids);
    type HoursInfo = { range: string | null; isOpenNow: boolean };
    const hoursById = new Map<string, HoursInfo>();
    for (const s of settingsRows ?? []) {
      hoursById.set(s.club_id as string, computeTodayHours(s.open_hours as unknown));
    }

    return rows.map((row) => {
      const extra = extraById.get(row.id as string);
      return ClubFeaturedSchema.parse({
        id: row.id,
        slug: row.slug,
        name: row.name,
        city: row.city,
        coverUrl: row.cover_url ?? null,
        sports: row.sports ?? [],
        currency: row.currency,
        courtsCount: row.courts_count ?? 0,
        minPriceCents: row.min_price_cents ?? null,
        description: extra?.description ?? null,
        address: extra?.address ?? null,
        latitude: extra?.latitude ?? null,
        longitude: extra?.longitude ?? null,
        featuredUntil: extra?.featuredUntil ?? null,
        openHoursToday: hoursById.get(row.id as string)?.range ?? null,
        isOpenNow: hoursById.get(row.id as string)?.isOpenNow ?? false,
      });
    });
  });
}

// Calcula horario de hoy en Ecuador (UTC-5) y si el club está abierto ahora.
// Acepta el jsonb tal cual viene de la DB. Formato esperado:
// { monday: { open: "HH:MM", close: "HH:MM" }, ... }
function computeTodayHours(raw: unknown): { range: string | null; isOpenNow: boolean } {
  if (!raw || typeof raw !== "object") return { range: null, isOpenNow: false };
  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  // Ecuador = UTC-5 (sin DST). Restamos el offset al timestamp UTC.
  const ecu = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const today = DAYS[ecu.getUTCDay()];
  const dayData = (raw as Record<string, unknown>)[today];
  if (!dayData || typeof dayData !== "object") return { range: null, isOpenNow: false };
  const { open, close } = dayData as { open?: unknown; close?: unknown };
  if (typeof open !== "string" || typeof close !== "string" || !open || !close) {
    return { range: null, isOpenNow: false };
  }
  const now = `${String(ecu.getUTCHours()).padStart(2, "0")}:${String(ecu.getUTCMinutes()).padStart(2, "0")}`;
  // Comparación lexicográfica funciona porque ambos lados son "HH:MM" zero-padded.
  // No soportamos horarios que cruzan medianoche (ej. cierre 02:00 AM).
  const isOpenNow = now >= open && now < close;
  return { range: `${open} — ${close}`, isOpenNow };
}

// ── getClub (public) ────────────────────────────────────────────────────
const GetSchema = z.object({ idOrSlug: z.string() });

export async function getClub(input: unknown): Promise<ActionResult<ClubDetail>> {
  return runAction(GetSchema, input, async ({ idOrSlug }) => {
    const supabase = await getServerClient();
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);

    const clubQuery = isUuid
      ? supabase.from("clubs").select("*").eq("id", idOrSlug).single()
      : supabase.from("clubs").select("*").eq("slug", idOrSlug).single();

    const { data: club, error } = await clubQuery;
    if (error || !club) throw new MpError("CLUBS.NOT_FOUND", "Club not found", 404);

    const [{ data: settings }, { data: amenities }, { data: photos }] = await Promise.all([
      supabase.from("club_settings").select("*").eq("club_id", club.id).maybeSingle(),
      supabase.from("club_amenities").select("amenity").eq("club_id", club.id),
      supabase.from("club_photos").select("*").eq("club_id", club.id).order("ordinal"),
    ]);

    const detail: ClubDetail = {
      club: mapClub(club),
      settings: settings
        ? {
            reservationWindowDays: settings.reservation_window_days,
            cancellationWindowHours: settings.cancellation_window_hours,
            defaultSlotMinutes: settings.default_slot_minutes,
            allowWalkins: settings.allow_walkins,
            chargeNoShowPct: settings.charge_no_show_pct,
            openHours: (settings.open_hours ?? {}) as Record<string, unknown>,
          }
        : null,
      amenities: (amenities ?? []).map((a) => a.amenity as string),
      photos: (photos ?? []).map((p) => ({
        id: p.id,
        url: p.url,
        caption: p.caption ?? null,
        ordinal: p.ordinal,
      })),
    };
    return ClubDetailSchema.parse(detail);
  });
}

// ── getClubSocial (auth, dashboard) ─────────────────────────────────────
// Vista "social" del club que vive dentro del shell del dashboard.
// Devuelve: header del club + próximos torneos + miembros frecuentes
// (90d) + amigos del usuario que también juegan ahí + feed de actividad.
const SocialSchema = z.object({ slug: z.string() });

export async function getClubSocial(input: unknown): Promise<ActionResult<ClubSocialView>> {
  return runAction(SocialSchema, input, async ({ slug }) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
    const meId = user.id;

    // Cast acotado: latitude/longitude todavía no están en los types generados.
    const { data: clubRaw, error } = await supabase
      .from("clubs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,slug,name,city,country,sports,logo_url,cover_url,description,address,latitude,longitude,phone,email,approved_at,featured_until" as any)
      .eq("slug", slug)
      .maybeSingle();
    if (error || !clubRaw) throw new MpError("CLUBS.NOT_FOUND", "Club not found", 404);
    const club = clubRaw as unknown as {
      id: string;
      slug: string;
      name: string;
      city: string;
      country: string;
      sports: string[] | null;
      logo_url: string | null;
      cover_url: string | null;
      description: string | null;
      address: string | null;
      latitude: number | string | null;
      longitude: number | string | null;
      phone: string | null;
      email: string | null;
      approved_at: string | null;
      featured_until: string | null;
    };

    const clubId = club.id;

    // Detección de rol del visitante respecto a este club:
    // - admin global → "admin"
    // - role_assignments con club_id === clubId y role owner/manager → ese rol
    // - resto → "guest"
    let viewerRole: "owner" | "manager" | "admin" | "guest" = "guest";
    const { data: roleRows } = await supabase
      .from("role_assignments")
      .select("role,club_id")
      .eq("user_id", meId)
      .is("revoked_at", null);
    const roles = roleRows ?? [];
    const clubScoped = roles.find(
      (r) => r.club_id === clubId && (r.role === "owner" || r.role === "manager"),
    );
    if (clubScoped) {
      viewerRole = clubScoped.role as "owner" | "manager";
    } else if (roles.some((r) => r.role === "admin")) {
      viewerRole = "admin";
    }
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: courts },
      { data: settings },
      { data: tournamentsRaw },
      { data: matchesRaw },
      { data: reservationsRaw },
      { data: friendships },
      { data: photosRaw },
      { data: reviewsRaw },
      { count: followersCount },
      { count: myFollowCount },
      { count: matchesLast30dCount },
      { data: membershipTierRows },
      { data: myMembership },
      { data: amenitiesRaw },
    ] = await Promise.all([
      supabase.from("courts").select("id", { count: "exact", head: false }).eq("club_id", clubId),
      supabase.from("club_settings").select("open_hours").eq("club_id", clubId).maybeSingle(),
      supabase
        .from("tournaments")
        .select("id,slug,name,sport,starts_at,status,max_participants,entry_fee_cents,cover_url")
        .eq("club_id", clubId)
        // Solo torneos organizados por el propio club (sin partner externo)
        // y excluyendo cancelados/borradores.
        .is("partner_id", null)
        .not("status", "in", "(cancelled,draft)")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(6),
      supabase
        .from("matches")
        .select("id,played_at,team_a_player_ids,team_b_player_ids,status,reported_by")
        .eq("club_id", clubId)
        .gte("played_at", ninetyDaysAgo)
        .order("played_at", { ascending: false })
        .limit(200),
      supabase
        .from("reservations")
        .select("id,organizer_id,created_at,status")
        .eq("club_id", clubId)
        .gte("created_at", ninetyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("friendships")
        .select("user_a,user_b")
        .or(`user_a.eq.${meId},user_b.eq.${meId}`),
      supabase
        .from("club_photos")
        .select("id,url,caption")
        .eq("club_id", clubId)
        .order("ordinal", { ascending: true })
        .limit(12),
      supabase
        .from("club_reviews")
        .select("id,user_id,rating,comment,created_at")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(6),
      // club_followers todavía no está en los types generados; cast acotado.
      (supabase as unknown as {
        from: (t: string) => {
          select: (
            sel: string,
            opts: { count: "exact"; head: true },
          ) => {
            eq: (col: string, val: string) => Promise<{ count: number | null }>;
          };
        };
      })
        .from("club_followers")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId),
      (supabase as unknown as {
        from: (t: string) => {
          select: (
            sel: string,
            opts: { count: "exact"; head: true },
          ) => {
            eq: (
              col: string,
              val: string,
            ) => {
              eq: (col: string, val: string) => Promise<{ count: number | null }>;
            };
          };
        };
      })
        .from("club_followers")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("user_id", meId),
      supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .gte("played_at", thirtyDaysAgo),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("club_membership_tiers")
        .select("id")
        .eq("club_id", clubId)
        .eq("is_active", true)
        .order("price_cents", { ascending: true })
        .limit(1),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("club_memberships")
        .select("status,expires_at,transaction_id")
        .eq("club_id", clubId)
        .eq("user_id", meId)
        .maybeSingle(),
      supabase.from("club_amenities").select("amenity").eq("club_id", clubId),
    ]);

    // Set de amigos del user actual.
    const friendIds = new Set<string>();
    for (const f of friendships ?? []) {
      const a = f.user_a as string;
      const b = f.user_b as string;
      friendIds.add(a === meId ? b : a);
    }

    // Cuenta de partidos por jugador en últimos 90d. Unnest manual.
    const matchesByPlayer = new Map<string, { count: number; last: string }>();
    for (const m of matchesRaw ?? []) {
      const players = [
        ...((m.team_a_player_ids as string[] | null) ?? []),
        ...((m.team_b_player_ids as string[] | null) ?? []),
      ];
      const playedAt = m.played_at as string;
      for (const pid of players) {
        const cur = matchesByPlayer.get(pid);
        if (!cur) {
          matchesByPlayer.set(pid, { count: 1, last: playedAt });
        } else {
          cur.count += 1;
          if (playedAt > cur.last) cur.last = playedAt;
        }
      }
    }

    // Top miembros por cantidad de partidos.
    const topMemberIds = Array.from(matchesByPlayer.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([id]) => id);

    // Fetch perfiles de miembros + amigos + organizadores de reservas +
    // reporters de matches + autores de reseñas (todo lo que necesite avatar).
    const profileIds = new Set<string>(topMemberIds);
    for (const fid of friendIds) profileIds.add(fid);
    for (const r of reservationsRaw ?? []) {
      const oid = r.organizer_id as string | null;
      if (oid) profileIds.add(oid);
    }
    for (const m of matchesRaw ?? []) {
      const rid = m.reported_by as string | null;
      if (rid) profileIds.add(rid);
    }
    for (const rv of reviewsRaw ?? []) {
      const uid = rv.user_id as string;
      if (uid) profileIds.add(uid);
    }
    const idsArr = Array.from(profileIds);
    const { data: profilesRaw } = idsArr.length
      ? await supabase
          .from("profiles")
          .select("id,display_name,avatar_url,city")
          .in("id", idsArr)
      : { data: [] as Array<{ id: string; display_name: string | null; avatar_url: string | null; city: string | null }> };

    const profileById = new Map<
      string,
      { displayName: string; avatarUrl: string | null; city: string | null }
    >();
    for (const p of profilesRaw ?? []) {
      profileById.set(p.id as string, {
        displayName: (p.display_name as string | null) ?? "Sin nombre",
        avatarUrl: safeUrl(p.avatar_url as string | null),
        city: (p.city as string | null) ?? null,
      });
    }

    const buildMember = (id: string): ClubSocialMember => {
      const stat = matchesByPlayer.get(id);
      const prof = profileById.get(id);
      return {
        userId: id,
        displayName: prof?.displayName ?? "Jugador",
        avatarUrl: prof?.avatarUrl ?? null,
        city: prof?.city ?? null,
        matchesAtClub: stat?.count ?? 0,
        lastPlayedAt: stat?.last ?? null,
        isFriend: friendIds.has(id),
      };
    };

    const frequentMembers: ClubSocialMember[] = topMemberIds.map(buildMember);
    const friendsHere: ClubSocialMember[] = Array.from(friendIds)
      .filter((fid) => matchesByPlayer.has(fid))
      .map(buildMember)
      .sort((a, b) => b.matchesAtClub - a.matchesAtClub);

    // Próximos torneos.
    const tournamentIds = (tournamentsRaw ?? []).map((t) => t.id as string);
    const registrationCounts = new Map<string, number>();
    if (tournamentIds.length > 0) {
      const { data: regs } = await supabase
        .from("registrations")
        .select("tournament_id")
        .in("tournament_id", tournamentIds)
        .in("status", ["pending", "accepted", "waitlist"]);
      for (const r of regs ?? []) {
        const tid = r.tournament_id as string;
        registrationCounts.set(tid, (registrationCounts.get(tid) ?? 0) + 1);
      }
    }

    const upcomingTournaments: ClubSocialTournament[] = (tournamentsRaw ?? []).map((t) => ({
      id: t.id as string,
      slug: t.slug as string,
      name: t.name as string,
      sport: t.sport as string,
      startsAt: t.starts_at as string,
      status: t.status as string,
      maxParticipants: (t.max_participants as number | null) ?? null,
      entryFeeCents: (t.entry_fee_cents as number | null) ?? null,
      participantCount: registrationCounts.get(t.id as string) ?? 0,
    }));

    // Feed de actividad unificado — mezcla cronológica de torneos
    // publicados + partidos jugados + reservas creadas, cada uno con
    // actor (avatar + nombre) y thumbnail cuando aplica.
    const activity: ClubSocialActivity[] = [];

    const { data: recentTournaments } = await supabase
      .from("tournaments")
      .select("id,name,slug,sport,created_at,starts_at,cover_url,created_by")
      .eq("club_id", clubId)
      // Mismo criterio que el grid superior: solo torneos organizados por el
      // club (sin partner externo) y excluyendo cancelados/borradores.
      .is("partner_id", null)
      .not("status", "in", "(cancelled,draft)")
      .order("created_at", { ascending: false })
      .limit(6);
    // Sumar creadores al map de profiles para resolver avatares.
    const extraIds: string[] = [];
    for (const t of recentTournaments ?? []) {
      const cb = t.created_by as string | null;
      if (cb && !profileById.has(cb)) extraIds.push(cb);
    }
    if (extraIds.length > 0) {
      const { data: extraProfs } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url,city")
        .in("id", extraIds);
      for (const p of extraProfs ?? []) {
        profileById.set(p.id as string, {
          displayName: (p.display_name as string | null) ?? "Sin nombre",
          avatarUrl: (p.avatar_url as string | null) ?? null,
          city: (p.city as string | null) ?? null,
        });
      }
    }

    for (const t of recentTournaments ?? []) {
      const author = profileById.get(t.created_by as string);
      activity.push({
        id: `t-${t.id as string}`,
        kind: "tournament_published",
        at: t.created_at as string,
        title: `Publicó un torneo: ${t.name as string}`,
        sub: SPORT_LABEL_MAP[t.sport as string] ?? (t.sport as string),
        actorName: author?.displayName ?? club.name,
        actorAvatar: author?.avatarUrl ?? null,
        thumbnailUrl: safeUrl(t.cover_url as string | null),
        linkHref: `/eventos/${t.slug as string}`,
      });
    }
    for (const m of (matchesRaw ?? []).slice(0, 12)) {
      const reporter = profileById.get(m.reported_by as string);
      activity.push({
        id: `m-${m.id as string}`,
        kind: "match_played",
        at: m.played_at as string,
        title: reporter ? `${reporter.displayName} jugó un partido` : "Partido jugado",
        sub: m.status as string,
        actorName: reporter?.displayName ?? null,
        actorAvatar: reporter?.avatarUrl ?? null,
        thumbnailUrl: null,
        linkHref: null,
      });
    }
    for (const r of (reservationsRaw ?? []).slice(0, 12)) {
      const orgId = r.organizer_id as string;
      const prof = profileById.get(orgId);
      activity.push({
        id: `r-${r.id as string}`,
        kind: "reservation_created",
        at: r.created_at as string,
        title: prof ? `${prof.displayName} reservó cancha` : "Nueva reserva",
        sub: null,
        actorName: prof?.displayName ?? null,
        actorAvatar: prof?.avatarUrl ?? null,
        thumbnailUrl: null,
        linkHref: null,
      });
    }
    activity.sort((a, b) => (a.at < b.at ? 1 : -1));
    const top = activity.slice(0, 20);

    // Reviews + agregados.
    const reviewItems = (reviewsRaw ?? []).map((r) => {
      const prof = profileById.get(r.user_id as string);
      return {
        id: r.id as string,
        userDisplayName: prof?.displayName ?? "Sin nombre",
        userAvatarUrl: prof?.avatarUrl ?? null,
        rating: r.rating as number,
        comment: (r.comment as string | null) ?? null,
        createdAt: r.created_at as string,
      };
    });
    // Promedio sobre todas las reviews (no solo las top 6). Hacemos un
    // query más para count + avg total.
    const { data: ratingAgg } = await supabase
      .from("club_reviews")
      .select("rating")
      .eq("club_id", clubId);
    const allRatings = (ratingAgg ?? []).map((r) => r.rating as number);
    const avgRating =
      allRatings.length > 0
        ? allRatings.reduce((acc, v) => acc + v, 0) / allRatings.length
        : null;

    // Filtramos fotos con url inválida para que Zod no rechace el batch entero.
    const photos = (photosRaw ?? [])
      .map((p) => ({
        id: p.id as string,
        url: safeUrl(p.url as string | null),
        caption: (p.caption as string | null) ?? null,
      }))
      .filter((p): p is { id: string; url: string; caption: string | null } => p.url !== null);

    const courtsCount = (courts ?? []).length;
    const hours = computeTodayHours(settings?.open_hours as unknown);

    const tierRows = (membershipTierRows ?? []) as Array<{ id: string }>;
    const hasMembershipTiers = tierRows.length > 0;
    const cheapestTierId = tierRows[0]?.id ?? null;
    const memRow = myMembership as {
      status: string;
      expires_at: string | null;
      transaction_id: string | null;
    } | null;
    let membershipStatus: "none" | "active" | "pending" = "none";
    let pendingMembershipTxId: string | null = null;
    if (memRow) {
      if (isClubMembershipActive(memRow)) {
        membershipStatus = "active";
      } else if (memRow.status === "pending") {
        membershipStatus = "pending";
        pendingMembershipTxId = memRow.transaction_id;
      }
    }

    const { data: clubConvs } = await supabase
      .from("conversations")
      .select("id,kind")
      .eq("club_id", clubId)
      .in("kind", ["club_channel", "club_announcements"]);
    let announcementsConversationId: string | null = null;
    let communityConversationId: string | null = null;
    for (const row of clubConvs ?? []) {
      if (row.kind === "club_announcements") announcementsConversationId = row.id as string;
      if (row.kind === "club_channel") communityConversationId = row.id as string;
    }
    const isFollowing = (myFollowCount ?? 0) > 0;
    const isStaff = viewerRole === "owner" || viewerRole === "manager" || viewerRole === "admin";
    const canAccessAnnouncements = isFollowing || membershipStatus === "active" || isStaff;
    const canAccessCommunityChat = membershipStatus === "active" || isStaff;

    const admin = getAdminClient();
    const occupancy = await loadCourtOccupancy(admin, clubId);
    const amenities = (amenitiesRaw ?? []).map((a) => a.amenity as string);
    const verified = Boolean(club.approved_at);
    const featuredUntil = club.featured_until ? new Date(club.featured_until).getTime() : 0;
    const isPartner = featuredUntil > Date.now();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const nowIso = new Date().toISOString();

    const [
      { count: tournamentsThisMonth },
      { count: quedadasThisMonth },
      { count: activeGiveawaysCount },
      { count: giveawaysClosingThisWeek },
    ] = await Promise.all([
      supabase
        .from("tournaments")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .is("partner_id", null)
        .not("status", "in", "(cancelled,draft)")
        .gte("starts_at", monthStart.toISOString())
        .lte("starts_at", monthEnd.toISOString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from("quedadas")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .not("status", "eq", "cancelled")
        .gte("starts_at", monthStart.toISOString())
        .lte("starts_at", monthEnd.toISOString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from("club_giveaways")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .in("status", ["open", "closing"]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from("club_giveaways")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .in("status", ["open", "closing"])
        .gte("closes_at", nowIso)
        .lte("closes_at", weekEnd.toISOString()),
    ]);

    const tournamentsMonth = tournamentsThisMonth ?? 0;
    const quedadasMonth = quedadasThisMonth ?? 0;
    const profileStats = {
      eventsThisMonth: tournamentsMonth + quedadasMonth,
      tournamentsThisMonth: tournamentsMonth,
      quedadasThisMonth: quedadasMonth,
      activeGiveaways: activeGiveawaysCount ?? 0,
      giveawaysClosingThisWeek: giveawaysClosingThisWeek ?? 0,
      weeklyOpenHoursLabel: summarizeWeeklyOpenHours(settings?.open_hours as unknown),
    };

    return ClubSocialViewSchema.parse({
      club: {
        id: clubId,
        slug: club.slug,
        name: club.name,
        city: club.city,
        country: club.country,
        sports: (club.sports as string[] | null) ?? [],
        logoUrl: safeUrl(club.logo_url as string | null),
        coverUrl: safeUrl(club.cover_url as string | null),
        description: (club.description as string | null) ?? null,
        address: (club.address as string | null) ?? null,
        courtsCount,
        openHoursToday: hours.range,
        isOpenNow: hours.isOpenNow,
        latitude:
          club.latitude != null ? Number(club.latitude as unknown as string) : null,
        longitude:
          club.longitude != null ? Number(club.longitude as unknown as string) : null,
        phone: (club.phone as string | null) ?? null,
        email: (club.email as string | null) ?? null,
      },
      stats: {
        rating: avgRating,
        reviewsCount: allRatings.length,
        followersCount: followersCount ?? 0,
        matchesLast30d: matchesLast30dCount ?? 0,
      },
      isFollowing,
      viewerRole,
      membershipStatus,
      hasMembershipTiers,
      cheapestTierId,
      pendingMembershipTxId,
      announcementsConversationId,
      communityConversationId,
      canAccessAnnouncements,
      canAccessCommunityChat,
      upcomingTournaments,
      frequentMembers,
      friendsHere,
      activity: top,
      photos,
      reviews: reviewItems,
      courtOccupancy: occupancy.courts,
      amenities,
      verified,
      isPartner,
      profileStats,
    });
  });
}

// Normaliza un campo URL: string vacío → null, todo lo demás se devuelve
// tal cual. Evita que Zod rechace "" cuando el schema es .url().nullable().
function safeUrl(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  if (trimmed === "") return null;
  // Validación mínima: si no parece URL absoluta, también devolvemos null
  // para no romper Zod (mejor no mostrar que reventar).
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

// Lookup de deporte → label para usar en el feed sin recargar i18n entero.
const SPORT_LABEL_MAP: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
  football: "Fútbol",
  squash: "Squash",
};

// ── toggleFollowClub ────────────────────────────────────────────────────
const ToggleFollowSchema = z.object({ clubId: UuidSchema });

export async function toggleFollowClub(
  input: unknown,
): Promise<ActionResult<{ isFollowing: boolean; followersCount: number }>> {
  return runAction(ToggleFollowSchema, input, async ({ clubId }) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

    // club_followers todavía no está en types generados; cast acotado.
    type RawClient = {
      from: (t: string) => {
        select: (sel: string, opts?: { count: "exact"; head: true }) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: { club_id: string } | null }>;
            };
            maybeSingle?: () => Promise<{ data: { club_id: string } | null }>;
          } & Promise<{ count: number | null }>;
        };
        delete: () => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
        insert: (row: { club_id: string; user_id: string }) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
    const raw = supabase as unknown as RawClient;

    const { data: existing } = await raw
      .from("club_followers")
      .select("club_id")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await raw
        .from("club_followers")
        .delete()
        .eq("club_id", clubId)
        .eq("user_id", user.id);
      if (error) throw new MpError("CLUBS.DB_ERROR", error.message, 500);
    } else {
      const { error } = await raw
        .from("club_followers")
        .insert({ club_id: clubId, user_id: user.id });
      if (error) throw new MpError("CLUBS.DB_ERROR", error.message, 500);
    }

    const { count } = await raw
      .from("club_followers")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId);

    const isFollowing = !existing;
    if (isFollowing) {
      void import("@/server/actions/giveaways").then(({ syncActiveGiveawayMechanicsForClubUser }) =>
        syncActiveGiveawayMechanicsForClubUser(user.id, clubId),
      );
    }

    return { isFollowing, followersCount: count ?? 0 };
  });
}

// ── suspendClub / activateClub (admin only) ────────────────────────────

export async function suspendClub(input: unknown): Promise<ActionResult<Club>> {
  return runAction(z.object({ clubId: UuidSchema }), input, async ({ clubId }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("clubs")
      .update({ status: "suspended" } as never)
      .eq("id", clubId)
      .select()
      .single();
    if (error || !data) throw new MpError("CLUBS.UPDATE_FAILED", error?.message ?? "fail", 500);
    return mapClub(data);
  });
}

export async function activateClub(input: unknown): Promise<ActionResult<Club>> {
  return runAction(z.object({ clubId: UuidSchema }), input, async ({ clubId }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("clubs")
      .update({ status: "active" } as never)
      .eq("id", clubId)
      .select()
      .single();
    if (error || !data) throw new MpError("CLUBS.UPDATE_FAILED", error?.message ?? "fail", 500);
    return mapClub(data);
  });
}

// ── updateClub (owner/admin) ────────────────────────────────────────────
const UpdateSchema = z.object({
  clubId: UuidSchema,
  patch: ClubUpdateSchema,
});

export async function updateClub(input: unknown): Promise<ActionResult<Club>> {
  return runAction(UpdateSchema, input, async ({ clubId, patch }) => {
    await requireClubStaff(clubId);

    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.logoUrl !== undefined) payload.logo_url = patch.logoUrl;
    if (patch.coverUrl !== undefined) payload.cover_url = patch.coverUrl;
    if (patch.address !== undefined) payload.address = patch.address;
    if (patch.phone !== undefined) payload.phone = patch.phone;
    if (patch.email !== undefined) payload.email = patch.email;
    if (patch.sports !== undefined) payload.sports = patch.sports;
    if (patch.latitude !== undefined) payload.latitude = patch.latitude;
    if (patch.longitude !== undefined) payload.longitude = patch.longitude;

    const row = await runOptimisticUpdate({
      table: "clubs",
      id: clubId,
      ...(patch.expectedVersion !== undefined
        ? { expectedVersion: patch.expectedVersion }
        : {}),
      update: payload,
    });
    return mapClub(row);
  });
}

// ── club reviews ────────────────────────────────────────────────────────
async function requireUserIdForReview(): Promise<string> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

export async function listClubReviews(input: unknown): Promise<ActionResult<ClubReview[]>> {
  return runAction(z.object({ clubId: UuidSchema, limit: z.coerce.number().int().min(1).max(50).default(20) }), input, async ({ clubId, limit }) => {
    const supabase = await getServerClient();
    const { data: rows, error } = await supabase
      .from("club_reviews")
      .select("id,club_id,user_id,rating,comment,created_at,profiles!club_reviews_user_id_fkey(display_name,avatar_url)")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new MpError("REVIEWS.DB_ERROR", error.message, 500);
    return (rows ?? []).map((r) => {
      const prof = r.profiles as { display_name?: string; avatar_url?: string | null } | null;
      return ClubReviewSchema.parse({
        id: r.id,
        clubId: r.club_id,
        userId: r.user_id,
        userDisplayName: prof?.display_name ?? "Usuario",
        userAvatarUrl: prof?.avatar_url ?? null,
        rating: r.rating,
        comment: r.comment ?? null,
        createdAt: r.created_at,
      });
    });
  });
}

export async function getClubReviewStats(input: unknown): Promise<ActionResult<Map<string, ClubReviewStats>>> {
  return runAction(z.object({ clubIds: z.array(UuidSchema).min(1).max(50) }), input, async ({ clubIds }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase.rpc("get_club_review_stats", { p_club_ids: clubIds });
    if (error) throw new MpError("REVIEWS.STATS_FAILED", error.message, 500);
    const out = new Map<string, ClubReviewStats>();
    for (const row of data ?? []) {
      out.set(row.club_id as string, ClubReviewStatsSchema.parse({
        avgRating: Number(row.avg_rating),
        reviewsCount: Number(row.reviews_count),
      }));
    }
    return out;
  });
}

export async function createClubReview(input: unknown): Promise<ActionResult<ClubReview>> {
  return runAction(ClubReviewCreateSchema, input, async ({ clubId, rating, comment }) => {
    const userId = await requireUserIdForReview();
    const supabase = await getServerClient();
    // Una reseña por usuario por club — chequeo previo para devolver mensaje
    // claro (en lugar del 23505 críptico que devolvería el unique constraint).
    const { data: existing } = await supabase
      .from("club_reviews")
      .select("id")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      throw new MpError(
        "REVIEWS.ALREADY_EXISTS",
        "Ya reseñaste este club. Solo se permite una reseña por usuario.",
        409,
      );
    }
    const { data, error } = await supabase
      .from("club_reviews")
      .insert({
        club_id: clubId,
        user_id: userId,
        rating,
        comment: comment ?? null,
        reservation_id: null,
      } as never)
      .select("id,club_id,user_id,rating,comment,created_at,profiles!club_reviews_user_id_fkey(display_name,avatar_url)")
      .single();
    if (error) throw new MpError("REVIEWS.WRITE_FAILED", error.message, 500);
    const prof = (data as { profiles?: { display_name?: string; avatar_url?: string | null } }).profiles ?? null;
    return ClubReviewSchema.parse({
      id: data.id,
      clubId: data.club_id,
      userId: data.user_id,
      userDisplayName: prof?.display_name ?? "Usuario",
      userAvatarUrl: prof?.avatar_url ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      createdAt: data.created_at,
    });
  });
}

// ── Código de vinculación partner (solo staff del club) ─────────────────
const ClubIdOnlySchema = z.object({ clubId: UuidSchema });

export async function getClubPartnerLinkCode(
  input: unknown,
): Promise<ActionResult<{ linkCode: string }>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await requireClubStaff(clubId);
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("clubs")
      // partner_link_code: migración 20260701000000 — types DB pendientes de regen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("partner_link_code" as any)
      .eq("id", clubId)
      .maybeSingle();
    if (error) throw new MpError("CLUBS.READ_FAILED", error.message, 500);
    const linkCode = (data as { partner_link_code?: string } | null)?.partner_link_code;
    if (!linkCode) {
      throw new MpError("CLUBS.CODE_MISSING", "No hay código de vinculación.", 500);
    }
    return { linkCode };
  });
}

export async function regenerateClubPartnerLinkCode(
  input: unknown,
): Promise<ActionResult<{ linkCode: string }>> {
  return runAction(ClubIdOnlySchema, input, async ({ clubId }) => {
    await requireClubStaff(clubId);
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: code, error: rpcErr } = await (admin as any).rpc("gen_club_partner_link_code");
    if (rpcErr || !code) {
      throw new MpError("CLUBS.CODE_REGEN_FAILED", rpcErr?.message ?? "No se pudo generar el código", 500);
    }
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("clubs")
      .update({ partner_link_code: code } as never)
      .eq("id", clubId);
    if (error) throw new MpError("CLUBS.CODE_REGEN_FAILED", error.message, 500);
    return { linkCode: code as string };
  });
}
