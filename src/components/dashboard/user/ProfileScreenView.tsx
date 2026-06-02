"use client";

import { useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ImageUploader } from "@/components/ImageUploader";
import { updateMyAvatar } from "@/server/actions/me";
import { sendFriendRequest } from "@/server/actions/friends";
import { startConversation } from "@/server/actions/messaging";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { EditProfilePanel } from "./EditProfilePanel";
import { EditBioModal } from "./EditBioModal";
import { RatingSparkline } from "../widgets/RatingSparkline";
import { MP_GRADIENT_SURFACE_PREMIUM_DARK, MP_GRADIENT_SURFACE_SOCIAL_DARK } from "@/lib/ui/gradients";
import { defaultShowcasePins, type ShowcasePins } from "@/lib/profile/showcase-pins";

/** Rehabilitar cuando el showcase tenga persistencia en BD y copy final. */
const PROFILE_SHOWCASE_ENABLED = false;

import type {
  ProfileClub,
  ProfileMatch,
  ModeRating,
  RatingSnapshotPoint,
  CoachShotInsight,
  ProfileUpcomingItem,
  ProfileFriendPreviewMember,
  ProfileFriendPreview,
  ProfileData,
  EditableProfile,
} from "./profile-types";

export type {
  ProfileClub,
  ProfileMatch,
  ModeRating,
  RatingSnapshotPoint,
  CoachShotInsight,
  ProfileUpcomingItem,
  ProfileFriendPreviewMember,
  ProfileFriendPreview,
  ProfileData,
  EditableProfile,
};

type Mode = "mine" | "public";
type FriendState = "none" | "pending" | "friends";
type RatingMode = "singles" | "doubles";

const tk = {
  bg: "#fafaf9",
  card: "#fff",
  soft: "#fbfaf7",
  border: "#e5e5e5",
  borderSoft: "#f0efeb",
  ink: "#0a0a0a",
  inkSoft: "#262626",
  muted: "#737373",
  mutedSoft: "#a3a3a3",
  accent: "#10b981",
  accentDeep: "#047857",
  accentSoft: "rgba(16,185,129,0.1)",
  accentRing: "rgba(16,185,129,0.28)",
  gold: "#d4a13a",
  goldSoft: "rgba(212,161,58,0.12)",
  goldRing: "rgba(212,161,58,0.45)",
  hot: "#dc2626",
  amber: "#f59e0b",
  cover: "linear-gradient(135deg, #064e3b 0%, #0a0a0a 55%, #022c22 100%)",
  coverGlow: "rgba(16,185,129,0.32)",
};

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const HOURS = ["6-9", "9-12", "12-15", "15-18", "18-21", "21-24"];

function memberLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function ratingDisplay(elo: number): string {
  return (elo / 1000).toFixed(2);
}

function levelFromRating(elo: number): string {
  return (elo / 1000).toFixed(1);
}

function winRate(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

const COVER_ACTIVE_DAYS = 30;
const COVER_RECENT_DAYS = 90;
const COVER_GOOD_STREAK = 3;

type CoverChipSpec = { label: string; icon?: string; green?: boolean };

function profileMatchesForMode(matches: ProfileMatch[], mode: RatingMode): ProfileMatch[] {
  return matches.filter((m) => m.mode === mode);
}

function winStreakFromRecent(matches: ProfileMatch[]): number {
  let streak = 0;
  for (const m of matches) {
    if (m.result === "win") streak++;
    else break;
  }
  return streak;
}

function daysSinceIso(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

/** Chips del cover del hero: solo si hay señal en el historial del modo activo. */
function buildHeroCoverChips(matches: ProfileMatch[]): CoverChipSpec[] {
  if (matches.length === 0) return [];

  const chips: CoverChipSpec[] = [];
  const streak = winStreakFromRecent(matches);
  const daysSinceLast = daysSinceIso(matches[0].playedAt);

  if (streak >= COVER_GOOD_STREAK) {
    chips.push({ label: "Buena racha", icon: "flame" });
  } else if (streak >= 2) {
    chips.push({ label: `Racha ${streak}`, icon: "flame" });
  } else if (daysSinceLast !== null && daysSinceLast <= COVER_RECENT_DAYS) {
    chips.push({ label: "En competencia", icon: "flame" });
  }

  if (daysSinceLast !== null && daysSinceLast <= COVER_ACTIVE_DAYS) {
    chips.push({ label: "Activo", green: true });
  }

  return chips;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function fmtMatchDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function scoreText(match: ProfileMatch): string {
  return match.sets.length > 0 ? match.sets.map((s) => `${s[0]}-${s[1]}`).join(", ") : "—";
}

const STARTING_RATING = 2500;

const RATING_RANGES = ["3M", "6M", "1A"] as const;
type RatingRange = (typeof RATING_RANGES)[number];

const RATING_RANGE_META: Record<RatingRange, { days: number; chartLabel: string }> = {
  "3M": { days: 90, chartLabel: "3M" },
  "6M": { days: 180, chartLabel: "6M" },
  "1A": { days: 365, chartLabel: "12M" },
};

const MONTHS_CHART = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function filterSnapshotsByRange(snapshots: RatingSnapshotPoint[], days: number): RatingSnapshotPoint[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((s) => +new Date(s.snapshotAt) >= cutoff);
}

function ensureRatingChartHistory(
  history: RatingSnapshotPoint[],
  currentRating: number,
  periodDays: number,
): RatingSnapshotPoint[] {
  if (history.length >= 2) return history;
  const now = new Date();
  const past = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  return [
    { rating: STARTING_RATING, snapshotAt: past.toISOString() },
    { rating: currentRating, snapshotAt: now.toISOString() },
  ];
}

function chartAxisLabels(points: RatingSnapshotPoint[], maxLabels = 12): string[] {
  const sorted = [...points].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt));
  if (sorted.length === 0) return [];
  if (sorted.length <= maxLabels) {
    return sorted.map((p) => MONTHS_CHART[new Date(p.snapshotAt).getMonth()]);
  }
  return Array.from({ length: maxLabels }, (_, i) => {
    const idx = Math.round((i / (maxLabels - 1)) * (sorted.length - 1));
    return MONTHS_CHART[new Date(sorted[idx].snapshotAt).getMonth()];
  });
}

function buildHeatmap(matches: ProfileMatch[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => 0));
  for (const match of matches) {
    const d = new Date(match.playedAt);
    if (Number.isNaN(d.getTime())) continue;
    const day = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    const bucket = hour < 9 ? 0 : hour < 12 ? 1 : hour < 15 ? 2 : hour < 18 ? 3 : hour < 21 ? 4 : 5;
    grid[day][bucket] = Math.min(3, grid[day][bucket] + 1);
  }
  return grid;
}

type OpponentSummary = { name: string; played: number; wins: number; losses: number; initials: string; tone: string };

function opponentSummaries(matches: ProfileMatch[]): OpponentSummary[] {
  const tones = [
    "linear-gradient(135deg,#7c3aed,#db2777)",
    "linear-gradient(135deg,#f59e0b,#ef4444)",
    "linear-gradient(135deg,#06b6d4,#1e40af)",
    "linear-gradient(135deg,#10b981,#047857)",
    "linear-gradient(135deg,#dc2626,#7f1d1d)",
  ];
  const map = new Map<string, OpponentSummary>();
  for (const match of matches) {
    const item = map.get(match.oppName) ?? {
      name: match.oppName,
      played: 0,
      wins: 0,
      losses: 0,
      initials: initials(match.oppName),
      tone: tones[map.size % tones.length],
    };
    item.played += 1;
    if (match.result === "win") item.wins += 1;
    else item.losses += 1;
    map.set(match.oppName, item);
  }
  return Array.from(map.values()).sort((a, b) => b.played - a.played).slice(0, 4);
}

export function ProfileScreenView({
  data,
  viewerMode,
  viewerIsPremium = false,
  initialFriendship = "none",
}: {
  data: ProfileData;
  viewerMode?: "public";
  viewerIsPremium?: boolean;
  initialFriendship?: "none" | "pending" | "friends";
}) {
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

  const mode: Mode = viewerMode === "public" ? "public" : "mine";
  const isMine = mode === "mine";
  const initialRatingMode: RatingMode = data.ratings.singles ? "singles" : data.ratings.doubles ? "doubles" : "singles";
  const [ratingMode, setRatingMode] = useState<RatingMode>(initialRatingMode);
  const activeRating = data.ratings[ratingMode] ?? {
    currentRating: data.currentRating,
    matchesTotal: data.matchesTotal,
    wins: data.wins,
    losses: data.losses,
    rank: data.rank,
  };
  const [friend, setFriend] = useState<FriendState>(initialFriendship);
  const [avatarOverlayOpen, setAvatarOverlayOpen] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [actionPending, startActionTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const heatmap = useMemo(() => buildHeatmap(data.matchHistory), [data.matchHistory]);
  const opponents = useMemo(() => opponentSummaries(data.matchHistory), [data.matchHistory]);

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

  const shareProfile = async () => {
    const url = `${window.location.origin}/dashboard/user/players/${data.username}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: data.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ icon: "check", title: "Link copiado", sub: "Comparte tu perfil" });
      }
    } catch {
      /* El usuario canceló el share nativo. */
    }
  };

  const requestFriend = () => {
    if (!data.meUserId) return;
    startActionTransition(async () => {
      const r = await sendFriendRequest({ toUserId: data.meUserId });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      setFriend("pending");
      toast({ icon: "user-plus", title: `Solicitud enviada a ${data.name}`, sub: "Le avisaremos para que acepte" });
    });
  };

  const openConversation = () => {
    if (!data.meUserId) return;
    startActionTransition(async () => {
      const r = await startConversation({ kind: "dm", memberIds: [data.meUserId] });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      router.push(`/dashboard/user/chat?conv=${r.data.id}`);
    });
  };

  const challengePlayer = () => {
    window.dispatchEvent(
      new CustomEvent("mp-open-retar", {
        detail: {
          name: data.name,
          level: parseFloat(levelFromRating(activeRating.currentRating)),
          sport: "Pickleball",
          city: data.city ?? "—",
          av: initials(data.name),
          avBg: "linear-gradient(135deg,#7c3aed,#db2777)",
        },
      }),
    );
  };

  return (
    <>
      <main
        className="w-full max-w-none"
        style={{
          minHeight: "100%",
          background: tk.bg,
          color: tk.ink,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          marginBottom: -28,
        }}
      >
        <Hero
          data={data}
          activeRating={activeRating}
          ratingMode={ratingMode}
          onChangeMode={setRatingMode}
          isMine={isMine}
          friend={friend}
          actionPending={actionPending}
          onAvatar={() => setAvatarOverlayOpen(true)}
          onEditProfile={() => setShowEditPanel((v) => !v)}
          onEditBio={() => setEditingBio(true)}
          onShare={shareProfile}
          onFriend={requestFriend}
          onMessage={openConversation}
          onChallenge={challengePlayer}
          onUpgrade={() => router.push("/dashboard/user/mi-plan?upgrade=premium")}
        />
        {!isMine && <PublicBanner data={data} opponents={opponents} onChallenge={challengePlayer} />}
        {PROFILE_SHOWCASE_ENABLED && (
          <Showcase
            data={data}
            isMine={isMine}
            opponents={opponents}
            pins={defaultShowcasePins(data.matchHistory, opponents, data.badges)}
            onEditPins={undefined}
            onUpgrade={() => router.push("/dashboard/user/mi-plan?upgrade=premium")}
          />
        )}
        <Analytics
          data={data}
          active={activeRating}
          heatmap={heatmap}
          ratingMode={ratingMode}
          isMine={isMine}
          onUpgrade={() => router.push("/dashboard/user/mi-plan?upgrade=premium")}
        />
        <Social opponents={opponents} isPremium={data.isPremium} coachShotInsights={data.coachShotInsights} isMine={isMine} />
        <Activity data={data} isMine={isMine} viewerIsPremium={viewerIsPremium} onUpgrade={() => router.push("/dashboard/user/mi-plan?upgrade=premium")} />
        <Community data={data} friend={friend} isMine={isMine} />
        {isMine && showEditPanel && (
          <section className="card" style={{ padding: 22 }}>
            <div className="label-mp">Preferencias</div>
            <h2 className="font-heading" style={{ margin: "4px 0 16px", fontSize: 20, fontWeight: 900, letterSpacing: "-0.025em" }}>
              Edita tus datos de perfil<span className="dot">.</span>
            </h2>
            {data.editable ? (
              <EditProfilePanel initial={data.editable} />
            ) : (
              <div style={{ fontSize: 13, color: "var(--muted-fg)" }}>No se pudieron cargar tus datos para editar. Recarga la página.</div>
            )}
          </section>
        )}
      </main>

      {avatarOverlayOpen && data.meUserId && (
        <AvatarOverlay userId={data.meUserId} currentUrl={data.avatarUrl} onClose={() => setAvatarOverlayOpen(false)} onUploaded={handleAvatarUploaded} />
      )}
      {isMine && editingBio && <EditBioModal initialBio={data.bio} onClose={() => setEditingBio(false)} />}
    </>
  );
}

function Hero({
  data,
  activeRating,
  ratingMode,
  onChangeMode,
  isMine,
  friend,
  actionPending,
  onAvatar,
  onEditProfile,
  onEditBio,
  onShare,
  onFriend,
  onMessage,
  onChallenge,
  onUpgrade,
}: {
  data: ProfileData;
  activeRating: ModeRating;
  ratingMode: RatingMode;
  onChangeMode: (mode: RatingMode) => void;
  isMine: boolean;
  friend: FriendState;
  actionPending: boolean;
  onAvatar: () => void;
  onEditProfile: () => void;
  onEditBio: () => void;
  onShare: () => void;
  onFriend: () => void;
  onMessage: () => void;
  onChallenge: () => void;
  onUpgrade: () => void;
}) {
  const coverChips = useMemo(
    () => buildHeroCoverChips(profileMatchesForMode(data.matchHistory, ratingMode)),
    [data.matchHistory, ratingMode],
  );

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="relative h-[180px] md:h-[220px] overflow-hidden" style={{ background: tk.cover }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 78% 30%, ${tk.coverGlow}, transparent 60%)` }} />
        {coverChips.length > 0 && (
          <div className="absolute left-4 md:left-6 top-[18px] flex flex-wrap gap-2">
            {coverChips.map((chip) => (
              <CoverChip key={chip.label} icon={chip.icon} green={chip.green}>
                {chip.label}
              </CoverChip>
            ))}
          </div>
        )}
        {isMine && (
          <div className="absolute right-4 md:right-6 top-[18px] flex gap-2">
            <CoverButton onClick={onEditBio} icon="image">Editar bio</CoverButton>
            {!data.isPremium && <CoverButton onClick={onUpgrade} icon="sparkles" gold>Más con MP+</CoverButton>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[156px_1fr_auto] items-start md:items-end gap-5 md:gap-6 px-4 md:px-7 pb-5 md:pb-6">
        <div className="relative mt-[-62px] md:mt-[-70px] pb-1">
          <PlayerAvatar name={data.name} avatarUrl={data.avatarUrl} size={140} />
          {isMine && (
            <button type="button" aria-label="Cambiar foto de perfil" onClick={onAvatar} style={avatarButtonStyle}>
              <Icon name="pencil" size={13} color="#fff" />
            </button>
          )}
        </div>

        <div className="pb-1">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="font-heading" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(30px, 5vw, 38px)", lineHeight: 1, letterSpacing: "-0.035em", textTransform: "uppercase" }}>
              {data.name}<span className="dot">.</span>
            </h1>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color: tk.muted, letterSpacing: "0.08em" }}>@{data.username}</span>
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15, color: tk.inkSoft, marginBottom: 12, lineHeight: 1.45 }}>
            “{data.bio?.split(".")[0] || "Listo para el próximo match"}”
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {data.city && <Meta icon="map-pin">{data.city}, EC</Meta>}
            {data.primaryClub && <Meta icon="building-2">{data.primaryClub.name}</Meta>}
            <Meta icon="calendar">Activo desde {memberLabel(data.memberSince)}</Meta>
            {!isMine && <Meta icon="circle-check-big" accent>Acepta retos</Meta>}
          </div>
        </div>

        <div className="flex flex-col gap-2 items-stretch min-w-0 md:min-w-[240px] pb-1">
          {isMine ? (
            <>
              <button type="button" className="btn btn-primary" onClick={onEditProfile}><Icon name="pencil" size={13} />Editar perfil</button>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline flex-1" onClick={onEditBio}><Icon name="palette" size={13} />Bio</button>
                <button type="button" className="btn btn-outline flex-1" onClick={onShare}><Icon name="share-2" size={13} />Compartir</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={onChallenge}><Icon name="swords" size={14} />Retar a match</button>
              <div className="flex gap-2">
                {friend === "none" && data.meUserId && <button type="button" className="btn btn-outline flex-1" disabled={actionPending} onClick={onFriend}><Icon name="user-plus" size={13} />Agregar</button>}
                {friend === "pending" && <button type="button" className="btn flex-1" disabled style={disabledButtonStyle}><Icon name="clock" size={13} />Enviada</button>}
                {friend === "friends" && <button type="button" className="btn flex-1" disabled style={friendButtonStyle}><Icon name="user-check" size={13} color="var(--primary)" />Amigos</button>}
                <button type="button" className="btn btn-outline flex-1" disabled={actionPending || !data.meUserId} onClick={onMessage}><Icon name="message-square" size={13} />Mensaje</button>
              </div>
            </>
          )}
        </div>
      </div>
      <HeroKpis active={activeRating} ratingMode={ratingMode} onChangeMode={onChangeMode} />
    </section>
  );
}

function CoverChip({ children, icon, green = false }: { children: ReactNode; icon?: string; green?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 9999, background: green ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.12)", color: green ? "#6ee7b7" : "#fff", fontWeight: 900, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", backdropFilter: "blur(8px)" }}>
      {icon && <Icon name={icon} size={11} />}
      {green && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 0 3px rgba(52,211,153,0.25)" }} />}
      {children}
    </span>
  );
}

function CoverButton({ children, icon, gold = false, onClick }: { children: ReactNode; icon: string; gold?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9999, background: gold ? "rgba(212,161,58,0.16)" : "rgba(0,0,0,0.4)", color: gold ? "#fcd34d" : "#fff", border: gold ? "1px solid rgba(212,161,58,0.4)" : "1px solid rgba(255,255,255,0.18)", fontWeight: 800, fontSize: 11, cursor: "pointer", backdropFilter: "blur(8px)" }}>
      <Icon name={icon} size={12} />
      {children}
    </button>
  );
}

const avatarButtonStyle: CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 2,
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: "#0a0a0a",
  color: "#fff",
  border: "3px solid #fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const disabledButtonStyle: CSSProperties = { background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-fg)", cursor: "default" };
const friendButtonStyle: CSSProperties = { background: "rgba(16,185,129,0.12)", color: "var(--primary)", border: "1px solid rgba(16,185,129,0.3)", cursor: "default" };

function PlayerAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string | null; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#10b981,#047857)", border: "5px solid #fff", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: size * 0.34, letterSpacing: "-0.04em", overflow: "hidden" }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function Meta({ children, icon, accent = false }: { children: ReactNode; icon: string; accent?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: accent ? tk.accentDeep : tk.muted,
        fontWeight: 700,
        fontSize: 12,
        lineHeight: 1.2,
      }}
    >
      <Icon name={icon} size={13} color={accent ? tk.accent : tk.mutedSoft} />
      {children}
    </span>
  );
}

function PublicBanner({ data, opponents, onChallenge }: { data: ProfileData; opponents: OpponentSummary[]; onChallenge: () => void }) {
  const top = opponents[0];
  return (
    <section className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-5 md:gap-6 items-center" style={{ background: "linear-gradient(110deg, #0a0a0a 0%, #0e2018 100%)", borderRadius: 16, color: "#fff", padding: "20px 24px" }}>
      <div className="flex items-center gap-3.5">
        <div style={{ width: 44, height: 44, borderRadius: 12, background: tk.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#001a10" }}><Icon name="swords" size={22} /></div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.55)" }}>PERFIL PÚBLICO</div>
          <div className="font-heading" style={{ fontWeight: 900, fontSize: 22, marginTop: 2, letterSpacing: "-0.025em" }}>
            {top ? `${firstName(data.name)} registra ${top.played} cruces vs. ${top.name}` : `Reta a ${firstName(data.name)} a su próximo match`}
          </div>
        </div>
      </div>
      <div className="flex items-baseline gap-3 md:justify-self-center">
        <span className="tabular font-heading" style={{ fontWeight: 900, fontSize: 48, lineHeight: 1, color: "#fff", letterSpacing: "-0.04em" }}>{top?.losses ?? 0}</span>
        <span className="font-heading" style={{ fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.45)" }}>vs</span>
        <span className="tabular font-heading" style={{ fontWeight: 900, fontSize: 48, lineHeight: 1, color: tk.accent, letterSpacing: "-0.04em" }}>{top?.wins ?? 0}</span>
      </div>
      <button type="button" className="btn btn-primary" onClick={onChallenge}><Icon name="swords" size={13} />Pedir revancha</button>
    </section>
  );
}

function Showcase({
  data,
  isMine,
  opponents,
  pins,
  onEditPins,
  onUpgrade,
}: {
  data: ProfileData;
  isMine: boolean;
  opponents: OpponentSummary[];
  pins: ShowcasePins;
  onEditPins?: () => void;
  onUpgrade: () => void;
}) {
  if (!data.isPremium) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-5 items-center" style={{ background: `linear-gradient(110deg, ${tk.soft} 0%, ${tk.goldSoft} 100%)`, border: `1px dashed ${tk.goldRing}`, borderRadius: 14, padding: "18px 22px" }}>
        <div className="mp-icon-tile-amber" style={{ width: 48, height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="pin" size={22} />
        </div>
        <div>
          <span className="label-mp" style={{ color: tk.gold }}>{isMine ? "Personaliza tu showcase" : "Sin pins destacados"}</span>
          <div className="font-heading" style={{ fontWeight: 900, fontSize: 19, marginTop: 4, letterSpacing: "-0.02em" }}>{isMine ? "Elige 3 momentos para destacar arriba" : `${firstName(data.name)} aún no destaca pins en su perfil`}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: tk.muted, lineHeight: 1.45, maxWidth: 600 }}>Tu mejor match, tus rivales frecuentes y tus insignias más raras. Disponible con MATCHPOINT+.</div>
        </div>
        {isMine && <button type="button" className="btn" onClick={onUpgrade} style={{ background: tk.ink, color: "#fff" }}><Icon name="sparkles" size={13} />Activar MP+</button>}
      </section>
    );
  }

  const match =
    (pins.matchId ? data.matchHistory.find((m) => m.id === pins.matchId) : null) ??
    data.matchHistory.find((m) => m.result === "win") ??
    data.matchHistory[0];
  const badge =
    (pins.badgeKind ? data.badges?.find((b) => b.kind === pins.badgeKind) : null) ??
    data.badges?.find((b) => b.on) ??
    data.badges?.[0];
  const top =
    (pins.opponentName ? opponents.find((o) => o.name === pins.opponentName) : null) ?? opponents[0];
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <div className="flex items-center gap-2.5">
          <span className="label-mp">Destacado por {isMine ? "ti" : firstName(data.name)}</span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: tk.mutedSoft, letterSpacing: "0.12em" }}>· 3 pins</span>
        </div>
        {onEditPins && (
          <button type="button" className="btn btn-outline shrink-0" onClick={onEditPins} style={{ fontSize: 12, padding: "6px 12px" }}>
            <Icon name="pin" size={13} style={{ transform: "rotate(35deg)" }} />
            Elegir pins
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr] gap-3">
        <Pin title={match ? `Match vs. ${match.oppName}` : "Primer match pendiente"} kicker="Match memorable" icon="pin" accent>
          {match ? (
            <>
              <div className="tabular font-heading" style={{ fontWeight: 700, fontSize: 15 }}>
                {scoreText(match)}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>
                {fmtMatchDate(match.playedAt)} · {match.clubName ?? "Sin club"}
              </div>
              <Quote onDark>
                {match.result === "win"
                  ? "Cerró el match con control y mantuvo la presión en los puntos largos."
                  : "Un partido exigente que suma lectura para la revancha."}
              </Quote>
            </>
          ) : (
            <Small onDark text="Cuando confirmes un match, aparecerá aquí." />
          )}
        </Pin>
        <Pin title={top?.name ?? "Rival frecuente"} kicker="H2H reciente" icon="users">
          {top ? <><div className="flex items-center gap-3.5"><AvatarBlob label={top.initials} tone={top.tone} size={56} /><div><div className="font-heading" style={{ fontWeight: 900, fontSize: 18 }}>{top.name}</div><div style={{ marginTop: 4, fontSize: 11.5, color: tk.muted, fontWeight: 600 }}>{top.played} matches · {top.wins}W</div></div></div><div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${tk.border}`, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><span className="tabular font-heading" style={{ fontWeight: 900, fontSize: 32, color: tk.accent }}>{winRate(top.wins, top.played)}%</span><span style={{ fontWeight: 700, fontSize: 11, color: tk.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Win rate</span></div></> : <Small text="Aún no hay rivales frecuentes." />}
        </Pin>
        <Pin title={badge?.label ?? "Insignia top"} kicker="Insignia top" icon={badge?.icon ?? "trophy"} gold>
          <div className="flex items-center gap-3.5 mb-3">
            <BadgeIconTile icon={badge?.icon ?? "trophy"} unlocked={badge?.on} />
            <div>
              <div className="font-heading" style={{ fontWeight: 900, fontSize: 22, textTransform: "uppercase" }}>
                {badge?.label ?? "Por desbloquear"}
              </div>
              <div style={{ marginTop: 4, fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, opacity: 0.65 }}>
                {badge?.on ? "CONSEGUIDA" : "PENDIENTE"}
              </div>
            </div>
          </div>
          <Quote onDark>{badge?.description ?? "Completa más actividad para sumar insignias."}</Quote>
        </Pin>
      </div>
    </section>
  );
}

function Pin({ children, title, kicker, icon, accent = false, gold = false }: { children: ReactNode; title: string; kicker: string; icon: string; accent?: boolean; gold?: boolean }) {
  const onDark = accent || gold;
  const surface = gold
    ? { background: MP_GRADIENT_SURFACE_PREMIUM_DARK, border: "1px solid rgba(255,255,255,0.12)" }
    : accent
      ? { background: MP_GRADIENT_SURFACE_SOCIAL_DARK, border: "1px solid rgba(255,255,255,0.1)" }
      : { background: tk.card, border: `1px solid ${tk.border}` };

  return (
    <article
      style={{
        position: "relative",
        ...surface,
        color: onDark ? "#fff" : tk.ink,
        borderRadius: "var(--radius-mp-card)",
        padding: 18,
        overflow: "hidden",
      }}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <span
            className="label-mp"
            style={{ color: gold ? "var(--color-mp-amber)" : onDark ? "rgba(255,255,255,0.5)" : tk.muted }}
          >
            {kicker}
          </span>
          <Icon
            name={icon}
            size={13}
            color={gold ? "var(--color-mp-amber)" : onDark ? tk.accent : tk.muted}
            style={{ transform: icon === "pin" ? "rotate(35deg)" : undefined }}
          />
        </div>
        <div className="font-heading" style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.025em", marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ color: onDark ? "rgba(255,255,255,0.7)" : undefined }}>{children}</div>
      </div>
    </article>
  );
}

function BadgeIconTile({ icon, unlocked }: { icon: string; unlocked?: boolean }) {
  return (
    <span
      className={unlocked ? undefined : "mp-icon-tile-amber"}
      style={{
        width: 56,
        height: 56,
        flexShrink: 0,
        borderRadius: "var(--radius-mp-sm)",
        background: unlocked ? "var(--primary)" : undefined,
        color: unlocked ? "#fff" : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={26} />
    </span>
  );
}

function Quote({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        background: onDark ? "rgba(255,255,255,0.08)" : tk.soft,
        borderRadius: 8,
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        fontWeight: 600,
        color: onDark ? "rgba(255,255,255,0.78)" : tk.muted,
        lineHeight: 1.45,
      }}
    >
      “{children}”
    </div>
  );
}

function Small({ text, onDark = false }: { text: string; onDark?: boolean }) {
  return <div style={{ fontSize: 12.5, color: onDark ? "rgba(255,255,255,0.65)" : tk.muted, lineHeight: 1.45 }}>{text}</div>;
}

function AvatarBlob({ label, tone, size }: { label: string; tone: string; size: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: tone, border: "3px solid #fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: size * 0.34 }}>{label}</div>;
}

function HeroKpis({ active, ratingMode, onChangeMode }: { active: ModeRating; ratingMode: RatingMode; onChangeMode: (mode: RatingMode) => void }) {
  const wr = winRate(active.wins, active.matchesTotal);
  const items = [
    { label: "Rating MPR", value: ratingDisplay(active.currentRating), detail: active.matchesTotal > 0 ? "Oficial" : "Punto de partida", accent: true },
    { label: "Ranking nacional", value: active.rank != null ? `#${active.rank}` : "—", detail: active.rank != null ? "Pickleball" : "Aún sin ranking" },
    { label: "Partidos", value: String(active.matchesTotal), detail: `${active.wins}W · ${active.losses}L` },
    { label: "Win rate", value: active.matchesTotal > 0 ? `${wr}%` : "—", detail: active.matchesTotal > 0 ? "Temporada actual" : "Empieza a jugar" },
  ];
  return (
    <div style={{ borderTop: `1px solid ${tk.borderSoft}`, background: tk.card, padding: "14px clamp(16px, 2.2vw, 28px) 18px" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <span className="label-mp">Estadísticas · {ratingMode === "singles" ? "Singles" : "Dobles"}</span>
        <Segmented value={ratingMode} onChange={onChangeMode} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        {items.map((item) => (
          <div key={item.label} style={{ padding: "14px 16px", background: "#fff", border: `1px solid ${tk.borderSoft}`, borderRadius: 12 }}>
            <div className="label-mp">{item.label}</div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="tabular font-heading" style={{ fontWeight: 900, fontSize: 30, lineHeight: 0.95, letterSpacing: "-0.035em", color: item.accent ? tk.accent : tk.ink }}>
                {item.value}
              </span>
            </div>
            <div style={{ marginTop: 5, fontSize: 11, color: tk.muted, fontWeight: 700 }}>{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Segmented({ value, onChange }: { value: RatingMode; onChange: (mode: RatingMode) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, background: "#f5f5f5", borderRadius: 9999 }}>
      {(["singles", "doubles"] as const).map((mode) => <button key={mode} type="button" onClick={() => onChange(mode)} style={{ padding: "5px 12px", borderRadius: 9999, background: value === mode ? "#0a0a0a" : "transparent", color: value === mode ? "#fff" : "var(--muted-fg)", border: 0, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit", transition: "background 160ms var(--ease-out), color 160ms var(--ease-out)" }}>{mode === "singles" ? "Singles" : "Dobles"}</button>)}
    </div>
  );
}

function Analytics({
  data,
  active,
  heatmap,
  ratingMode,
  isMine,
  onUpgrade,
}: {
  data: ProfileData;
  active: ModeRating;
  heatmap: number[][];
  ratingMode: RatingMode;
  isMine: boolean;
  onUpgrade: () => void;
}) {
  const lockedTitle = isMine ? "Desbloquea tu juego en detalle" : `${firstName(data.name)} no tiene MATCHPOINT+`;
  return (
    <section style={{ position: "relative" }}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2.5">
          <span className="label-mp">Análisis de juego</span>
          <MpOnly />
        </div>
        {data.isPremium && (
          <span style={{ fontSize: 11, color: tk.muted, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
            Actualizado con tus datos recientes
          </span>
        )}
      </div>
      <div className="relative grid grid-cols-1 md:grid-cols-[1.7fr_1fr_0.85fr] gap-3">
        <RatingChart
          current={active.currentRating}
          ratingMode={ratingMode}
          snapshotsByMode={data.ratingSnapshotsByMode}
        />
        <Heatmap heatmap={heatmap} />
        <Donut wins={active.wins} losses={active.losses} />
        {!data.isPremium && <Locked title={lockedTitle} isMine={isMine} onUpgrade={onUpgrade} />}
      </div>
    </section>
  );
}

function MpOnly() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        color: tk.inkSoft,
        fontFamily: "var(--font-heading)",
        fontWeight: 900,
        fontSize: 12,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      MP<span style={{ color: "var(--primary)" }}>+</span>
    </span>
  );
}

function RatingChart({
  current,
  ratingMode,
  snapshotsByMode,
}: {
  current: number;
  ratingMode: RatingMode;
  snapshotsByMode: { singles: RatingSnapshotPoint[]; doubles: RatingSnapshotPoint[] };
}) {
  const [range, setRange] = useState<RatingRange>("1A");
  const { days, chartLabel } = RATING_RANGE_META[range];
  const rawSnapshots = snapshotsByMode[ratingMode] ?? [];

  const chartPoints = useMemo(() => {
    const inRange = filterSnapshotsByRange(rawSnapshots, days);
    return ensureRatingChartHistory(inRange, current, days);
  }, [rawSnapshots, days, current]);

  const monthLabels = useMemo(() => chartAxisLabels(chartPoints), [chartPoints]);

  const sorted = useMemo(
    () => [...chartPoints].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt)),
    [chartPoints],
  );
  const realInRange = filterSnapshotsByRange(rawSnapshots, days);
  const diff = current - (sorted[0]?.rating ?? current);
  const deltaLabel =
    diff === 0 ? "= 0.00" : `${diff >= 0 ? "↑" : "↓"} ${(Math.abs(diff) / 1000).toFixed(2)}`;
  const subText =
    realInRange.length >= 2
      ? "Pasa el mouse para ver fecha y rating"
      : "Tu nivel inicial · juega para subir";

  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
        <div>
          <span className="label-mp">Evolución rating MPR · {chartLabel}</span>
          <div className="flex items-baseline gap-2.5 mt-1.5 flex-wrap">
            <span className="tabular font-heading" style={{ fontWeight: 900, fontSize: 32, lineHeight: 1, letterSpacing: "-0.035em" }}>
              {ratingDisplay(current)}
            </span>
            <span
              style={{
                fontWeight: 800,
                fontSize: 11.5,
                color: diff > 0 ? tk.accent : diff < 0 ? tk.hot : tk.muted,
              }}
            >
              {deltaLabel}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: tk.muted, fontWeight: 600 }}>{subText}</div>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Rango del gráfico de rating">
          {RATING_RANGES.map((t) => {
            const activeTab = range === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={activeTab}
                onClick={() => setRange(t)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: activeTab ? tk.ink : "transparent",
                  color: activeTab ? "#fff" : tk.muted,
                  fontWeight: 900,
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <RatingSparkline points={chartPoints} width={640} height={150} />
      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 9.5,
          color: tk.mutedSoft,
        }}
      >
        {monthLabels.length > 0 ? (
          monthLabels.map((m, i) => <span key={`${range}-${i}-${m}`}>{m}</span>)
        ) : (
          <>
            <span>Inicio</span>
            <span>Hoy</span>
          </>
        )}
      </div>
    </div>
  );
}

function Heatmap({ heatmap }: { heatmap: number[][] }) {
  const palette = ["#f5f5f4", "#bbf7d0", "#86efac", "#10b981"];
  return <div className="card" style={{ padding: "20px 22px" }}><div className="flex items-center justify-between mb-3.5"><div><span className="label-mp">Cuándo juega</span><div className="card-title">Heatmap semanal</div></div><div className="flex items-center gap-1">{palette.map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: 2, background: c, border: `1px solid ${tk.border}` }} />)}</div></div><div style={{ display: "grid", gridTemplateColumns: "20px repeat(6, 1fr)", gap: 3, alignItems: "center" }}><div />{HOURS.map((hour) => <div key={hour} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8.5, color: tk.muted, textAlign: "center" }}>{hour}</div>)}{heatmap.map((row, di) => <div key={DAYS[di]} style={{ display: "contents" }}><div className="font-heading" style={{ fontWeight: 900, fontSize: 11, textAlign: "center" }}>{DAYS[di]}</div>{row.map((v, fi) => <div key={`${DAYS[di]}-${fi}`} style={{ aspectRatio: "1.4/1", borderRadius: 3, background: palette[v], border: v === 0 ? `1px solid ${tk.border}` : "1px solid transparent" }} />)}</div>)}</div></div>;
}

function Donut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const pct = winRate(wins, total);
  const r = 48;
  const c = 2 * Math.PI * r;
  return <div className="card" style={{ padding: "20px 22px" }}><span className="label-mp">Win rate</span><div className="mt-3.5 flex flex-col items-center gap-1.5"><svg width="130" height="130" viewBox="0 0 130 130"><circle cx="65" cy="65" r={r} fill="none" stroke="#f5f5f4" strokeWidth="13" /><circle cx="65" cy="65" r={r} fill="none" stroke={tk.accent} strokeWidth="13" strokeDasharray={`${(pct / 100) * c} ${c}`} strokeDashoffset={c / 4} transform="rotate(-90 65 65)" strokeLinecap="round" /><text x="65" y="65" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 28, letterSpacing: "-0.04em" }} fill={tk.ink}>{total > 0 ? `${pct}%` : "—"}</text></svg><div style={{ display: "flex", gap: 18, fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: tk.muted }}><span><span style={{ color: tk.accent, fontWeight: 900 }}>{wins}W</span> · <span style={{ color: tk.hot, fontWeight: 900 }}>{losses}L</span></span></div></div></div>;
}

function Locked({ title, isMine, onUpgrade }: { title: string; isMine: boolean; onUpgrade: () => void }) {
  return <div style={{ position: "absolute", inset: 0, background: "rgba(250,250,249,0.78)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, padding: 28 }}><div style={{ textAlign: "center", maxWidth: 360 }}><div className="mp-icon-tile-amber" style={{ width: 56, height: 56, margin: "0 auto 14px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="lock" size={24} /></div><div style={{ fontWeight: 900, fontSize: 10, letterSpacing: "0.22em", color: tk.gold, marginBottom: 6, textTransform: "uppercase" }}>Requiere MATCHPOINT+</div><div className="font-heading" style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.025em", marginBottom: 8 }}>{title}</div><div style={{ fontSize: 13, color: tk.muted, lineHeight: 1.45, marginBottom: 16 }}>{isMine ? "Desbloquea con MP+: heatmaps, evolución del rating, rivales y Coach AI." : "Estos análisis aparecen cuando el perfil tiene MATCHPOINT+ activo."}</div>{isMine && <button type="button" className="btn" onClick={onUpgrade} style={{ background: tk.ink, color: "#fff" }}><Icon name="sparkles" size={13} />Activar MP+</button>}</div></div>;
}

function Social({
  opponents,
  isPremium,
  coachShotInsights,
  isMine,
}: {
  opponents: OpponentSummary[];
  isPremium: boolean;
  coachShotInsights: CoachShotInsight[];
  isMine: boolean;
}) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <OpponentCard title="Rivales frecuentes" opponents={opponents} isPremium={isPremium} />
      <H2H opponents={opponents} isPremium={isPremium} />
      <Shots isPremium={isPremium} insights={coachShotInsights} isMine={isMine} />
    </section>
  );
}

function SocialRivalsEmpty({ message }: { message: string }) {
  return (
    <div style={{ padding: "28px 8px", textAlign: "center" }}>
      <Icon name="users" size={22} color={tk.muted} style={{ marginBottom: 10 }} />
      <Small text={message} />
    </div>
  );
}

function OpponentCard({ title, opponents, isPremium }: { title: string; opponents: OpponentSummary[]; isPremium: boolean }) {
  const rows = opponents.slice(0, 4);
  const hasData = rows.length > 0;

  return (
    <div className="card" style={{ position: "relative", padding: "20px 22px", minHeight: 280 }}>
      <Band label="Compañeros" title={title} />
      <div style={{ filter: isPremium ? "none" : "blur(5px)" }}>
        {hasData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((opp) => {
              const rate = winRate(opp.wins, opp.played);
              return (
                <div
                  key={opp.name}
                  style={{ display: "grid", gridTemplateColumns: "32px 1fr 50px", alignItems: "center", gap: 10 }}
                >
                  <AvatarBlob size={30} tone={opp.tone} label={opp.initials} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {opp.name}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        height: 5,
                        background: tk.borderSoft,
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ width: `${rate}%`, height: "100%", background: tk.accent }} />
                    </div>
                  </div>
                  <span className="tabular font-heading" style={{ textAlign: "right", fontWeight: 900, fontSize: 14 }}>
                    {opp.played > 0 ? `${rate}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <SocialRivalsEmpty message="Cuando confirmes partidos, verás aquí tus rivales más frecuentes y tu win rate contra cada uno." />
        )}
      </div>
      {!isPremium && <SmallLock label="MP+ requerido" />}
    </div>
  );
}

function H2H({ opponents, isPremium }: { opponents: OpponentSummary[]; isPremium: boolean }) {
  const rows = opponents.slice(0, 3);
  const hasData = rows.length > 0;

  return (
    <div className="card" style={{ position: "relative", padding: "20px 22px", minHeight: 280 }}>
      <Band label="Rivales · H2H" title="A quién enfrentas más" />
      <div style={{ filter: isPremium ? "none" : "blur(5px)" }}>
        {hasData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((opp) => (
              <div
                key={opp.name}
                style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", alignItems: "center", gap: 10 }}
              >
                <AvatarBlob size={30} tone={opp.tone} label={opp.initials} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {opp.name}
                  </div>
                  <div className="flex gap-0.5 mt-1.5">
                    {Array.from({ length: Math.min(7, opp.played) }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          height: 5,
                          borderRadius: 2,
                          background: i < opp.wins ? tk.accent : tk.hot,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="tabular font-heading" style={{ textAlign: "right", fontWeight: 900, fontSize: 13 }}>
                  <span style={{ color: tk.accent }}>{opp.wins}</span>
                  <span style={{ color: tk.muted, fontSize: 10 }}> · </span>
                  <span style={{ color: tk.hot }}>{opp.losses}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <SocialRivalsEmpty message="Sin historial H2H todavía. Juega más partidos confirmados para ver contra quién te enfrentas más." />
        )}
      </div>
      {!isPremium && <SmallLock label="MP+ requerido" />}
    </div>
  );
}

function Shots({
  isPremium,
  insights,
  isMine,
}: {
  isPremium: boolean;
  insights: CoachShotInsight[];
  isMine: boolean;
}) {
  const hasData = insights.length > 0;

  return (
    <div className="card" style={{ position: "relative", padding: "20px 22px", minHeight: 280 }}>
      <Band label="% victoria por golpe" title="Coach AI insights" />
      <div style={{ filter: isPremium ? "none" : "blur(5px)" }}>
        {hasData ? (
          <div className="grid grid-cols-2 gap-2">
            {insights.map((s) => (
              <div
                key={s.label}
                style={{
                  padding: "10px 12px",
                  background: tk.soft,
                  border: `1px solid ${tk.borderSoft}`,
                  borderRadius: 8,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 11 }}>{s.label}</div>
                <span
                  className="tabular font-heading"
                  style={{ fontWeight: 900, fontSize: 20, color: s.winPct >= 65 ? tk.accent : tk.ink }}
                >
                  {s.winPct}%
                </span>
                <div style={{ marginTop: 4, height: 3, background: tk.border, borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, s.winPct))}%`,
                      height: "100%",
                      background: s.winPct >= 65 ? tk.accent : tk.ink,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "28px 8px", textAlign: "center" }}>
            <Icon name="sparkles" size={22} color={isPremium ? tk.gold : tk.muted} style={{ marginBottom: 10 }} />
            <Small
              onDark={false}
              text={
                isMine
                  ? "Aún no hay análisis de video. Sube un match en Coach AI para ver tu % de victoria por golpe."
                  : "Este jugador aún no tiene insights de golpes desde Coach AI."
              }
            />
            {isMine && isPremium && (
              <Link
                href="/dashboard/user/coach-ai"
                className="btn btn-primary"
                style={{ marginTop: 14, display: "inline-flex", textDecoration: "none", fontSize: 12, padding: "8px 14px" }}
              >
                <Icon name="upload-cloud" size={13} />
                Ir a Coach AI
              </Link>
            )}
          </div>
        )}
      </div>
      {!isPremium && <SmallLock label="Coach AI · MP+" />}
    </div>
  );
}

function Band({ label, title }: { label: string; title: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span className="label-mp">{label}</span>
      <div className="card-title">{title}</div>
    </div>
  );
}

function SmallLock({ label }: { label: string }) {
  return <div style={{ position: "absolute", inset: 0, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(250,250,249,0.55)" }}><div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9999, background: tk.goldSoft, color: tk.gold, fontWeight: 900, fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase" }}><Icon name="lock" size={11} />{label}</div></div>;
}

function Activity({ data, isMine, viewerIsPremium, onUpgrade }: { data: ProfileData; isMine: boolean; viewerIsPremium: boolean; onUpgrade: () => void }) {
  const matches = data.matchHistory.slice(0, 5);
  const showCap = !isMine && !viewerIsPremium && data.matchHistoryCap != null && data.matchesTotal > data.matchHistory.length;
  return <section className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4"><div className="card" style={{ padding: "20px 24px" }}><div className="flex items-baseline justify-between gap-3 flex-wrap mb-3.5"><div><span className="label-mp">Actividad · últimos 5</span><div className="card-title">Historial reciente</div></div><span style={{ fontSize: 11.5, color: tk.muted, fontWeight: 700 }}>Mostrando {matches.length} de {data.matchesTotal}</span></div>{matches.length === 0 ? <Empty icon="history" title="Aún no has jugado partidos oficiales." text="Cuando reportes tu primer match confirmado, aparecerá aquí con score, rival y resultado." /> : matches.map((match) => <div key={match.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr auto", gap: 14, alignItems: "flex-start", padding: "14px 0", borderTop: `1px solid ${tk.borderSoft}` }}><span style={{ width: 26, height: 26, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", background: match.result === "win" ? tk.accentSoft : "rgba(220,38,38,0.1)", color: match.result === "win" ? tk.accent : tk.hot, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 12 }}>{match.result === "win" ? "W" : "L"}</span><div><div className="flex items-baseline gap-2 flex-wrap"><span className="font-heading" style={{ fontWeight: 900, fontSize: 16 }}>vs. {match.oppName}</span><span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 9999, background: tk.borderSoft, color: tk.muted }}>{match.mode === "doubles" ? "Dobles" : "Singles"}</span><span className="tabular font-heading" style={{ fontWeight: 700, fontSize: 13, color: tk.inkSoft, marginLeft: "auto" }}>{scoreText(match)}</span></div><div style={{ marginTop: 5, fontSize: 11, color: tk.muted, fontWeight: 600 }}>{fmtMatchDate(match.playedAt)} · {match.clubName ?? "Sin club"}</div></div><div className="tabular font-heading" style={{ textAlign: "right", fontWeight: 900, fontSize: 15, color: (match.ratingDelta ?? 0) >= 0 ? tk.accent : tk.hot }}>{match.ratingDelta != null ? `${match.ratingDelta >= 0 ? "+" : ""}${match.ratingDelta}` : "—"}</div></div>)}{showCap && <div style={{ marginTop: 12, padding: 14, background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><Icon name="crown" size={16} color="#facc15" /><div style={{ flex: 1, minWidth: 220 }}><div style={{ fontSize: 12, fontWeight: 800 }}>Mostrando últimos {data.matchHistoryCap} partidos</div><div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>Activa MATCHPOINT+ para ver el historial completo de cualquier jugador.</div></div><button type="button" onClick={onUpgrade} className="btn" style={{ background: "#facc15", color: "#0a0a0a", padding: "8px 14px", fontSize: 10.5 }}>Activar MP+</button></div>}</div><div className="flex flex-col gap-3"><div className="card" style={{ padding: "20px 22px" }}><div className="flex items-baseline justify-between mb-3"><div><span className="label-mp">Próximos</span><div className="card-title">Agendados</div></div><Icon name="calendar-check" size={16} color={tk.muted} /></div><Small text="No hay partidos agendados desde esta fuente todavía." /></div><div className="card" style={{ padding: "16px 18px" }}><div className="flex items-center gap-2 mb-1.5"><span style={{ width: 8, height: 8, borderRadius: "50%", background: tk.accent, boxShadow: `0 0 0 3px ${tk.accentSoft}` }} /><span className="label-mp" style={{ color: tk.accentDeep }}>Disponible para jugar</span></div><div style={{ fontSize: 13, fontWeight: 700 }}>Retos de nivel cercano</div><div style={{ fontSize: 11.5, color: tk.muted, marginTop: 2 }}>Usa Retar a match para coordinar por chat.</div></div></div></section>;
}

function Community({ data, friend, isMine }: { data: ProfileData; friend: FriendState; isMine: boolean }) {
  const badges = data.badges ?? [];
  const unlocked = badges.filter((b) => b.on).length;
  const progress = badges.length > 0 ? Math.round((unlocked / badges.length) * 100) : 0;
  return <section className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4"><div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3"><div className="card" style={{ padding: "20px 22px" }}><div className="flex items-baseline justify-between mb-3.5"><div><span className="label-mp">Clubes · {data.clubs.length}</span><div className="card-title">Donde juega</div></div></div>{data.clubs.length === 0 ? <Small text="Aún no pertenece a ningún club." /> : <div className="flex flex-col gap-2.5">{data.clubs.slice(0, 3).map((club, index) => <a key={`${club.id}-${club.role}`} href={`/clubes/${club.id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}><div style={{ width: 32, height: 32, borderRadius: 7, background: "linear-gradient(135deg,#10b981,#047857)", flexShrink: 0 }} /><div style={{ flex: 1, minWidth: 0 }}><div className="flex items-center gap-1.5"><span style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club.name}</span>{index === 0 && <span style={{ padding: "1px 5px", borderRadius: 9999, background: tk.accentSoft, color: tk.accentDeep, fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em" }}>PRINCIPAL</span>}</div><div style={{ fontSize: 10.5, color: tk.muted, marginTop: 2 }}>{club.city} · Desde {memberLabel(club.since)}</div></div><Icon name="chevron-right" size={13} color={tk.mutedSoft} /></a>)}</div>}</div><div className="card" style={{ padding: "20px 22px" }}><div className="flex items-baseline justify-between mb-3"><div><span className="label-mp">Red</span><div className="card-title">{isMine ? "Tu comunidad" : friend === "friends" ? "Ya son amigos" : "Conecta"}</div></div></div><div style={{ fontSize: 12.5, color: tk.muted, lineHeight: 1.45 }}>{isMine ? "Tus amigos y conversaciones viven en Amigos y Mensajes." : friend === "friends" ? "Puedes escribirle desde Mensajes o retarlo a un match." : "Envía una solicitud para sumar este jugador a tu red."}</div></div></div><div className="card" style={{ padding: "20px 22px" }}><div className="flex items-baseline justify-between mb-3.5"><div><span className="label-mp">Colección · {unlocked}/{badges.length || 0}</span><div className="card-title">Insignias</div></div><div style={{ width: 110, height: 5, background: tk.borderSoft, borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: tk.accent }} /></div></div>{badges.length === 0 ? <Small text="Sin insignias todavía." /> : <div className="grid grid-cols-4 gap-2">{badges.slice(0, 8).map((badge) => <div key={badge.kind} style={{ textAlign: "center", opacity: badge.on ? 1 : 0.45 }}><div style={{ width: 44, height: 44, borderRadius: "50%", margin: "0 auto", background: badge.on ? tk.accent : tk.borderSoft, color: badge.on ? "#fff" : tk.muted, display: "inline-flex", alignItems: "center", justifyContent: "center", border: badge.on ? "0" : `1px solid ${tk.border}` }}><Icon name={badge.icon} size={18} /></div><div style={{ marginTop: 5, fontWeight: 900, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: badge.on ? tk.ink : tk.mutedSoft, lineHeight: 1.15 }}>{badge.label}</div></div>)}</div>}</div></section>;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
      <Icon name={icon} size={32} color="var(--muted-fg)" />
      <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "var(--fg)", letterSpacing: "-0.02em" }}>
        {title}
      </div>
      <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>{text}</p>
    </div>
  );
}

function AvatarOverlay({ userId, currentUrl, onClose, onUploaded }: { userId: string; currentUrl: string | null; onClose: () => void; onUploaded: (publicUrl: string) => Promise<void> | void }) {
  return (
    <div
      className="mp-modal-backdrop"
      role="presentation"
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
        className="mp-modal-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-overlay-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 id="avatar-overlay-title" className="card-title" style={{ margin: 0 }}>
            Tu foto
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="icon-btn"
            style={{ flexShrink: 0 }}
          >
            <Icon name="x" size={18} />
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
        <p style={{ margin: 0, fontSize: 11, color: "var(--muted-fg)", textAlign: "center" }}>
          JPG, PNG o WEBP · máximo 4 MB
        </p>
      </div>
    </div>
  );
}
