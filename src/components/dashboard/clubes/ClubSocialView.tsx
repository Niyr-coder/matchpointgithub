// Vista "social" del club dentro del dashboard.
// Hero grande con cover + gradient + stats + follow button.
// Tabs: Resumen (feed unificado + foto strip + amigos) · Torneos · Comunidad · Reseñas.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { toggleFollowClub } from "@/server/actions/clubs";
import { requestClubMembership } from "@/server/actions/club-memberships";
import { ClubMap } from "./ClubMap";
import type {
  ClubSocialActivity,
  ClubSocialMember,
  ClubSocialPhoto,
  ClubSocialReview,
  ClubSocialTournament,
  ClubSocialView as ClubSocialViewData,
} from "@/lib/schemas/clubs";

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
  football: "Fútbol",
  squash: "Squash",
};
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtSport(s: string): string {
  return SPORT_LABEL[s] ?? s;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
}
function fmtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return fmtDate(iso);
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
function priceLabel(cents: number | null): string {
  if (cents == null || cents <= 0) return "Gratis";
  return `$${(cents / 100).toFixed(0)}`;
}

type Tab = "resumen" | "torneos" | "comunidad" | "reviews";

export function ClubSocialView({ data }: { data: ClubSocialViewData }) {
  const {
    club,
    stats,
    upcomingTournaments,
    frequentMembers,
    friendsHere,
    activity,
    photos,
    reviews,
    viewerRole,
    membershipStatus,
    hasMembershipTiers,
    cheapestTierId,
    pendingMembershipTxId,
    announcementsConversationId,
    communityConversationId,
    canAccessAnnouncements,
    canAccessCommunityChat,
  } = data;
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("resumen");
  const isStaff = viewerRole === "owner" || viewerRole === "manager" || viewerRole === "admin";
  const staffLabel: Record<typeof viewerRole, string> = {
    owner: "Eres dueño",
    manager: "Eres manager",
    admin: "Modo admin",
    guest: "",
  };
  const staffPanelHref: Record<typeof viewerRole, string> = {
    owner: "/dashboard/owner/club-config",
    manager: "/dashboard/manager/club-reservas",
    admin: `/dashboard/admin/admin-clubs/${club.id}`,
    guest: "/dashboard/user",
  };
  const [isFollowing, setIsFollowing] = useState(data.isFollowing);
  const [followersCount, setFollowersCount] = useState(stats.followersCount);
  const [pending, startTransition] = useTransition();

  const openReservar = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mp-open-reservar"));
    }
  };

  const [joinPending, startJoin] = useTransition();

  const onUnir = () => {
    if (membershipStatus === "active") return;
    if (membershipStatus === "pending" && pendingMembershipTxId) {
      router.push(`/pagos/${pendingMembershipTxId}`);
      return;
    }
    if (!hasMembershipTiers || !cheapestTierId) {
      toast({
        icon: "info",
        title: "Sin membresías disponibles",
        sub: "Este club aún no publicó planes para unirse como socio.",
      });
      return;
    }
    const section = document.getElementById("club-membresias");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    startJoin(async () => {
      const res = await requestClubMembership({ clubId: club.id, tierId: cheapestTierId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo unir al club", sub: res.error.message });
        return;
      }
      router.push(`/pagos/${res.data.transactionId}`);
    });
  };

  const onFollow = () => {
    startTransition(async () => {
      const prev = isFollowing;
      const optimisticDelta = prev ? -1 : 1;
      setIsFollowing(!prev);
      setFollowersCount((c) => c + optimisticDelta);
      const res = await toggleFollowClub({ clubId: club.id });
      if (res.ok) {
        setIsFollowing(res.data.isFollowing);
        setFollowersCount(res.data.followersCount);
      } else {
        setIsFollowing(prev);
        setFollowersCount((c) => c - optimisticDelta);
      }
    });
  };

  // Si tenemos coords usamos esas. Sino fallback al address en el link
  // "Cómo llegar". Para Google Maps el link directo funciona con address.
  const mapsLink =
    club.latitude != null && club.longitude != null
      ? `https://www.google.com/maps?q=${club.latitude},${club.longitude}`
      : club.address
        ? `https://www.google.com/maps?q=${encodeURIComponent(`${club.address}, ${club.city}`)}`
        : null;
  const hasCoords = club.latitude != null && club.longitude != null;

  return (
    <>
      {/* Banner staff: solo si el visitante es owner/manager/admin */}
      {isStaff && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "rgba(251,191,36,0.12)",
            border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: 12,
            fontSize: 12,
            color: "#92400e",
          }}
        >
          <Icon name="shield" size={14} color="#92400e" />
          <span style={{ flex: 1 }}>
            <b>{staffLabel[viewerRole]}</b> — estás viendo el perfil público de tu club.
          </span>
          <Link
            href={staffPanelHref[viewerRole]}
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#92400e",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Ir al panel
            <Icon name="arrow-right" size={12} color="#92400e" />
          </Link>
        </div>
      )}

      {/* HERO */}
      <ClubHero
        club={club}
        stats={stats}
        followersCount={followersCount}
        isFollowing={isFollowing}
        pending={pending}
        onFollow={onFollow}
        onReservar={openReservar}
        onUnir={onUnir}
        joinPending={joinPending}
        viewerRole={viewerRole}
        membershipStatus={membershipStatus}
        hasMembershipTiers={hasMembershipTiers}
        canAccessAnnouncements={canAccessAnnouncements}
        announcementsConversationId={announcementsConversationId}
        canAccessCommunityChat={canAccessCommunityChat}
        communityConversationId={communityConversationId}
      />

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--border)",
          marginTop: -4,
        }}
      >
        {([
          ["resumen", "Resumen"],
          ["torneos", `Torneos · ${upcomingTournaments.length}`],
          ["comunidad", `Comunidad · ${frequentMembers.length}`],
          ["reviews", `Reseñas · ${stats.reviewsCount}`],
        ] as [Tab, string][]).map(([k, label]) => (
          <TabButton key={k} on={tab === k} onClick={() => setTab(k)}>
            {label}
          </TabButton>
        ))}
      </div>

      {tab === "resumen" && (
        <ResumenTab
          activity={activity}
          photos={photos}
          friendsHere={friendsHere}
          frequentMembers={frequentMembers}
          nextTournament={upcomingTournaments[0] ?? null}
          mapsLink={mapsLink}
          address={club.address}
          coords={hasCoords ? { lat: club.latitude!, lng: club.longitude! } : null}
        />
      )}
      {tab === "torneos" && <TorneosTab items={upcomingTournaments} />}
      {tab === "comunidad" && <ComunidadTab friends={friendsHere} frequents={frequentMembers} />}
      {tab === "reviews" && (
        <ReviewsTab reviews={reviews} avg={stats.rating} count={stats.reviewsCount} />
      )}
    </>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────

function ClubHero({
  club,
  stats,
  followersCount,
  isFollowing,
  pending,
  onFollow,
  onReservar,
  onUnir,
  joinPending,
  viewerRole,
  membershipStatus,
  hasMembershipTiers,
  canAccessAnnouncements,
  announcementsConversationId,
  canAccessCommunityChat,
  communityConversationId,
}: {
  club: ClubSocialViewData["club"];
  stats: ClubSocialViewData["stats"];
  followersCount: number;
  isFollowing: boolean;
  pending: boolean;
  onFollow: () => void;
  onReservar: () => void;
  onUnir: () => void;
  joinPending: boolean;
  viewerRole: ClubSocialViewData["viewerRole"];
  membershipStatus: ClubSocialViewData["membershipStatus"];
  hasMembershipTiers: ClubSocialViewData["hasMembershipTiers"];
  canAccessAnnouncements: ClubSocialViewData["canAccessAnnouncements"];
  announcementsConversationId: ClubSocialViewData["announcementsConversationId"];
  canAccessCommunityChat: ClubSocialViewData["canAccessCommunityChat"];
  communityConversationId: ClubSocialViewData["communityConversationId"];
}) {
  const isOwnerOrManager = viewerRole === "owner" || viewerRole === "manager";
  const showUnir =
    !isOwnerOrManager && hasMembershipTiers && membershipStatus !== "active";
  const unirLabel =
    membershipStatus === "pending" ? "Subir comprobante" : "Unir";
  const cover = club.coverUrl;
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 16,
        overflow: "hidden",
        minHeight: 320,
        background: cover
          ? `url(${cover}) center/cover, linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #047857 100%)`
          : "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #047857 100%)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          display: "inline-flex",
          gap: 6,
          alignItems: "center",
          padding: "5px 12px",
          borderRadius: 9999,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
          fontSize: 10.5,
          fontWeight: 800,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: club.isOpenNow ? "#10b981" : "#ef4444",
          }}
        />
        {club.isOpenNow ? "Abierto" : "Cerrado"}
        {club.openHoursToday && (
          <span style={{ opacity: 0.75 }}>· {club.openHoursToday}</span>
        )}
      </div>

      <div style={{ position: "relative", padding: "28px 28px 24px", zIndex: 2 }}>
        <div className="label-mp" style={{ color: "#bbf7d0" }}>
          {club.sports.map(fmtSport).join(" · ")}
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: "10px 0 8px",
            lineHeight: 0.95,
            textShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          {club.name}
          <span style={{ color: "#fbbf24" }}>.</span>
        </h1>
        <div
          style={{
            display: "flex",
            gap: 16,
            fontSize: 12,
            color: "rgba(255,255,255,0.85)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="map-pin" size={12} color="#fff" />
            {club.city}, {club.country}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="square" size={12} color="#fff" />
            {club.courtsCount} canchas
          </span>
        </div>

        {club.description && (
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.55,
              margin: "14px 0 0",
              maxWidth: 720,
            }}
          >
            {club.description}
          </p>
        )}

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 22,
            marginTop: 20,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <HeroStat
            label="Rating"
            value={stats.rating != null ? stats.rating.toFixed(1) : "—"}
            sub={`${stats.reviewsCount} ${stats.reviewsCount === 1 ? "reseña" : "reseñas"}`}
            star={stats.rating != null}
          />
          <HeroStat
            label="Seguidores"
            value={String(followersCount)}
            sub={followersCount === 1 ? "siguiendo" : "siguiendo"}
          />
          <HeroStat
            label="Actividad"
            value={String(stats.matchesLast30d)}
            sub="partidos · 30d"
          />

          <div style={{ flex: 1 }} />
          {isOwnerOrManager ? (
            <Link
              href={viewerRole === "owner" ? "/dashboard/owner/club-config" : "/dashboard/manager/club-reservas"}
              className="mp-follow-btn"
              data-following="false"
              style={{
                padding: "10px 18px",
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#fff",
                color: "#0a0a0a",
                textDecoration: "none",
              }}
            >
              <Icon name={viewerRole === "owner" ? "settings-2" : "layout-dashboard"} size={13} color="#0a0a0a" />
              {viewerRole === "owner" ? "Editar club" : "Ir al panel"}
            </Link>
          ) : (
            <>
              <button
                onClick={onFollow}
                disabled={pending}
                className="mp-follow-btn"
                data-following={isFollowing ? "true" : "false"}
                style={{
                  padding: "10px 18px",
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: pending ? "wait" : "pointer",
                  fontFamily: "inherit",
                  border: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: isFollowing ? "rgba(255,255,255,0.18)" : "#fff",
                  color: isFollowing ? "#fff" : "#0a0a0a",
                  opacity: pending ? 0.7 : 1,
                }}
              >
                <Icon name={isFollowing ? "check" : "user-plus"} size={13} color={isFollowing ? "#fff" : "#0a0a0a"} />
                {isFollowing ? "Siguiendo" : "Seguir club"}
              </button>
              {canAccessAnnouncements && announcementsConversationId ? (
                <Link
                  href={`/dashboard/user/chat?conv=${announcementsConversationId}`}
                  className="mp-follow-btn"
                  data-following="false"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    textDecoration: "none",
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                >
                  <Icon name="megaphone" size={13} color="#fff" />
                  Anuncios
                </Link>
              ) : null}
              {canAccessCommunityChat && communityConversationId ? (
                <Link
                  href={`/dashboard/user/chat?conv=${communityConversationId}`}
                  className="mp-follow-btn"
                  data-following="false"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(37,99,235,0.35)",
                    color: "#fff",
                    textDecoration: "none",
                    border: "1px solid rgba(147,197,253,0.45)",
                  }}
                >
                  <Icon name="messages-square" size={13} color="#fff" />
                  Chat VIP
                </Link>
              ) : null}
              {showUnir && (
                <button
                  type="button"
                  onClick={onUnir}
                  disabled={joinPending}
                  className="mp-follow-btn"
                  data-following="false"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: joinPending ? "wait" : "pointer",
                    fontFamily: "inherit",
                    border: "1px solid rgba(251,191,36,0.55)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(251,191,36,0.22)",
                    color: "#fff",
                    opacity: joinPending ? 0.7 : 1,
                  }}
                >
                  <Icon name="sparkle" size={13} color="#fbbf24" />
                  {unirLabel}
                </button>
              )}
            </>
          )}
          <button
            onClick={onReservar}
            className="btn btn-primary"
            style={{ padding: "11px 18px", fontSize: 12 }}
          >
            <Icon name="calendar-plus" size={13} />
            Reservar cancha
          </button>
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  star,
}: {
  label: string;
  value: string;
  sub: string;
  star?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.6)",
        }}
      >
        {label}
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: "-0.035em",
          lineHeight: 1,
          marginTop: 4,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {star && <Icon name="star" size={20} color="#fbbf24" style={{ fill: "#fbbf24" }} />}
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px",
        background: "transparent",
        border: 0,
        borderBottom: "2px solid " + (on ? "#0a0a0a" : "transparent"),
        marginBottom: -1,
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: on ? "#0a0a0a" : "var(--muted-fg)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "color 180ms var(--ease-out), border-color 180ms var(--ease-out)",
      }}
    >
      {children}
    </button>
  );
}

// ── Resumen ────────────────────────────────────────────────────────────

function ResumenTab({
  activity,
  photos,
  friendsHere,
  frequentMembers,
  nextTournament,
  mapsLink,
  address,
  coords,
}: {
  activity: ClubSocialActivity[];
  photos: ClubSocialPhoto[];
  friendsHere: ClubSocialMember[];
  frequentMembers: ClubSocialMember[];
  nextTournament: ClubSocialTournament | null;
  mapsLink: string | null;
  address: string | null;
  coords: { lat: number; lng: number } | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.7fr 1fr",
        gap: 18,
        alignItems: "start",
      }}
    >
      {/* Left col: feed unificado */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <SocialFeed items={activity} />
      </div>

      {/* Right col: aside con próximo torneo, amigos, galería, mapa */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {nextTournament && <NextTournamentMini t={nextTournament} />}
        {friendsHere.length > 0 && (
          <AvatarStripCard title="Tus amigos aquí" items={friendsHere} />
        )}
        <AvatarStripCard title="Jugadores frecuentes" items={frequentMembers} />
        {photos.length > 0 && <PhotoGalleryMini photos={photos} />}
        {coords && mapsLink && <MapCard coords={coords} mapsLink={mapsLink} address={address} />}
      </div>
    </div>
  );
}

function SocialFeed({ items }: { items: ClubSocialActivity[] }) {
  if (items.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--muted-fg)",
        }}
      >
        <Icon name="activity" size={28} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{ fontSize: 16, fontWeight: 900, marginTop: 10, textTransform: "uppercase" }}
        >
          Sin actividad reciente
        </div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          Cuando alguien reserve, juegue o publique un torneo, aparece aquí.
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((it) => (
        <FeedItem key={it.id} item={it} />
      ))}
    </div>
  );
}

function FeedItem({ item }: { item: ClubSocialActivity }) {
  const ACTION_LABEL: Record<ClubSocialActivity["kind"], string> = {
    tournament_published: "Torneo",
    match_played: "Partido",
    reservation_created: "Reserva",
  };
  const ACCENT: Record<ClubSocialActivity["kind"], string> = {
    tournament_published: "#fbbf24",
    match_played: "#7c3aed",
    reservation_created: "#10b981",
  };
  const inner = (
    <div
      className="card"
      style={{
        padding: 16,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: item.actorAvatar
            ? `url(${item.actorAvatar}) center/cover`
            : "linear-gradient(135deg, #10b981, #047857)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {!item.actorAvatar && initials(item.actorName ?? "MP")}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: ACCENT[item.kind],
            }}
          >
            ● {ACTION_LABEL[item.kind]}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{fmtRelTime(item.at)}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, lineHeight: 1.35 }}>
          {item.title}
        </div>
        {item.sub && (
          <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3 }}>
            {item.sub}
          </div>
        )}
        {item.thumbnailUrl && (
          <div
            style={{
              marginTop: 10,
              height: 140,
              borderRadius: 10,
              background: `url(${item.thumbnailUrl}) center/cover`,
            }}
          />
        )}
      </div>
    </div>
  );
  if (item.linkHref) {
    return (
      <Link
        href={item.linkHref}
        className="mp-card-hover-still"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

function NextTournamentMini({ t }: { t: ClubSocialTournament }) {
  const d = new Date(t.startsAt);
  return (
    <Link
      href={`/eventos/${t.slug}`}
      className="mp-card-hover-still"
      style={{
        display: "flex",
        gap: 14,
        padding: 16,
        background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
        color: "#fff",
        borderRadius: 14,
        textDecoration: "none",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 52,
          textAlign: "center",
          background: "rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "8px 0",
          border: "1px solid rgba(255,255,255,0.12)",
          flexShrink: 0,
        }}
      >
        <div
          className="font-heading tabular"
          style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}
        >
          {d.getDate()}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginTop: 3,
            opacity: 0.7,
          }}
        >
          {MONTHS_ES[d.getMonth()]}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="label-mp"
          style={{ color: "#fbbf24", fontSize: 9 }}
        >
          ● Próximo torneo
        </div>
        <div
          className="font-heading"
          style={{
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: "-0.015em",
            textTransform: "uppercase",
            margin: "4px 0 4px",
            lineHeight: 1.1,
          }}
        >
          {t.name}
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)" }}>
          {fmtSport(t.sport)} · {priceLabel(t.entryFeeCents)}
        </div>
      </div>
    </Link>
  );
}

function AvatarStripCard({ title, items }: { title: string; items: ClubSocialMember[] }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div
        className="font-heading"
        style={{
          fontSize: 11.5,
          fontWeight: 900,
          letterSpacing: "-0.01em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>Sin actividad.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
          {items.slice(0, 8).map((m, i) => (
            <AvatarChip key={m.userId} name={m.displayName} url={m.avatarUrl} offset={i} />
          ))}
          {items.length > 8 && (
            <div
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: "var(--muted-fg)",
                fontWeight: 700,
              }}
            >
              +{items.length - 8}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AvatarChip({ name, url, offset }: { name: string; url: string | null; offset: number }) {
  return (
    <div
      title={name}
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: url
          ? `url(${url}) center/cover`
          : "linear-gradient(135deg, #10b981, #047857)",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9.5,
        fontWeight: 900,
        border: "2px solid #fff",
        marginLeft: offset === 0 ? 0 : -8,
        flexShrink: 0,
      }}
    >
      {!url && initials(name)}
    </div>
  );
}

function PhotoGalleryMini({ photos }: { photos: ClubSocialPhoto[] }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div
        className="font-heading"
        style={{
          fontSize: 11.5,
          fontWeight: 900,
          letterSpacing: "-0.01em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Galería · {photos.length}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {photos.slice(0, 6).map((p) => (
          <div
            key={p.id}
            title={p.caption ?? undefined}
            style={{
              aspectRatio: "1",
              borderRadius: 8,
              background: `url(${p.url}) center/cover`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MapCard({
  coords,
  mapsLink,
  address,
}: {
  coords: { lat: number; lng: number };
  mapsLink: string;
  address: string | null;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <ClubMap latitude={coords.lat} longitude={coords.lng} height={180} />
      <div
        style={{
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderTop: "1px solid var(--border)",
        }}
      >
        <Icon name="navigation" size={14} color="var(--primary)" />
        <div style={{ flex: 1, fontSize: 11.5, color: "var(--muted-fg)" }}>
          {address ?? "Sin dirección"}
        </div>
        <a
          href={mapsLink}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 10.5,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--primary)",
            textDecoration: "none",
          }}
        >
          Cómo llegar →
        </a>
      </div>
    </div>
  );
}

// ── Torneos tab ─────────────────────────────────────────────────────────

function TorneosTab({ items }: { items: ClubSocialTournament[] }) {
  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <Icon name="trophy" size={32} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{ fontSize: 18, fontWeight: 900, marginTop: 12, textTransform: "uppercase" }}
        >
          Sin torneos próximos
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 6 }}>
          Cuando se publique uno, aparecerá aquí.
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
      {items.map((t) => (
        <Link
          key={t.id}
          href={`/eventos/${t.slug}`}
          className="card mp-card-hover-still"
          style={{
            padding: 18,
            textDecoration: "none",
            color: "#0a0a0a",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 48,
                textAlign: "center",
                padding: "8px 0",
                background: "var(--muted)",
                borderRadius: 10,
              }}
            >
              <div
                className="font-heading tabular"
                style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}
              >
                {new Date(t.startsAt).getDate()}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--muted-fg)",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginTop: 3,
                }}
              >
                {MONTHS_ES[new Date(t.startsAt).getMonth()]}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="label-mp" style={{ color: "var(--muted-fg)" }}>
                {fmtSport(t.sport)}
              </div>
              <div
                className="font-heading"
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  letterSpacing: "-0.015em",
                  textTransform: "uppercase",
                  marginTop: 3,
                  lineHeight: 1.1,
                }}
              >
                {t.name}
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 10,
              borderTop: "1px dashed var(--border)",
              fontSize: 11,
              color: "var(--muted-fg)",
            }}
          >
            <span>
              {priceLabel(t.entryFeeCents)}
              {t.maxParticipants != null && ` · ${t.maxParticipants} cupos`}
            </span>
            <Icon name="arrow-right" size={13} color="var(--primary)" />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Comunidad tab ─────────────────────────────────────────────────────

function ComunidadTab({
  friends,
  frequents,
}: {
  friends: ClubSocialMember[];
  frequents: ClubSocialMember[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {friends.length > 0 && (
        <MemberSection
          title="Tus amigos juegan aquí"
          sub={`${friends.length} ${friends.length === 1 ? "amigo activo" : "amigos activos"}`}
          items={friends}
        />
      )}
      <MemberSection
        title="Jugadores frecuentes"
        sub="Últimos 90 días"
        items={frequents}
      />
    </div>
  );
}

function MemberSection({
  title,
  sub,
  items,
}: {
  title: string;
  sub: string;
  items: ClubSocialMember[];
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "14px 18px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="font-heading"
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "-0.015em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div>
      </div>
      {items.length === 0 ? (
        <div
          style={{
            padding: "26px 18px",
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 12,
          }}
        >
          <Icon name="users" size={22} color="var(--muted-fg)" />
          <div style={{ marginTop: 8 }}>Aún sin actividad.</div>
        </div>
      ) : (
        <div style={{ padding: "6px 0" }}>
          {items.map((m) => (
            <div
              key={m.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 18px",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: m.avatarUrl
                    ? `url(${m.avatarUrl}) center/cover`
                    : "linear-gradient(135deg, #10b981, #047857)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                {!m.avatarUrl && initials(m.displayName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {m.displayName}
                  {m.isFriend && (
                    <span
                      style={{
                        fontSize: 8.5,
                        fontWeight: 900,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--primary)",
                        background: "rgba(16,185,129,0.12)",
                        padding: "2px 6px",
                        borderRadius: 9999,
                      }}
                    >
                      ● amigo
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                  {m.matchesAtClub} {m.matchesAtClub === 1 ? "partido" : "partidos"}
                  {m.lastPlayedAt && ` · ${fmtRelTime(m.lastPlayedAt)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reviews tab ────────────────────────────────────────────────────────

function ReviewsTab({
  reviews,
  avg,
  count,
}: {
  reviews: ClubSocialReview[];
  avg: number | null;
  count: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        className="card"
        style={{
          padding: 22,
          display: "flex",
          gap: 22,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            className="font-heading tabular"
            style={{
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {avg != null ? avg.toFixed(1) : "—"}
            <Icon name="star" size={28} color="#fbbf24" style={{ fill: "#fbbf24" }} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 6 }}>
            Basado en {count} {count === 1 ? "reseña" : "reseñas"}
          </div>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}>
          <Icon name="message-square" size={28} color="var(--muted-fg)" />
          <div
            className="font-heading"
            style={{ fontSize: 16, fontWeight: 900, marginTop: 10, textTransform: "uppercase" }}
          >
            Aún sin reseñas
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Sé el primero en dejar una.</div>
        </div>
      ) : (
        reviews.map((r) => <ReviewCard key={r.id} review={r} />)
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: ClubSocialReview }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: review.userAvatarUrl
              ? `url(${review.userAvatarUrl}) center/cover`
              : "linear-gradient(135deg, #10b981, #047857)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {!review.userAvatarUrl && initials(review.userDisplayName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{review.userDisplayName}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
            {fmtRelTime(review.createdAt)}
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 1 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Icon
              key={n}
              name="star"
              size={13}
              color={n <= review.rating ? "#fbbf24" : "#e5e5e5"}
              style={{ fill: n <= review.rating ? "#fbbf24" : "#e5e5e5" }}
            />
          ))}
        </div>
      </div>
      {review.comment && (
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: "#0a0a0a" }}>
          {review.comment}
        </p>
      )}
    </div>
  );
}
