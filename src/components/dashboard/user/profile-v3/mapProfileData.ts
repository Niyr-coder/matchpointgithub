import type { ProfileData, ProfileMatch, RatingSnapshotPoint } from "../profile-types";
import type { QuedadaProfileStats } from "@/lib/quedadas/profile-stats";
import type { ProfileScoutPayload, RetarHeroContext, RetarHeroH2h } from "@/server/actions/matches";

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#06b6d4,#1e40af)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#7f1d1d)",
];

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function ratingNum(elo: number): number {
  return elo / 1000;
}

function fmtMatchDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const wd = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()];
  return `${wd} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function scoreText(match: ProfileMatch): string {
  return match.sets.length > 0 ? match.sets.map((s) => `${s[0]}-${s[1]}`).join(", ") : "—";
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

function opponentSummaries(matches: ProfileMatch[]) {
  const map = new Map<
    string,
    { name: string; played: number; wins: number; losses: number; initials: string; tone: string; level: string }
  >();
  for (const match of matches) {
    const item = map.get(match.oppName) ?? {
      name: match.oppName,
      played: 0,
      wins: 0,
      losses: 0,
      initials: initials(match.oppName),
      tone: AVATAR_GRADIENTS[map.size % AVATAR_GRADIENTS.length],
      level: "—",
    };
    item.played += 1;
    if (match.result === "win") item.wins += 1;
    else item.losses += 1;
    map.set(match.oppName, item);
  }
  return Array.from(map.values()).sort((a, b) => b.played - a.played);
}

function winRate(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

function ratingDeltaFromSnapshots(
  snapshots: RatingSnapshotPoint[],
  currentRaw: number,
  periodDays = 30,
): number {
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const sorted = [...snapshots]
    .filter((s) => +new Date(s.snapshotAt) >= cutoff)
    .sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt));
  if (sorted.length === 0) return 0;
  return ratingNum(currentRaw) - ratingNum(sorted[0].rating);
}

function currentStreak(matches: ProfileMatch[]): { type: "W" | "L"; count: number } {
  if (matches.length === 0) return { type: "W", count: 0 };
  const kind = matches[0].result;
  let count = 0;
  for (const m of matches) {
    if (m.result === kind) count++;
    else break;
  }
  return { type: kind === "win" ? "W" : "L", count };
}

function heatmapPeakLabel(heatmap: number[][]): string {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const slots = ["6–9h", "9–12h", "12–15h", "15–18h", "18–21h", "21–24h"];
  let best = { d: 0, h: 0, v: 0 };
  for (let d = 0; d < heatmap.length; d++) {
    for (let h = 0; h < (heatmap[d]?.length ?? 0); h++) {
      const v = heatmap[d][h] ?? 0;
      if (v > best.v) best = { d, h, v };
    }
  }
  if (best.v === 0) return "Sin partidos aún";
  return `${days[best.d]} · ${slots[best.h]}`;
}

function taglineFromBio(bio: string | null): string {
  const t = bio?.trim();
  if (!t) return "";
  const line = t.split(/\n/)[0]?.trim() ?? t;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function formatCountry(code: string | null): string {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames("es-EC", { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function ratingHistoryFromSnapshots(
  points: { rating: number; snapshotAt: string }[],
  current: number,
): number[] {
  const sorted = [...points].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt));
  if (sorted.length >= 2) return sorted.map((p) => ratingNum(p.rating));
  return [ratingNum(current), ratingNum(current)];
}

export type PerfilMe = {
  profileUserId: string | null;
  name: string;
  first: string;
  last: string;
  handle: string;
  city: string;
  country: string;
  club: string;
  level: string;
  bio: string;
  member: string;
  avatarUrl: string | null;
  rating: number;
  ratingDelta: number;
  ranking: number;
  rankingDelta: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  streak: { type: "W" | "L"; count: number };
  attrs: { PWR: number; SPD: number; REC: number; CON: number; TOU: number; CLU: number };
  overall: number;
  ratingHistory: number[];
  ratingSnapshots: RatingSnapshotPoint[];
  currentRatingRaw: number;
  heatmap: number[][];
  partners: { name: string; matches: number; wins: number; initials: string; tone: string }[];
  rivals: {
    name: string;
    played: number;
    wins: number;
    losses: number;
    level: string;
    initials: string;
    tone: string;
  }[];
  recentMatches: {
    date: string;
    result: "W" | "L";
    score: string;
    opp: string;
    oppLevel: string;
    delta: string;
    venue: string;
  }[];
  badges: {
    label: string;
    icon: string;
    on: boolean;
    when?: string;
    rarity: "Común" | "Rara" | "Épica" | "Legendaria";
    desc: string;
  }[];
  upcoming: { date: string; opp: string; club: string; type: string }[];
  h2hViewer: { played: number; mineWins: number; theirWins: number; last: string; lastDate: string };
  clubs: { name: string; role: string; primary: boolean; tone: string }[];
  analyticsUpdatedAt: string | null;
  coachShotInsights: { label: string; winPct: number }[];
  tagline: string;
  heatmapPeak: string;
  friendsCount: number;
  friendsMembers: { initials: string; tone: string; avatarUrl: string | null }[];
  badgesUnlocked: number;
  badgesTotal: number;
  quedadaStats: QuedadaProfileStats | null;
  scout: ({ viewerFirst: string; viewerLevel: number } & ProfileScoutPayload) | null;
};

export function mapProfileDataToPerfilMe(
  data: ProfileData,
  opts?: {
    h2h?: RetarHeroH2h | null;
    visitorRetarContext?: RetarHeroContext | null;
  },
): PerfilMe {
  const parts = data.name.trim().split(/\s+/);
  const first = parts[0] ?? data.name;
  const last = parts.slice(1).join(" ") || first;
  const rivals = opponentSummaries(data.matchHistory);
  const winPct = winRate(data.wins, data.matchesTotal);
  const singles = data.ratings.singles;
  const rating = ratingNum(singles?.currentRating ?? data.currentRating);
  const snapshots = data.ratingSnapshotsByMode.singles.length
    ? data.ratingSnapshotsByMode.singles
    : data.ratingSnapshotsByMode.doubles;
  const currentRaw = singles?.currentRating ?? data.currentRating;
  const heatmap = buildHeatmap(data.matchHistory);
  const badges = data.badges ?? [];
  const badgesUnlocked = badges.filter((b) => b.on).length;

  const h2h = opts?.h2h ?? opts?.visitorRetarContext?.h2h;
  const scoutPayload = opts?.visitorRetarContext?.scout;
  const h2hViewer = (() => {
    if (!h2h || h2h.total <= 0) {
      return { played: 0, mineWins: 0, theirWins: 0, last: "—", lastDate: "Sin cruces" };
    }
    const last =
      h2h.streak ??
      (h2h.youWins > h2h.rivalWins
        ? "Vas ganando el historial"
        : h2h.youWins < h2h.rivalWins
          ? "Vas perdiendo el historial"
          : "Historial empatado");
    return {
      played: h2h.total,
      mineWins: h2h.youWins,
      theirWins: h2h.rivalWins,
      last,
      lastDate: "Último cruce reciente",
    };
  })();

  return {
    profileUserId: data.meUserId,
    name: data.name,
    first,
    last,
    handle: `@${data.username}`,
    city: data.city ?? "—",
    country: formatCountry(data.country),
    club: data.primaryClub?.name ?? "Sin club",
    level: ratingNum(currentRaw).toFixed(1),
    bio: data.bio ?? "",
    tagline: taglineFromBio(data.bio),
    member: new Intl.DateTimeFormat("es-EC", { month: "short", year: "numeric" }).format(
      new Date(data.memberSince),
    ),
    avatarUrl: data.avatarUrl,
    rating,
    ratingDelta: ratingDeltaFromSnapshots(snapshots, currentRaw, 30),
    ranking: data.rank ?? 0,
    rankingDelta: 0,
    matches: data.matchesTotal,
    wins: data.wins,
    losses: data.losses,
    winRate: winPct,
    streak: currentStreak(data.matchHistory),
    attrs: { PWR: 70, SPD: 70, REC: 70, CON: 70, TOU: 70, CLU: 70 },
    overall: 70,
    ratingHistory: ratingHistoryFromSnapshots(snapshots, currentRaw),
    ratingSnapshots: snapshots,
    currentRatingRaw: currentRaw,
    heatmap,
    heatmapPeak: heatmapPeakLabel(heatmap),
    partners: rivals.slice(0, 4).map((r) => ({
      name: r.name,
      matches: r.played,
      wins: r.wins,
      initials: r.initials,
      tone: r.tone,
    })),
    rivals: rivals.slice(0, 4).map((r) => ({ ...r, level: r.level })),
    recentMatches: data.matchHistory.slice(0, 5).map((m) => ({
      date: fmtMatchDate(m.playedAt),
      result: m.result === "win" ? "W" : "L",
      score: scoreText(m),
      opp: m.oppName,
      oppLevel: m.mode === "doubles" ? "Dobles" : "Singles",
      delta:
        m.ratingDelta != null ? `${m.ratingDelta >= 0 ? "+" : ""}${(m.ratingDelta / 1000).toFixed(2)}` : "—",
      venue: m.clubName ?? "Sin club",
    })),
    badges: badges.map((b) => ({
      label: b.label,
      icon: b.icon,
      on: b.on,
      when: b.on ? undefined : undefined,
      rarity: "Común" as const,
      desc: b.description ?? "",
    })),
    badgesUnlocked,
    badgesTotal: badges.length,
    quedadaStats: data.quedadaStats ?? null,
    upcoming: (data.upcoming ?? []).map((u) => ({
      date: u.dateLabel,
      opp: "Reserva",
      club: u.club,
      type: u.type,
    })),
    friendsCount: data.friendsPreview?.count ?? 0,
    friendsMembers: data.friendsPreview?.members ?? [],
    h2hViewer,
    clubs: data.clubs.slice(0, 3).map((c, i) => ({
      name: c.name,
      role: c.role,
      primary: i === 0,
      tone: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
    })),
    analyticsUpdatedAt: data.analyticsUpdatedAt,
    coachShotInsights: data.coachShotInsights,
    scout:
      scoutPayload && opts?.visitorRetarContext
        ? {
            viewerFirst: firstName(opts.visitorRetarContext.me.name),
            viewerLevel: opts.visitorRetarContext.me.level,
            ...scoutPayload,
          }
        : null,
  };
}

export function ownerSubFromProfile(data: ProfileData): "free" | "plus" {
  return data.isPremium ? "plus" : "free";
}

export { firstName };
