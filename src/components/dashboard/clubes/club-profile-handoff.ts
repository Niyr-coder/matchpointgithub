import { compactHourRange } from "@/server/clubs/club-profile-hours";

export type ClubProfileStatsView = {
  eventsThisMonth: number;
  tournamentsThisMonth: number;
  quedadasThisMonth: number;
  activeGiveaways: number;
  giveawaysClosingThisWeek: number;
  weeklyOpenHoursLabel: string | null;
};

export type RailGiveaway = {
  id: string;
  title: string;
  imageLabel: string;
  entryCount: number;
  myEntries: number;
  urgent: boolean;
  closesIn: { days: number; hours: number };
};

export type RailEvent = {
  id: string;
  day: string;
  month: string;
  name: string;
  meta: string;
  taken: number;
  capacity: number;
  kind: "torneo" | "quedada";
};

const MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function formatRating(rating: number | null | undefined): string | null {
  return rating != null ? rating.toFixed(1) : null;
}

export function formatEventsMonth(stats: ClubProfileStatsView): { value: string; sub: string } {
  if (stats.eventsThisMonth === 0) {
    return { value: "0", sub: "Sin eventos este mes" };
  }
  return {
    value: String(stats.eventsThisMonth),
    sub: `${stats.tournamentsThisMonth} torneo${stats.tournamentsThisMonth !== 1 ? "s" : ""} · ${stats.quedadasThisMonth} quedada${stats.quedadasThisMonth !== 1 ? "s" : ""}`,
  };
}

export function formatGiveawaysStat(
  stats: ClubProfileStatsView,
  listCount: number,
): { value: string; sub: string } {
  const n = Math.max(stats.activeGiveaways, listCount);
  if (n === 0) {
    return { value: "0", sub: "Sin sorteos activos" };
  }
  const closing = stats.giveawaysClosingThisWeek;
  const sub = closing > 0 ? `${closing} cierran esta semana` : "En el feed del club";
  return { value: String(n), sub };
}

export function formatHoursStat(
  openHoursToday: string | null,
  weeklyLabel: string | null,
): { value: string; sub: string } {
  const today = compactHourRange(openHoursToday);
  return {
    value: today ?? "—",
    sub: weeklyLabel ?? (openHoursToday ? openHoursToday : "Horario no publicado"),
  };
}

export function activeGiveawayCount(stats: ClubProfileStatsView, listCount: number): number {
  return Math.max(stats.activeGiveaways, listCount);
}

function closesInFromIso(iso: string | null): { days: number; hours: number } {
  if (!iso) return { days: 0, hours: 0 };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { days: 0, hours: 0 };
  const hours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hours / 24), hours: hours % 24 };
}

type ActiveGiveawayInput = {
  id: string;
  title: string;
  closesAt: string | null;
  entries: number;
};

type TournamentInput = {
  id: string;
  name: string;
  startsAt: string;
  entryFeeCents: number | null;
  maxParticipants: number | null;
  participantCount?: number | null;
};

function mapGiveaway(gw: ActiveGiveawayInput): RailGiveaway {
  return {
    id: gw.id,
    title: gw.title,
    imageLabel: gw.title.slice(0, 24).toUpperCase(),
    entryCount: gw.entries,
    myEntries: 0,
    urgent: false,
    closesIn: closesInFromIso(gw.closesAt),
  };
}

function mapTournament(ev: TournamentInput): RailEvent {
  const d = new Date(ev.startsAt);
  const cap = ev.maxParticipants ?? 0;
  const taken = ev.participantCount ?? 0;
  return {
    id: ev.id,
    day: String(d.getDate()),
    month: MONTHS_SHORT[d.getMonth()],
    name: ev.name,
    meta: ev.entryFeeCents
      ? `$${(ev.entryFeeCents / 100).toFixed(0)}/inscripción`
      : cap > 0
        ? `${cap} cupos`
        : "Consultar cupos",
    taken,
    capacity: cap,
    kind: "torneo",
  };
}

export function mapRailGiveaways(real: ActiveGiveawayInput[]): RailGiveaway[] {
  return real.slice(0, 2).map(mapGiveaway);
}

export function mapRailEvents(real: TournamentInput[]): RailEvent[] {
  return real.slice(0, 3).map(mapTournament);
}
