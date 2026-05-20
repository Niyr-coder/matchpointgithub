// Client view de ProfileScreen — recibe data ya fetcheada del server.
"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ProfileHeaderCard } from "./ProfileHeaderCard";
import { Icon } from "@/components/Icon";
import { ImageUploader } from "@/components/ImageUploader";
import { updateMyAvatar } from "@/server/actions/me";
import { sendFriendRequest } from "@/server/actions/friends";
import { startConversation } from "@/server/actions/messaging";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { readableTextOn } from "@/lib/profile/customization-presets";
import { EditProfilePanel } from "./EditProfilePanel";

export type ProfileClub = {
  id: string;
  name: string;
  city: string;
  role: string;
  since: string;
};

export type ProfileMatch = {
  id: string;
  playedAt: string;
  sport: string;
  mode: string;
  clubName: string | null;
  result: "win" | "loss";
  sets: [number, number][];
  oppName: string;
  oppAvatarUrl: string | null;
  ratingDelta: number | null;
};

export type ModeRating = {
  currentRating: number;
  matchesTotal: number;
  wins: number;
  losses: number;
  rank: number | null;
};

export type ProfileData = {
  meUserId: string | null;
  name: string;
  username: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  primaryClub: { id: string; name: string; city: string } | null;
  clubs: ProfileClub[];
  memberSince: string;
  currentRating: number;
  rank: number | null;
  matchesTotal: number;
  wins: number;
  losses: number;
  ratings: {
    singles: ModeRating | null;
    doubles: ModeRating | null;
  };
  matchHistory: ProfileMatch[];
  // Cap aplicado al match history. null = sin cap (Mi Perfil o viewer MP+).
  // Cuando hay cap, el view muestra hint "MP+ desbloquea historial completo".
  matchHistoryCap?: number | null;
  // Insignias del catálogo con flag on/off según si el target las desbloqueó.
  badges?: Array<{ kind: string; label: string; icon: string; description: string | null; on: boolean }>;
  // Customización MP+ (mig 113) + bundles (mig 114). Server resuelve
  // ownership y solo pasa valores no-null si el target los puede usar.
  // - bannerCss: gradient del header.
  // - bodyPattern: overlay del body del header (definido por el bundle).
  // - accentHex: color principal (tinta dots, borders, números).
  // - cardStyleCss: bg/border/shadow del wrapper de stat cards + listings.
  accentHex?: string | null;
  bannerCss?: string | null;
  bodyPattern?: string | null;
  // Bundle key del banner activo (para activar animación ambient).
  bundleKey?: string | null;
  cardStyleCss?: {
    background: string;
    border?: string;
    boxShadow?: string;
    backdropFilter?: string;
    color?: string;
  } | null;
  // Valores editables del perfil propio (self-scoped; solo presente en Mi Perfil).
  // Alimenta el formulario de edición del tab Preferencias.
  editable?: EditableProfile | null;
};

// Campos que el dueño puede editar (subset de profiles mapeado a updateProfile).
export type EditableProfile = {
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  birthdate: string | null;
  phone: string | null;
  dominantHand: "left" | "right" | null;
  preferredSport: "tennis" | "padel" | "pickleball" | null;
  skillLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
  locale: "es" | "en" | "pt" | null;
};

type Mode = "mine" | "public";
type FriendState = "none" | "pending" | "friends";
type Tab = "historial" | "insignias" | "clubes" | "preferencias";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function memberLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function ratingDisplay(elo: number): string {
  return (elo / 1000).toFixed(2);
}

function winRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

function levelFromRating(elo: number): string {
  return (elo / 1000).toFixed(1);
}

const coverBtn: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  background: "rgba(0,0,0,0.5)",
  backdropFilter: "blur(8px)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 9999,
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "inherit",
};

const editAvatarBtn: CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 0,
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "#0a0a0a",
  color: "#fff",
  border: "3px solid #fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export function ProfileScreenView({
  data,
  viewerMode,
  viewerIsPremium = false,
  initialFriendship = "none",
}: {
  data: ProfileData;
  // Cuando se renderiza desde /dashboard/user/players/[username] (perfil ajeno),
  // forzamos "public". Sin esta prop, el componente se comporta como vista
  // de uno mismo.
  viewerMode?: "public";
  // True si el viewer es MP+ activo. Cuando viewerMode="public" y hay cap
  // en matchHistory, oculta el hint CTA (premium ya tiene historial completo).
  viewerIsPremium?: boolean;
  // Estado inicial de amistad viewer↔target leído del server (evita flash
  // optimista). Solo aplica cuando viewerMode === "public".
  initialFriendship?: "none" | "pending" | "friends";
}) {
  // Realtime: stats actualizan al confirmar match, role_assignments para clubes.
  useRealtimeRefresh(
    data.meUserId
      ? [
          { table: "player_stats", filter: `user_id=eq.${data.meUserId}` },
          { table: "ranking_snapshots", filter: `user_id=eq.${data.meUserId}` },
          { table: "role_assignments", filter: `user_id=eq.${data.meUserId}` },
        ]
      : [],
    { enabled: !!data.meUserId },
  );

  // mode: "mine" (vista editable propia) o "public" (vista pública, sólo lectura).
  // El toggle UI fue removido — el user que quiera ver su perfil público va a
  // /dashboard/user/players/<username>. Acá solo respetamos viewerMode si
  // viene forzado desde el page de /players (vista de otro user).
  const mode: Mode = viewerMode === "public" ? "public" : "mine";
  // Modo de juego activo para los stat blocks (singles vs doubles).
  // Default: el modo que tenga rating; si ambos, singles.
  const initialRatingMode: "singles" | "doubles" =
    data.ratings.singles ? "singles" : data.ratings.doubles ? "doubles" : "singles";
  const [ratingMode, setRatingMode] = useState<"singles" | "doubles">(initialRatingMode);
  const activeRating = data.ratings[ratingMode];
  const [tab, setTab] = useState<Tab>("historial");
  const [friend, setFriend] = useState<FriendState>(initialFriendship);
  const [avatarOverlayOpen, setAvatarOverlayOpen] = useState(false);
  const [actionPending, startActionTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const isMine = mode === "mine";

  const handleAvatarUploaded = async (publicUrl: string) => {
    const res = await updateMyAvatar({ avatarUrl: publicUrl });
    if (res.ok) {
      toast({ icon: "check", title: "Foto actualizada" });
      setAvatarOverlayOpen(false);
      router.refresh();
    } else {
      toast({ icon: "x", title: "No se pudo actualizar", sub: res.error.message });
    }
  };

  const tabs: { k: Tab; label: string; icon: string }[] = [
    { k: "historial", label: "Historial", icon: "history" },
    { k: "insignias", label: "Insignias", icon: "award" },
    { k: "clubes", label: "Clubes", icon: "building-2" },
    ...(isMine ? ([{ k: "preferencias", label: "Preferencias", icon: "settings-2" }] as const) : []),
  ];

  const level = levelFromRating(data.currentRating);

  return (
    <>

      <ProfileHeaderCard
        name={data.name}
        username={data.username}
        city={data.city}
        bio={data.bio}
        avatarUrl={data.avatarUrl}
        primaryClub={data.primaryClub ? { name: data.primaryClub.name } : null}
        memberSince={data.memberSince}
        accentHex={data.accentHex ?? null}
        bannerCss={data.bannerCss ?? null}
        bodyPattern={data.bodyPattern ?? null}
        bundleKey={data.bundleKey ?? null}
        coverButton={
          isMine ? (
            <button style={coverBtn}>
              <Icon name="camera" size={13} />
              Cambiar portada
            </button>
          ) : null
        }
        avatarEditButton={
          isMine ? (
            <button
              onClick={() => setAvatarOverlayOpen(true)}
              style={editAvatarBtn}
              aria-label="Cambiar foto de perfil"
            >
              <Icon name="pencil" size={12} color="#fff" />
            </button>
          ) : null
        }
        actions={
          <>
            {isMine ? (
              <>
                <button className="btn btn-outline" onClick={() => setTab("preferencias")}>
                  <Icon name="pencil" size={12} />
                  Editar
                </button>
                <button
                  className={`btn btn-primary${data.accentHex ? " btn-accent" : ""}`}
                  style={
                    data.accentHex
                      ? { background: data.accentHex, borderColor: data.accentHex, color: readableTextOn(data.accentHex) }
                      : undefined
                  }
                  onClick={async () => {
                    const url = `${window.location.origin}/dashboard/user/players/${data.username}`;
                    try {
                      if (typeof navigator !== "undefined" && navigator.share) {
                        await navigator.share({ title: data.name, url });
                      } else {
                        await navigator.clipboard.writeText(url);
                        toast({ icon: "check", title: "Link copiado", sub: "Comparte tu perfil" });
                      }
                    } catch {
                      /* el usuario canceló el share nativo */
                    }
                  }}
                >
                  <Icon name="share-2" size={12} />
                  Compartir
                </button>
              </>
            ) : (
              <>
                {friend === "none" && data.meUserId && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={actionPending}
                    onClick={() => {
                      if (!data.meUserId) return;
                      startActionTransition(async () => {
                        const r = await sendFriendRequest({ toUserId: data.meUserId });
                        if (!r.ok) {
                          toast({ icon: "alert-triangle", title: r.error.message });
                          return;
                        }
                        // El trigger DB auto-acepta si target es is_system —
                        // en ese caso pasa directo a friends. Para targets
                        // normales, queda en pending.
                        setFriend("pending");
                        toast({
                          icon: "user-plus",
                          title: `Solicitud enviada a ${data.name}`,
                          sub: "Le avisaremos para que acepte",
                        });
                      });
                    }}
                  >
                    <Icon name="user-plus" size={12} />
                    Agregar amigo
                  </button>
                )}
                {friend === "pending" && (
                  <button
                    type="button"
                    className="btn"
                    disabled
                    style={{
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      color: "var(--muted-fg)",
                      cursor: "default",
                    }}
                  >
                    <Icon name="clock" size={12} />
                    Solicitud enviada
                  </button>
                )}
                {friend === "friends" && (
                  <button
                    type="button"
                    className="btn"
                    disabled
                    style={{
                      background: "rgba(16,185,129,0.12)",
                      color: "var(--primary)",
                      border: "1px solid rgba(16,185,129,0.3)",
                      cursor: "default",
                    }}
                  >
                    <Icon name="user-check" size={12} color="var(--primary)" />
                    Amigos
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={actionPending || !data.meUserId}
                  onClick={() => {
                    if (!data.meUserId) return;
                    startActionTransition(async () => {
                      const r = await startConversation({
                        kind: "dm",
                        memberIds: [data.meUserId],
                      });
                      if (!r.ok) {
                        toast({ icon: "alert-triangle", title: r.error.message });
                        return;
                      }
                      router.push(`/dashboard/user/chat?conv=${r.data.id}`);
                    });
                  }}
                >
                  <Icon name="message-square" size={12} />
                  Mensaje
                </button>
                <button
                  className={`btn btn-primary${data.accentHex ? " btn-accent" : ""}`}
                  style={
                    data.accentHex
                      ? { background: data.accentHex, borderColor: data.accentHex, color: readableTextOn(data.accentHex) }
                      : undefined
                  }
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("mp-open-retar", {
                        detail: {
                          name: data.name,
                          level: parseFloat(level),
                          sport: "Pickleball",
                          city: data.city ?? "—",
                          av: data.name.split(" ").map((n) => n[0]).join("").slice(0, 2),
                          avBg: "linear-gradient(135deg,#7c3aed,#db2777)",
                        },
                      }),
                    )
                  }
                >
                  <Icon name="swords" size={12} />
                  Retar a match
                </button>
              </>
            )}
          </>
        }
      />

      <RatingStatsPanel
        ratingMode={ratingMode}
        onChange={setRatingMode}
        active={activeRating}
        accentHex={data.accentHex ?? null}
        cardStyleCss={data.cardStyleCss ?? null}
      />

      <div>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                border: 0,
                background: "transparent",
                padding: "12px 18px",
                borderBottom: tab === t.k ? "2px solid var(--primary)" : "2px solid transparent",
                color: tab === t.k ? "#0a0a0a" : "var(--muted-fg)",
                fontWeight: tab === t.k ? 900 : 600,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: -1,
              }}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ paddingTop: 20 }}>
          {tab === "historial" && (
            <>
              <MatchHistory
                matchesTotal={data.matchesTotal}
                wins={data.wins}
                losses={data.losses}
                matches={data.matchHistory}
              />
              {/* CTA upgrade cuando el viewer free está viendo el perfil
                  de otro y el historial llegó al cap. Si el target tiene
                  más partidos jugados que los devueltos, hay más por ver. */}
              {!isMine &&
                !viewerIsPremium &&
                data.matchHistoryCap != null &&
                data.matchesTotal > data.matchHistory.length && (
                  <div
                    className="card"
                    style={{
                      padding: 16,
                      marginTop: 12,
                      background: "rgba(250,204,21,0.06)",
                      border: "1px solid rgba(250,204,21,0.3)",
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <Icon name="crown" size={16} color="#facc15" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>
                        Mostrando últimos {data.matchHistoryCap} partidos
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                        Activa MatchPoint+ para ver el historial completo
                        de cualquier jugador.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/user/mi-plan?upgrade=premium")}
                      style={{
                        background: "#facc15",
                        color: "#0a0a0a",
                        border: 0,
                        padding: "8px 14px",
                        borderRadius: 9999,
                        fontSize: 10.5,
                        fontWeight: 900,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Activar MP+
                    </button>
                  </div>
                )}
            </>
          )}
          {tab === "insignias" && <BadgesGrid badges={data.badges ?? []} />}
          {tab === "clubes" && <ClubsList clubs={data.clubs} />}
          {tab === "preferencias" &&
            (data.editable ? (
              <EditProfilePanel initial={data.editable} />
            ) : (
              <div className="card" style={{ padding: 20, fontSize: 13, color: "var(--muted-fg)" }}>
                No se pudieron cargar tus datos para editar. Recarga la página.
              </div>
            ))}
        </div>
      </div>

      {avatarOverlayOpen && data.meUserId && (
        <AvatarOverlay
          userId={data.meUserId}
          currentUrl={data.avatarUrl}
          onClose={() => setAvatarOverlayOpen(false)}
          onUploaded={handleAvatarUploaded}
        />
      )}
    </>
  );
}

function AvatarOverlay({
  userId,
  currentUrl,
  onClose,
  onUploaded,
}: {
  userId: string;
  currentUrl: string | null;
  onClose: () => void;
  onUploaded: (publicUrl: string) => Promise<void> | void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 380,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3
            className="font-heading"
            style={{ margin: 0, fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}
          >
            Tu foto
          </h3>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: "transparent", border: 0, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
            ×
          </button>
        </div>
        <ImageUploader
          bucket="avatars"
          folder={userId}
          filenamePrefix="avatar"
          currentUrl={currentUrl}
          shape="circle"
          height={180}
          onUploaded={onUploaded}
        />
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 8 }}>
          JPG, PNG o WEBP · máximo 4 MB
        </div>
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  delta,
  deltaPos,
  sub,
  accentHex,
  cardStyleCss,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaPos?: boolean;
  sub?: string;
  // Customización: accent tinta border + número principal. cardStyleCss
  // (si el user MP+ eligió un card_style) reemplaza bg/border del wrapper.
  accentHex?: string | null;
  cardStyleCss?: {
    background: string;
    border?: string;
    boxShadow?: string;
    backdropFilter?: string;
    color?: string;
  } | null;
}) {
  const customBorder = cardStyleCss?.border ?? (accentHex ? `1px solid ${accentHex}` : undefined);
  return (
    <div
      className="card"
      style={{
        padding: 20,
        background: cardStyleCss?.background,
        border: customBorder,
        boxShadow: cardStyleCss?.boxShadow,
        backdropFilter: cardStyleCss?.backdropFilter,
        color: cardStyleCss?.color,
      }}
    >
      <div className="label-mp" style={cardStyleCss?.color ? { color: cardStyleCss.color, opacity: 0.7 } : undefined}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
        <div
          className="font-heading tabular"
          style={{
            fontWeight: 900,
            fontSize: 36,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: accentHex ?? cardStyleCss?.color,
          }}
        >
          {value}
        </div>
        {delta && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: deltaPos ? "var(--primary)" : "#dc2626",
            }}
          >
            {delta}
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: cardStyleCss?.color ? `${cardStyleCss.color}99` : "var(--muted-fg)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const MATCH_MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtMatchDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MATCH_MONTHS_ES[d.getMonth()]}`;
}

function matchInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

type ModeFilter = "all" | "singles" | "doubles";

function MatchHistory({
  matchesTotal,
  wins,
  losses,
  matches,
}: {
  matchesTotal: number;
  wins: number;
  losses: number;
  matches: ProfileMatch[];
}) {
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");

  if (matchesTotal === 0 || matches.length === 0) {
    return (
      <div
        className="card"
        style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}
      >
        <Icon name="history" size={32} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "#0a0a0a" }}
        >
          Aún no has jugado partidos oficiales<span className="dot">.</span>
        </div>
        <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>
          Cuando reportes tu primer match confirmado, aparece aquí con score, rival y resultado.
        </p>
      </div>
    );
  }

  const filteredMatches =
    modeFilter === "all" ? matches : matches.filter((m) => m.mode === modeFilter);

  // Resumen derivado del filtro activo: cuenta sobre los matches visibles.
  // En "Todos" usamos los totals del server (incluye casos donde el listado
  // está truncado a últimos 20); en singles/dobles contamos sobre los
  // visibles ya que el server trae limit y filtramos client-side.
  const summaryTotal = modeFilter === "all" ? matchesTotal : filteredMatches.length;
  const summaryWins =
    modeFilter === "all"
      ? wins
      : filteredMatches.filter((m) => m.result === "win").length;
  const summaryLosses =
    modeFilter === "all"
      ? losses
      : filteredMatches.filter((m) => m.result === "loss").length;
  const summaryWinRate = summaryTotal > 0 ? Math.round((summaryWins / summaryTotal) * 100) : 0;
  const summaryLabel =
    modeFilter === "all" ? "oficiales" : modeFilter === "singles" ? "singles" : "dobles";

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Resumen header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="label-mp">Resumen</div>
          <div style={{ fontSize: 13, marginTop: 4, color: "#404040" }}>
            <b style={{ color: "#0a0a0a" }}>{summaryTotal}</b> {summaryLabel} ·{" "}
            <span style={{ color: "var(--primary)", fontWeight: 800 }}>{summaryWins} W</span> ·{" "}
            <span style={{ color: "#dc2626", fontWeight: 800 }}>{summaryLosses} L</span> ·{" "}
            <b>{summaryWinRate}%</b> winrate
          </div>
        </div>
        <ModeFilterPills value={modeFilter} onChange={setModeFilter} />
      </div>

      {/* Lista de partidos */}
      <div>
        {filteredMatches.length === 0 && (
          <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
            Sin partidos en {modeFilter === "singles" ? "singles" : "dobles"} todavía.
          </div>
        )}
        {filteredMatches.map((m) => {
          const isWin = m.result === "win";
          const accent = isWin ? "var(--primary)" : "#dc2626";
          return (
            <div
              key={m.id}
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              {/* Fecha */}
              <div
                style={{
                  width: 44,
                  flexShrink: 0,
                  textAlign: "center",
                  padding: "6px 0",
                  background: "var(--muted)",
                  borderRadius: 8,
                }}
              >
                <div
                  className="font-heading tabular"
                  style={{ fontSize: 14, fontWeight: 900, lineHeight: 1 }}
                >
                  {new Date(m.playedAt).getDate()}
                </div>
                <div
                  style={{
                    fontSize: 8.5,
                    color: "var(--muted-fg)",
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    marginTop: 2,
                  }}
                >
                  {MATCH_MONTHS_ES[new Date(m.playedAt).getMonth()]}
                </div>
              </div>

              {/* Avatar opp */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: m.oppAvatarUrl
                    ? `url(${m.oppAvatarUrl}) center/cover`
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
                {!m.oppAvatarUrl && matchInitials(m.oppName)}
              </div>

              {/* Body */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>vs {m.oppName}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: accent,
                      background: isWin ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.12)",
                      padding: "2px 7px",
                      borderRadius: 9999,
                    }}
                  >
                    {isWin ? "Ganado" : "Perdido"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 3 }}>
                  {m.clubName ?? "Sin club"} · {m.mode === "doubles" ? "Dobles" : "Singles"}
                </div>
              </div>

              {/* Sets */}
              <div
                className="font-heading tabular"
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: "-0.01em",
                  color: accent,
                  whiteSpace: "nowrap",
                  textAlign: "right",
                }}
              >
                {m.sets.length > 0
                  ? m.sets.map((s) => `${s[0]}-${s[1]}`).join(" · ")
                  : "—"}
                {m.ratingDelta != null && (
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: m.ratingDelta >= 0 ? "var(--primary)" : "#dc2626",
                      marginTop: 3,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      justifyContent: "flex-end",
                    }}
                  >
                    {m.ratingDelta >= 0 ? "+" : ""}
                    {m.ratingDelta} pts
                    {m.mode === "doubles" && (
                      <span
                        title="Delta calibrado por partner strength — depende del nivel relativo de tu pareja"
                        style={{
                          fontSize: 8.5,
                          fontWeight: 900,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "var(--muted-fg)",
                          background: "var(--muted)",
                          padding: "2px 5px",
                          borderRadius: 9999,
                          cursor: "help",
                        }}
                      >
                        Calibrado
                      </span>
                    )}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--muted-fg)",
                    marginTop: 3,
                  }}
                >
                  {fmtMatchDate(m.playedAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Panel de stats que respeta el modo activo (singles vs doubles). El tab
// vive en el header del panel, alineado a la derecha para que conviva con
// el label "MP Rating" del primer stat.
function RatingStatsPanel({
  ratingMode,
  onChange,
  active,
  accentHex,
  cardStyleCss,
}: {
  ratingMode: "singles" | "doubles";
  onChange: (m: "singles" | "doubles") => void;
  active: ModeRating | null;
  accentHex?: string | null;
  cardStyleCss?: {
    background: string;
    border?: string;
    boxShadow?: string;
    backdropFilter?: string;
    color?: string;
  } | null;
}) {
  const r = active ?? { currentRating: 2500, matchesTotal: 0, wins: 0, losses: 0, rank: null };
  const wr = winRate(r.wins, r.matchesTotal);
  const isEmpty = active == null;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div className="label-mp">Estadísticas · {ratingMode === "singles" ? "Singles" : "Dobles"}</div>
        <div
          style={{
            display: "inline-flex",
            gap: 2,
            padding: 3,
            background: "#f5f5f5",
            borderRadius: 9999,
          }}
        >
          {(["singles", "doubles"] as const).map((m) => {
            const on = m === ratingMode;
            return (
              <button
                key={m}
                onClick={() => onChange(m)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 9999,
                  background: on ? "#0a0a0a" : "transparent",
                  color: on ? "#fff" : "var(--muted-fg)",
                  border: 0,
                  fontSize: 10.5,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 160ms var(--ease-out), color 160ms var(--ease-out)",
                }}
              >
                {m === "singles" ? "Singles" : "Dobles"}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
        <StatBlock
          label="MP Rating"
          value={isEmpty ? "—" : ratingDisplay(r.currentRating)}
          sub={isEmpty ? "Sin partidos" : r.rank != null ? "Oficial" : "Punto de partida"}
          accentHex={accentHex}
          cardStyleCss={cardStyleCss}
        />
        <StatBlock
          label="Ranking nacional"
          value={r.rank != null ? `#${r.rank}` : "—"}
          sub={
            r.rank != null
              ? "Pickleball"
              : r.matchesTotal < 3
                ? `${3 - r.matchesTotal} ${3 - r.matchesTotal === 1 ? "partido" : "partidos"} para clasificar`
                : "Aún sin ranking"
          }
          accentHex={accentHex}
          cardStyleCss={cardStyleCss}
        />
        <StatBlock
          label="Partidos jugados"
          value={String(r.matchesTotal)}
          sub={r.matchesTotal > 0 ? "Total" : "Empieza a jugar"}
          accentHex={accentHex}
          cardStyleCss={cardStyleCss}
        />
        <StatBlock
          label="Win rate"
          value={r.matchesTotal > 0 ? `${wr}%` : "—"}
          sub={r.matchesTotal > 0 ? `${r.wins}W · ${r.losses}L` : "—"}
          accentHex={accentHex}
          cardStyleCss={cardStyleCss}
        />
      </div>
    </div>
  );
}

function DualRatingHeader({ ratings }: { ratings: ProfileData["ratings"] }) {
  const cell = (label: string, r: ModeRating | null) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
        }}
      >
        {label}
      </span>
      {r ? (
        <span
          className="font-heading tabular"
          style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}
        >
          {ratingDisplay(r.currentRating)}
        </span>
      ) : (
        <>
          <span
            className="font-heading tabular"
            style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: "var(--muted-fg)" }}
          >
            —
          </span>
          <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>
            Sin partidos en {label.toLowerCase()}
          </span>
        </>
      )}
    </div>
  );
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 18,
        padding: "6px 14px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "#fafafa",
      }}
    >
      {cell("Singles", ratings.singles)}
      <div style={{ width: 1, background: "var(--border)" }} />
      {cell("Dobles", ratings.doubles)}
    </div>
  );
}

function ModeFilterPills({
  value,
  onChange,
}: {
  value: ModeFilter;
  onChange: (v: ModeFilter) => void;
}) {
  const opts: { k: ModeFilter; label: string }[] = [
    { k: "all", label: "Todos" },
    { k: "singles", label: "Singles" },
    { k: "doubles", label: "Dobles" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        background: "#f5f5f5",
        borderRadius: 9999,
      }}
    >
      {opts.map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k}
            onClick={() => onChange(o.k)}
            style={{
              border: 0,
              background: active ? "#0a0a0a" : "transparent",
              color: active ? "#fff" : "#737373",
              padding: "5px 12px",
              borderRadius: 9999,
              fontWeight: 800,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function BadgesGrid({
  badges,
}: {
  badges: NonNullable<ProfileData["badges"]>;
}) {
  if (badges.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--muted-fg)",
        }}
      >
        <Icon name="award" size={32} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "#0a0a0a" }}
        >
          Sin insignias todavía<span className="dot">.</span>
        </div>
        <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>
          Las insignias se desbloquean jugando partidos, ganando torneos y
          haciendo amigos en la app.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {badges.map((b) => (
        <div
          key={b.kind}
          className="card"
          style={{ padding: 18, textAlign: "center", opacity: b.on ? 1 : 0.55 }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              margin: "0 auto",
              background: b.on ? "#f0fdf4" : "#f5f5f5",
              color: b.on ? "var(--primary)" : "#a3a3a3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: b.on ? "1px solid rgba(16,185,129,0.3)" : "1px solid var(--border)",
            }}
          >
            <Icon name={b.icon} size={22} />
          </div>
          <div
            className="font-heading"
            style={{
              fontWeight: 900,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              marginTop: 12,
            }}
          >
            {b.label}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted-fg)",
              marginTop: 4,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {b.on ? "Conseguida" : b.description ?? "Por desbloquear"}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  partner: "Partner",
  coach: "Coach",
  employee: "Empleado",
  user: "Miembro",
  admin: "Admin",
};

function ClubsList({ clubs }: { clubs: ProfileClub[] }) {
  if (clubs.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--muted-fg)",
        }}
      >
        <Icon name="building-2" size={32} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "#0a0a0a" }}
        >
          Aún no perteneces a ningún club<span className="dot">.</span>
        </div>
        <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>
          Únete a un club para acceder a sus canchas, torneos y comunidad.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {clubs.map((c, i) => (
        // Composite key: un user puede tener varios role_assignments en el
        // mismo club (ej. owner + user), entonces id solo no es único.
        <div key={`${c.id}-${c.role}`} className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 10,
              background: "linear-gradient(135deg, #10b981, #047857)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>
              {c.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
              {i === 0 && (
                <span className="chip-green" style={{ fontSize: 9 }}>
                  Principal
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
              {ROLE_LABEL[c.role] ?? c.role} · Desde {memberLabel(c.since)} · {c.city}
            </div>
          </div>
          <a
            href={`/clubes/${c.id}`}
            className="btn btn-outline"
            style={{ padding: "8px 14px", textDecoration: "none" }}
          >
            Ver club
          </a>
        </div>
      ))}
    </div>
  );
}

