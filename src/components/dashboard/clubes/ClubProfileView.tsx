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
import type { ClubFeedPostView } from "@/lib/schemas/giveaways";
import type { ClubSocialView as ClubSocialViewData, ClubSocialTournament } from "@/lib/schemas/clubs";

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
  football: "Fútbol",
  squash: "Squash",
};
const MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

type Tab = "feed" | "eventos" | "reservas" | "sobre";
type MobileTab = "feed" | "eventos" | "reservar" | "sobre";

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
};

function fmtSport(s: string): string {
  return SPORT_LABEL[s] ?? s;
}

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

function closesInFromIso(iso: string | null): { days: number; hours: number } | undefined {
  if (!iso) return undefined;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { days: 0, hours: 0 };
  const hours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hours / 24), hours: hours % 24 };
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
  return {
    day: String(d.getDate()),
    month: MONTHS_SHORT[d.getMonth()],
    name: ev.name,
    meta: ev.entryFeeCents ? `$${(ev.entryFeeCents / 100).toFixed(0)}/inscripción` : "Consultar cupos",
    kind: "torneo" as const,
    taken: ev.maxParticipants ? Math.min(ev.maxParticipants, Math.floor(ev.maxParticipants * 0.6)) : undefined,
    capacity: ev.maxParticipants ?? undefined,
  };
}

const FEED_FILTERS = ["Todo", "Sorteos", "Torneos", "Quedadas", "Resultados", "Avisos"];

export function ClubProfileView({ social, feedPosts, activeGiveaways }: Props) {
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
  } = social;

  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("feed");
  const [mobileTab, setMobileTab] = useState<MobileTab>("feed");
  const [feedFilter, setFeedFilter] = useState("Todo");
  const [isFollowing, setIsFollowing] = useState(social.isFollowing);
  const [followersCount, setFollowersCount] = useState(stats.followersCount);
  const [pending, startTransition] = useTransition();
  const [joinPending, startJoin] = useTransition();

  const isStaff = viewerRole === "owner" || viewerRole === "manager" || viewerRole === "admin";
  const handle = `@${club.slug}`;

  const filteredPosts = useMemo(() => {
    if (feedFilter === "Todo") return feedPosts;
    const map: Record<string, string[]> = {
      Sorteos: ["giveaway"],
      Torneos: ["event"],
      Quedadas: ["event"],
      Resultados: ["result"],
      Avisos: ["notice", "announcement"],
    };
    const kinds = map[feedFilter] ?? [];
    return feedPosts.filter((p) => kinds.includes(p.kind));
  }, [feedFilter, feedPosts]);

  const openReservar = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mp-open-reservar"));
  };

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

  const clubAvatar = (size: number, radius: number, fontSize: number) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        background: club.coverUrl ? `url(${club.coverUrl}) center/cover` : "#fff",
        border: "3px solid rgba(255,255,255,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0a0a0a",
        fontFamily: "var(--font-heading)",
        fontWeight: 900,
        fontSize,
        letterSpacing: "-0.04em",
      }}
    >
      {!club.coverUrl && (
        <>
          <span style={{ color: "var(--primary)" }}>●</span>
          <span style={{ marginLeft: -4 }}>{club.name.slice(0, 1).toUpperCase()}</span>
        </>
      )}
    </div>
  );

  const chipOnHero = (children: ReactNode) => (
    <span
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
        chipOnHero(
          <>
            <Icon name="badge-check" size={10} /> Verificado
          </>,
        )}
      {isPartner &&
        chipOnHero(
          <>
            <Icon name="shield-check" size={10} /> Partner MATCHPOINT
          </>,
        )}
      {club.sports.map((s) => chipOnHero(fmtSport(s)))}
      {activeGiveaways.length > 0 &&
        chipOnHero(
          <>
            <Icon name="gift" size={10} /> {activeGiveaways.length} sorteo{activeGiveaways.length !== 1 ? "s" : ""} activo
            {activeGiveaways.length !== 1 ? "s" : ""}
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
                <Icon name="at-sign" size={11} /> {handle}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="map-pin" size={11} /> {club.city}
              </span>
              {stats.rating != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="star" size={11} /> {stats.rating.toFixed(1)} · {stats.reviewsCount} reseñas
                </span>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="users" size={11} /> {followersCount.toLocaleString("es-EC")} siguen
              </span>
            </div>
          </div>
          {!isStaff && (
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
          )}
        </div>
      </div>

      {/* Mobile hero — club-mobile.jsx ClubMobileHero */}
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
            pointerEvents: "none",
          }}
        >
          CLUB
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            {clubAvatar(64, 14, 26)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                {verified && (
                  <span className="chip" style={{ fontSize: 8.5, padding: "2px 6px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                    <Icon name="badge-check" size={9} /> Verificado
                  </span>
                )}
                {isPartner && (
                  <span className="chip" style={{ fontSize: 8.5, padding: "2px 6px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                    <Icon name="shield-check" size={9} /> Partner
                  </span>
                )}
                <span className="chip" style={{ fontSize: 8.5, padding: "2px 6px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                  {club.city}
                </span>
              </div>
              <h1 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0, lineHeight: 1 }}>
                {club.name}
                <span style={{ color: "var(--gw-accent)" }}>.</span>
              </h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", fontSize: 11, color: "rgba(255,255,255,0.78)", fontWeight: 600 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="star" size={10} /> {stats.rating?.toFixed(1) ?? "—"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="users" size={10} /> {followersCount.toLocaleString("es-EC")}
            </span>
          </div>
          {!isStaff && (
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1, padding: "8px 12px" }} disabled={pending} onClick={onFollow}>
                <Icon name={isFollowing ? "heart" : "user-plus"} size={11} color="#fff" /> {isFollowing ? "Siguiendo" : "Seguir"}
              </button>
              <button type="button" className="btn" style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }} onClick={openReservar}>
                <Icon name="calendar-plus" size={11} color="#fff" /> Reservar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick stats — club-web StatTile row */}
      <div className="club-profile-stats club-profile-desktop-only">
        <StatTile label="Canchas" value={String(club.courtsCount)} sub="Indoor + outdoor" />
        <StatTile label="Eventos próximos" value={String(upcomingTournaments.length)} sub="Torneos publicados" />
        <StatTile label="Sorteos activos" value={String(activeGiveaways.length)} sub="En el feed del club" color="var(--primary-dark)" />
        <StatTile label="Horario hoy" value={club.isOpenNow ? "Abierto" : "Cerrado"} sub={club.openHoursToday ?? "Consulta horarios"} />
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
          <button key={k} type="button" className="pv-tab" data-on={tab === k ? "true" : "false"} onClick={() => setTab(k)}>
            <Icon name={icon} size={11} /> {l}
          </button>
        ))}
      </div>

      {/* Mobile tab bar */}
      <div className="club-profile-mobile-only" style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
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
            onClick={() => setMobileTab(k)}
            style={{
              flex: 1,
              padding: "11px 0",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              alignItems: "center",
              background: "transparent",
              border: 0,
              borderBottom: `2px solid ${mobileTab === k ? "var(--primary)" : "transparent"}`,
              color: mobileTab === k ? "var(--fg)" : "var(--muted-fg)",
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
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {/* FEED — desktop + mobile */}
          {(tab === "feed" || mobileTab === "feed") && (
            <>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: mobileTab === "feed" ? "10px 0" : undefined, background: mobileTab === "feed" ? "#fff" : undefined }}>
                <div className="label-mp" style={{ marginRight: 6 }}>
                  Mostrar
                </div>
                {FEED_FILTERS.map((f) => (
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
                  const onCta = post.refId && post.kind === "giveaway" ? () => goGiveaway(post.refId!) : post.ctaHref ? () => router.push(post.ctaHref!) : undefined;
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
                          ctaLabel={post.ctaLabel ?? (post.kind === "giveaway" ? "Participar" : undefined)}
                          onCta={onCta}
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
                          ctaLabel={post.ctaLabel ?? (post.kind === "giveaway" ? "Participar" : undefined)}
                          onCta={onCta}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {(tab === "eventos" || mobileTab === "eventos") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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

          {(tab === "reservas" || mobileTab === "reservar") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {courtOccupancy.length > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div className="label-mp">Estado de canchas · ahora</div>
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>
                      {new Date().toLocaleString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
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

          {(tab === "sobre" || mobileTab === "sobre") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card" style={{ padding: 18 }}>
                <div className="label-mp">Sobre el club</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 0" }}>{club.description ?? "Sin descripción aún."}</p>
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
        </div>

        {/* Side rail — desktop only */}
        <div className="club-profile-rail club-profile-desktop-only">
          <RailCard title="Sorteos activos" cta="Ver todos">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeGiveaways.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>No hay sorteos abiertos.</div>
              ) : (
                activeGiveaways.slice(0, 2).map((gw) => (
                  <GiveawayMiniCard
                    key={gw.id}
                    title={gw.title}
                    entryCount={gw.entries}
                    closesIn={closesInFromIso(gw.closesAt)}
                    urgent={false}
                    onParticipate={() => goGiveaway(gw.id)}
                  />
                ))
              )}
            </div>
          </RailCard>

          <RailCard title="Próximos eventos" cta="Calendario">
            {upcomingTournaments.slice(0, 3).map((ev) => {
              const row = tournamentRow(ev);
              return <UpcomingRow key={ev.id} {...row} />;
            })}
            {upcomingTournaments.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin eventos próximos.</div>}
          </RailCard>

          {(club.phone || club.email) && (
            <RailCard title="Contacto">
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                {club.phone && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Icon name="phone" size={12} color="var(--muted-fg)" />
                    <a href={`tel:${club.phone}`} style={{ color: "inherit", textDecoration: "none" }}>
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
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Icon name="at-sign" size={12} color="var(--muted-fg)" />
                  {handle}
                </div>
              </div>
            </RailCard>
          )}
        </div>
      </div>
    </div>
  );
}
