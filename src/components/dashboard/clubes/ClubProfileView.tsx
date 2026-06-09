"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { FeedPostCard } from "@/components/giveaways/FeedPostCard";
import { FeedPostMobile } from "@/components/giveaways/FeedPostMobile";
import { GiveawayMiniCard } from "@/components/giveaways/GiveawayMiniCard";
import { RailCard, StatTile, StripedImg, UpcomingRow } from "@/components/giveaways/handoff";
import { toggleFollowClub } from "@/server/actions/clubs";
import { requestClubMembership } from "@/server/actions/club-memberships";
import { ClubMap } from "./ClubMap";
import { ClubCourtTile } from "./ClubCourtTile";
import {
  activeGiveawayCount,
  formatEventsMonth,
  formatGiveawaysStat,
  formatHoursStat,
  formatRating,
  mapRailEvents,
  mapRailGiveaways,
} from "./club-profile-handoff";
import { useEnabledSports } from "@/components/SportsProvider";
import { PRIMARY_SPORT, sportLabel, type Sport } from "@/lib/sports";
import type { ClubSocialView as ClubSocialViewData, ClubSocialTournament } from "@/lib/schemas/clubs";
import type { ClubFeedPostView } from "@/lib/schemas/giveaways";

const MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

type ProfileTab = "feed" | "eventos" | "reservas" | "sobre";

type ActiveGiveaway = {
  id: string;
  title: string;
  subtitle: string | null;
  closesAt: string | null;
  entries: number;
};

type Props = {
  social: ClubSocialViewData;
  feedPosts: ClubFeedPostView[];
  activeGiveaways: ActiveGiveaway[];
  giveawaysEnabled: boolean;
};

function fmtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}


function feedBadge(kind: string, badge: string | null) {
  if (badge) {
    const b = badge.toUpperCase();
    if (["GIVEAWAY", "TORNEO", "RESULTADO", "FOTO", "AVISO", "SPOTLIGHT"].includes(b)) return b;
  }
  const map: Record<string, string> = {
    giveaway: "GIVEAWAY",
    event: "TORNEO",
    result: "RESULTADO",
    photo: "FOTO",
    spotlight: "SPOTLIGHT",
    notice: "AVISO",
    announcement: "AVISO",
  };
  return map[kind] ?? "AVISO";
}

function tournamentRow(ev: ClubSocialTournament) {
  const d = new Date(ev.startsAt);
  const cap = ev.maxParticipants ?? 0;
  return {
    day: String(d.getDate()),
    month: MONTHS_SHORT[d.getMonth()],
    name: ev.name,
    meta: ev.entryFeeCents
      ? `$${(ev.entryFeeCents / 100).toFixed(0)}/inscripción`
      : cap > 0
        ? `${cap} cupos`
        : "Consultar cupos",
    kind: "torneo" as const,
    taken: ev.participantCount ?? 0,
    capacity: cap > 0 ? cap : undefined,
  };
}

const FEED_FILTERS_ALL = ["Todo", "Sorteos", "Torneos", "Quedadas", "Resultados", "Avisos"] as const;

export function ClubProfileView({ social, feedPosts, activeGiveaways, giveawaysEnabled }: Props) {
  const {
    club,
    stats,
    upcomingTournaments,
    viewerRole,
    membershipStatus,
    hasMembershipTiers,
    cheapestTierId,
    pendingMembershipTxId,
    courtOccupancy,
    amenities,
    verified,
    isPartner,
    photos,
    profileStats,
  } = social;

  const router = useRouter();
  const toast = useToast();
  const { multisport, sports: platformSports } = useEnabledSports();
  const [activeTab, setActiveTab] = useState<ProfileTab>("feed");
  const [feedFilter, setFeedFilter] = useState("Todo");
  const [isFollowing, setIsFollowing] = useState(social.isFollowing);
  const [followersCount, setFollowersCount] = useState(stats.followersCount);
  const [pending, startTransition] = useTransition();
  const [joinPending, startJoin] = useTransition();

  const isStaff = viewerRole === "owner" || viewerRole === "manager" || viewerRole === "admin";
  const handle = `@${club.slug}`;
  const primaryGiveawayId = activeGiveaways[0]?.id;
  const ratingLabel = formatRating(stats.rating);
  const reviewsCount = stats.reviewsCount;
  const hasReviews = reviewsCount > 0 && ratingLabel != null;

  const feedFilters = useMemo(
    () => (giveawaysEnabled ? [...FEED_FILTERS_ALL] : FEED_FILTERS_ALL.filter((f) => f !== "Sorteos")),
    [giveawaysEnabled],
  );

  const displayPosts = useMemo(() => {
    if (giveawaysEnabled) return feedPosts;
    return feedPosts.filter((p) => p.kind !== "giveaway");
  }, [feedPosts, giveawaysEnabled]);

  const filteredPosts = useMemo(() => {
    if (feedFilter === "Todo") return displayPosts;
    const map: Record<string, string[]> = {
      Sorteos: ["giveaway"],
      Torneos: ["event"],
      Quedadas: ["event"],
      Resultados: ["result"],
      Avisos: ["notice", "announcement"],
    };
    const kinds = map[feedFilter] ?? [];
    return displayPosts.filter((p) => kinds.includes(p.kind));
  }, [feedFilter, displayPosts]);

  const railGiveaways = useMemo(
    () => (giveawaysEnabled ? mapRailGiveaways(activeGiveaways) : []),
    [activeGiveaways, giveawaysEnabled],
  );
  const railEvents = useMemo(
    () =>
      mapRailEvents(
        upcomingTournaments.map((t) => ({
          id: t.id,
          name: t.name,
          startsAt: t.startsAt,
          entryFeeCents: t.entryFeeCents,
          maxParticipants: t.maxParticipants,
          participantCount: t.participantCount,
        })),
      ),
    [upcomingTournaments],
  );

  const eventsStat = formatEventsMonth(profileStats);
  const giveawaysStat = giveawaysEnabled ? formatGiveawaysStat(profileStats, activeGiveaways.length) : null;
  const hoursStat = formatHoursStat(club.openHoursToday, profileStats.weeklyOpenHoursLabel);
  const giveawayBadgeCount = giveawaysEnabled ? activeGiveawayCount(profileStats, activeGiveaways.length) : 0;

  const visibleClubSports = useMemo(() => {
    const allowed = new Set(platformSports);
    return club.sports.filter((s): s is Sport => allowed.has(s as Sport));
  }, [club.sports, platformSports]);

  const courtsSub = useMemo(() => {
    if (visibleClubSports.length > 0) {
      return visibleClubSports.map(sportLabel).join(" · ");
    }
    if (!multisport) return sportLabel(PRIMARY_SPORT);
    if (club.courtsCount > 0) return `${club.courtsCount} en el club`;
    return undefined;
  }, [visibleClubSports, multisport, club.courtsCount]);

  const primarySport = visibleClubSports[0] ?? PRIMARY_SPORT;

  const clubImageUrl = club.logoUrl ?? photos[0]?.url ?? null;

  const openReservar = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("mp-open-reservar", {
        detail: {
          clubId: club.id,
          clubSlug: club.slug,
          name: club.name,
          city: `${club.city} · ${club.courtsCount} cancha${club.courtsCount !== 1 ? "s" : ""}`,
          sport: primarySport,
        },
      }),
    );
  };

  const onShareClub = () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      void navigator.share({ title: club.name, url }).catch(() => undefined);
      return;
    }
    void navigator.clipboard.writeText(url).then(() => {
      toast({ icon: "success", title: "Enlace copiado", sub: "Pégalo donde quieras compartir el club." });
    });
  };

  const mobileHeroChip = (children: ReactNode) => (
    <span className="chip" style={{ fontSize: 8.5, padding: "2px 6px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
      {children}
    </span>
  );

  const onFollow = () => {
    startTransition(async () => {
      const res = await toggleFollowClub({ clubId: club.id });
      if (!res.ok) {
        toast({ icon: "error", title: "No se pudo actualizar", sub: res.error.message });
        return;
      }
      setIsFollowing(res.data.isFollowing);
      setFollowersCount(res.data.followersCount);
    });
  };

  const mobileHeroActions = (
    <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
      <button type="button" className="btn btn-primary" style={{ flex: 1, padding: "8px 12px" }} disabled={pending} onClick={onFollow}>
        <Icon name={isFollowing ? "heart" : "user-plus"} size={11} color="#fff" /> {isFollowing ? "Siguiendo" : "Seguir"}
      </button>
      <button type="button" className="btn" style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }} onClick={openReservar}>
        <Icon name="calendar-plus" size={11} color="#fff" /> Reservar
      </button>
      <button type="button" className="btn" style={{ padding: "8px 10px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }} aria-label="Compartir club" onClick={onShareClub}>
        <Icon name="share-2" size={11} color="#fff" />
      </button>
    </div>
  );

  const onUnir = () => {
    if (membershipStatus === "active") return;
    if (membershipStatus === "pending" && pendingMembershipTxId) {
      router.push(`/pagos/${pendingMembershipTxId}`);
      return;
    }
    if (!hasMembershipTiers || !cheapestTierId) {
      toast({ icon: "info", title: "Sin membresías disponibles", sub: "Este club aún no publicó planes." });
      return;
    }
    startJoin(async () => {
      const res = await requestClubMembership({ clubId: club.id, tierId: cheapestTierId });
      if (!res.ok) {
        toast({ icon: "error", title: "No se pudo solicitar", sub: res.error.message });
        return;
      }
      if (res.data.transactionId) router.push(`/pagos/${res.data.transactionId}`);
    });
  };

  const goGiveaway = (id: string) => router.push(`/dashboard/clubes/giveaways/${id}`);

  const resolveFeedPostCta = (post: ClubFeedPostView): (() => void) | undefined => {
    if (post.kind === "giveaway" && !giveawaysEnabled) return undefined;
    if (post.refId && post.kind === "giveaway") return () => goGiveaway(post.refId!);
    if (post.ctaHref) return () => router.push(post.ctaHref!);
    if (post.kind === "giveaway" && primaryGiveawayId) return () => goGiveaway(primaryGiveawayId);
    if (post.kind === "event" && upcomingTournaments[0]) {
      return () => router.push(`/eventos/${upcomingTournaments[0].slug}`);
    }
    return undefined;
  };

  const resolveRailEventClick = (evId: string) => {
    const t = upcomingTournaments.find((x) => x.id === evId);
    if (t) return () => router.push(`/eventos/${t.slug}`);
    return () => setActiveTab("eventos");
  };

  const feedInteractionSoon = (label: string) => {
    toast({ icon: "info", title: "Próximamente", sub: `${label} llegará en una próxima versión del feed.` });
  };

  const mapsUrl =
    club.latitude != null && club.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${club.latitude},${club.longitude}`
      : club.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${club.address}, ${club.city}`)}`
        : null;

  const heroWordmark = (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        fontFamily: "var(--font-heading)",
        fontWeight: 900,
        fontSize: "clamp(100px, 18vw, 220px)",
        color: "rgba(255,255,255,0.05)",
        letterSpacing: "-0.06em",
        lineHeight: 0.8,
        transform: "rotate(-6deg) translate(8%, -28%)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      CLUB
    </div>
  );

  const clubAvatar = (size: number, radius: number, fontSize: number, letterOffset = -4) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        background: "#fff",
        border: `${size <= 64 ? 2 : 3}px solid rgba(255,255,255,${size <= 64 ? "0.2" : "0.18"})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0a0a0a",
        fontFamily: "var(--font-heading)",
        fontWeight: 900,
        fontSize,
        letterSpacing: "-0.04em",
        overflow: "hidden",
      }}
    >
      {clubImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clubImageUrl}
          alt={`Logo de ${club.name}`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <>
          <span style={{ color: "var(--primary)" }}>●</span>
          <span style={{ marginLeft: letterOffset }}>{club.name.slice(0, 1).toUpperCase()}</span>
        </>
      )}
    </div>
  );

  const heroChip = (key: string, children: ReactNode) => (
    <span
      key={key}
      className="chip"
      style={{
        background: "rgba(255,255,255,0.14)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.22)",
      }}
    >
      {children}
    </span>
  );

  const heroBadges = (
    <>
      {verified &&
        heroChip(
          "verified",
          <>
            <Icon name="badge-check" size={10} /> Verificado
          </>,
        )}
      {isPartner &&
        heroChip(
          "partner",
          <>
            <Icon name="shield-check" size={10} /> Partner MATCHPOINT
          </>,
        )}
      {giveawaysEnabled &&
        giveawayBadgeCount > 0 &&
        heroChip(
          "giveaways",
          <>
            <Icon name="gift" size={10} /> {giveawayBadgeCount} sorteo{giveawayBadgeCount !== 1 ? "s" : ""} activo
          </>,
        )}
    </>
  );

  return (
    <div className="club-profile-shell">
      <div
        className="club-profile-breadcrumb club-profile-desktop-only"
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}
      >
        <Link href="/dashboard/user/clubes" style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Icon name="arrow-left" size={11} /> Clubes
        </Link>
        <Icon name="chevron-right" size={10} />
        <span style={{ color: "var(--fg)" }}>{club.name}</span>
      </div>

      {/* Desktop hero — club-web.jsx ClubCoverHero */}
      <div
        className="club-profile-desktop-only hero-emerald pv-rise"
        style={{
          position: "relative",
          borderRadius: 14.4,
          overflow: "hidden",
          color: "#fff",
          padding: "28px 32px",
          minHeight: 220,
        }}
      >
        {heroWordmark}
        <div style={{ position: "relative", display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
          {clubAvatar(96, 18, 36)}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{heroBadges}</div>
            <h1
              className="font-heading"
              style={{
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                margin: 0,
                lineHeight: 1,
              }}
            >
              {club.name}
              <span style={{ color: "var(--gw-accent)" }}>.</span>
            </h1>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 8,
                flexWrap: "wrap",
                fontSize: 12,
                color: "rgba(255,255,255,0.78)",
                fontWeight: 600,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="at-sign" size={11} /> {club.slug}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="map-pin" size={11} /> {club.city}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="star" size={11} />{" "}
                {hasReviews ? `${ratingLabel} · ${reviewsCount} reseña${reviewsCount !== 1 ? "s" : ""}` : "Sin reseñas aún"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="users" size={11} /> {followersCount.toLocaleString("es-EC")} siguen
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={onFollow}>
              <Icon name={isFollowing ? "heart" : "user-plus"} size={12} />
              {isFollowing ? "Siguiendo" : "Seguir"}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ background: "rgba(255,255,255,0.08)", color: "#fff", borderColor: "rgba(255,255,255,0.28)" }}
              onClick={openReservar}
            >
              <Icon name="calendar-plus" size={12} /> Reservar
            </button>
          </div>
        </div>
      </div>

      {/* Mobile hero — club-mobile.jsx ClubMobileHero (inline 1:1) */}
      <div className="club-profile-mobile-only hero-emerald" style={{ position: "relative", color: "#fff", padding: "16px 18px 18px", overflow: "hidden" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 130,
            color: "rgba(255,255,255,0.06)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -25%)",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          CLUB
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            {clubAvatar(64, 14, 26, -2)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                {verified && mobileHeroChip(<><Icon name="badge-check" size={8} /> Verificado</>)}
                {isPartner && mobileHeroChip(<><Icon name="shield-check" size={8} /> Partner</>)}
              </div>
              <h1
                className="font-heading"
                style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0, lineHeight: 1 }}
              >
                {club.name}
                <span style={{ color: "var(--gw-accent)" }}>.</span>
              </h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", fontSize: 11, color: "rgba(255,255,255,0.78)", fontWeight: 600 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="map-pin" size={10} /> {club.city}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="star" size={10} /> {hasReviews ? ratingLabel : "—"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="users" size={10} /> {followersCount.toLocaleString("es-EC")}
            </span>
          </div>
          {mobileHeroActions}
        </div>
      </div>

      {/* Quick stats — club-web StatTile row */}
      <div
        className={`club-profile-stats club-profile-desktop-only${giveawaysEnabled ? "" : " club-profile-stats--three-cols"}`}
      >
        <StatTile label="Canchas" value={String(club.courtsCount)} sub={courtsSub} />
        <StatTile label="Eventos del mes" value={eventsStat.value} sub={eventsStat.sub} />
        {giveawaysEnabled && giveawaysStat && (
          <StatTile label="Sorteos activos" value={giveawaysStat.value} sub={giveawaysStat.sub} color="var(--primary-dark)" />
        )}
        <StatTile label="Horario hoy" value={hoursStat.value} sub={hoursStat.sub} />
      </div>

      {/* Desktop tabs */}
      <div className="club-profile-desktop-only" style={{ display: "flex", gap: 22, padding: "0 2px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {(
          [
            ["feed", "Feed", "rss"],
            ["eventos", "Eventos", "trophy"],
            ["reservas", "Reservar", "calendar"],
            ["sobre", "Sobre el club", "info"],
          ] as const
        ).map(([k, l, icon]) => (
          <button key={k} type="button" className="pv-tab" data-on={activeTab === k ? "true" : "false"} onClick={() => setActiveTab(k)}>
            <Icon name={icon} size={11} /> {l}
          </button>
        ))}
      </div>

      {/* Mobile tab bar */}
      <div className="club-profile-mobile-only club-profile-mobile-tabs">
        {(
          [
            ["feed", "Feed", "rss"],
            ["eventos", "Eventos", "trophy"],
            ["reservar", "Reservar", "calendar"],
            ["sobre", "Info", "info"],
          ] as const
        ).map(([k, l, icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setActiveTab(k === "reservar" ? "reservas" : k)}
            style={{
              flex: 1,
              padding: "11px 0",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              alignItems: "center",
              background: "transparent",
              border: 0,
              borderBottom: `2px solid ${(k === "reservar" ? activeTab === "reservas" : activeTab === k) ? "var(--primary)" : "transparent"}`,
              color: (k === "reservar" ? activeTab === "reservas" : activeTab === k) ? "var(--fg)" : "var(--muted-fg)",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <Icon name={icon} size={14} />
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{l}</span>
          </button>
        ))}
      </div>

      <div className="club-profile-main-grid">
        <div className="club-profile-main-column">
          {/* FEED — desktop + mobile */}
          {activeTab === "feed" && (
            <>
              <div className="club-profile-mobile-feed-filters club-profile-mobile-only">
                <div className="label-mp" style={{ marginRight: 2, flexShrink: 0 }}>
                  Mostrar
                </div>
                {feedFilters.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`chip ${feedFilter === f ? "chip-onyx" : ""}`}
                    style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
                    onClick={() => setFeedFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="club-profile-desktop-only" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <div className="label-mp" style={{ marginRight: 6 }}>
                  Mostrar
                </div>
                {feedFilters.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`chip ${feedFilter === f ? "chip-onyx" : ""}`}
                    style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
                    onClick={() => setFeedFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {filteredPosts.length === 0 ? (
                <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
                  Aún no hay publicaciones en el feed.
                </div>
              ) : (
                filteredPosts.map((post) => {
                  const badge = feedBadge(post.kind, post.badge) as "GIVEAWAY" | "TORNEO" | "RESULTADO" | "FOTO" | "AVISO" | "SPOTLIGHT";
                  const onCta = resolveFeedPostCta(post);
                  const ctaLabel =
                    onCta && (post.ctaLabel ?? (post.kind === "giveaway" ? "Participar" : post.kind === "event" ? "Inscribirme" : undefined));
                  return (
                    <div key={post.id}>
                      <div className="club-profile-desktop-only">
                        <FeedPostCard
                          clubName={club.name}
                          clubHandle={handle}
                          postedAt={fmtRelTime(post.publishedAt)}
                          badge={badge}
                          title={post.title}
                          body={post.body ?? ""}
                          imageUrl={post.mediaUrl}
                          imageLabel={post.mediaUrl ? undefined : post.title.slice(0, 24).toUpperCase()}
                          ctaLabel={ctaLabel}
                          onCta={onCta}
                          onLike={() => feedInteractionSoon("Los likes")}
                          onComment={() => feedInteractionSoon("Los comentarios")}
                          onShare={onShareClub}
                          likes={0}
                          comments={0}
                        />
                      </div>
                      <div className="club-profile-mobile-only">
                        <FeedPostMobile
                          clubName={club.name}
                          postedAt={fmtRelTime(post.publishedAt)}
                          badge={badge}
                          title={post.title}
                          body={post.body ?? ""}
                          imageUrl={post.mediaUrl}
                          imageLabel={post.mediaUrl ? undefined : post.title.slice(0, 20).toUpperCase()}
                          ctaLabel={ctaLabel}
                          onCta={onCta}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === "eventos" && (
            <div className="club-profile-mobile-tab-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="label-mp">Próximos eventos del club</div>
              {upcomingTournaments.length === 0 ? (
                <div className="card" style={{ padding: 24, color: "var(--muted-fg)", fontSize: 13 }}>No hay eventos próximos.</div>
              ) : (
                upcomingTournaments.map((ev) => {
                  const row = tournamentRow(ev);
                  return (
                    <div
                      key={ev.id}
                      className="card"
                      style={{ padding: 14, display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 14, alignItems: "center" }}
                    >
                      <div
                        style={{
                          textAlign: "center",
                          padding: "6px 0",
                          borderRadius: 10,
                          background: "var(--warn-bg)",
                          color: "var(--warn-fg)",
                        }}
                      >
                        <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
                          {row.day}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".1em", marginTop: 2 }}>{row.month}</div>
                      </div>
                      <div>
                        <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
                          {row.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted-fg)", fontWeight: 600, marginTop: 3 }}>{row.meta}</div>
                      </div>
                      <Link href={`/dashboard/eventos/${ev.slug}`} className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
                        Ver
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "reservas" && (
            <div className="club-profile-mobile-tab-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {courtOccupancy.length > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div className="label-mp">Estado de canchas · ahora</div>
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>
                      {new Date().toLocaleString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="club-profile-courts-grid">
                    {courtOccupancy.map((c) => (
                      <ClubCourtTile key={c.id} court={c} onReserve={openReservar} />
                    ))}
                  </div>
                </>
              )}
              <div className="card" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center", background: "#0a0a0a", color: "#fff", borderColor: "#0a0a0a", flexWrap: "wrap" }}>
                <Icon name="calendar-check-2" size={22} color="var(--primary)" />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>
                    Reserva en bloque
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                    {club.courtsCount} cancha{club.courtsCount !== 1 ? "s" : ""}. Bloquea 1–4 horas. Pago por adelantado según política del club.
                  </div>
                </div>
                <button type="button" className="btn btn-primary" onClick={openReservar}>
                  Abrir calendario
                </button>
              </div>
            </div>
          )}

          {activeTab === "sobre" && (
            <div className="club-profile-mobile-tab-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card" style={{ padding: 18 }}>
                <div className="label-mp">Sobre el club</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 0", color: club.description?.trim() ? "inherit" : "var(--muted-fg)" }}>
                  {club.description?.trim() ? club.description : "Este club aún no publicó una descripción."}
                </p>
              </div>
              {amenities.length > 0 && (
                <div className="card" style={{ padding: 18 }}>
                  <div className="label-mp">Servicios</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {amenities.map((a) => (
                      <span key={a} className="chip">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {club.address && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {club.latitude != null && club.longitude != null ? (
                    <ClubMap latitude={club.latitude} longitude={club.longitude} height={180} />
                  ) : (
                    <StripedImg label={`MAPA · ${club.city.toUpperCase()}`} height={180} style={{ borderRadius: 0 }} />
                  )}
                  <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{club.city}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{club.address}</div>
                    </div>
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm" style={{ textDecoration: "none" }}>
                        <Icon name="navigation" size={12} /> Cómo llegar
                      </a>
                    )}
                  </div>
                </div>
              )}
              {hasMembershipTiers && membershipStatus !== "active" && !isStaff && (
                <button type="button" className="btn btn-onyx" disabled={joinPending} onClick={onUnir}>
                  Unirme como socio
                </button>
              )}
            </div>
          )}
          <div className="club-profile-mobile-only" style={{ height: 24 }} aria-hidden />
        </div>

        {/* Side rail — desktop only (col. 2) */}
        <div className="club-profile-rail club-profile-desktop-only">
          {giveawaysEnabled && (
            <RailCard
              title="Sorteos activos"
              cta="Ver todos"
              onCta={() => {
                setActiveTab("feed");
                setFeedFilter("Sorteos");
              }}
            >
              {railGiveaways.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted-fg)", fontWeight: 600 }}>No hay sorteos activos.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {railGiveaways.map((gw) => (
                    <GiveawayMiniCard
                      key={gw.id}
                      title={gw.title}
                      imageLabel={gw.imageLabel}
                      entryCount={gw.entryCount}
                      myEntries={gw.myEntries}
                      closesIn={gw.closesIn}
                      urgent={gw.urgent}
                      onParticipate={() => goGiveaway(gw.id)}
                    />
                  ))}
                </div>
              )}
            </RailCard>
          )}

          <RailCard
            title="Próximos eventos"
            cta="Calendario"
            onCta={() => setActiveTab("eventos")}
          >
            {railEvents.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-fg)", fontWeight: 600 }}>No hay eventos próximos.</div>
            ) : (
              railEvents.map((ev) => (
                <UpcomingRow
                  key={ev.id}
                  day={ev.day}
                  month={ev.month}
                  name={ev.name}
                  meta={ev.meta}
                  taken={ev.taken}
                  capacity={ev.capacity}
                  kind={ev.kind}
                  onClick={resolveRailEventClick(ev.id)}
                />
              ))
            )}
          </RailCard>

          {(club.phone || club.email) && (
          <RailCard title="Contacto">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {club.phone && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Icon name="phone" size={12} color="var(--muted-fg)" />
                  <a href={`tel:${club.phone.replace(/\s/g, "")}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {club.phone}
                  </a>
                </div>
              )}
              {club.email && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Icon name="mail" size={12} color="var(--muted-fg)" />
                  <a href={`mailto:${club.email}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {club.email}
                  </a>
                </div>
              )}
            </div>
          </RailCard>
          )}
        </div>
      </div>
    </div>
  );
}
