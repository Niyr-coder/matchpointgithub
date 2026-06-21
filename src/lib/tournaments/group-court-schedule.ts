/**
 * Asignación de canchas y horarios para partidos de fase de grupos.
 * Sin I/O — una fecha (round_no) reparte partidos en olas según canchas activas.
 */

import type { GroupSchedulingConfig } from "./group-stage";

export type MatchToSchedule = {
  id: string;
  roundNo: number;
  groupSortOrder: number;
  matchNo: number;
};

export type ScheduledMatchSlot = {
  id: string;
  courtId: string;
  scheduledAt: string;
  waveNo: number;
};

const DEFAULT_FECHA_GAP_HOURS = 24;
const DEFAULT_SLOT_MIN = 50;

export function normalizeSchedulingConfig(
  raw: GroupSchedulingConfig | null | undefined,
): GroupSchedulingConfig | null {
  if (!raw?.courtIds?.length) return null;
  return {
    courtIds: raw.courtIds.filter(Boolean),
    slotDurationMin: raw.slotDurationMin > 0 ? raw.slotDurationMin : DEFAULT_SLOT_MIN,
    roundOneStartsAt: raw.roundOneStartsAt ?? null,
    fechaGapHours: raw.fechaGapHours && raw.fechaGapHours > 0 ? raw.fechaGapHours : DEFAULT_FECHA_GAP_HOURS,
  };
}

/** Reparte partidos en canchas por fecha con olas cuando hay más partidos que canchas. */
export function buildGroupCourtSchedule(
  matches: MatchToSchedule[],
  scheduling: GroupSchedulingConfig,
): ScheduledMatchSlot[] {
  const cfg = normalizeSchedulingConfig(scheduling);
  if (!cfg?.courtIds.length || !matches.length) return [];

  const slotMs = cfg.slotDurationMin * 60 * 1000;
  const fechaGapMs = (cfg.fechaGapHours ?? DEFAULT_FECHA_GAP_HOURS) * 60 * 60 * 1000;
  const baseStart = cfg.roundOneStartsAt ? new Date(cfg.roundOneStartsAt).getTime() : null;

  const byRound = new Map<number, MatchToSchedule[]>();
  for (const m of matches) {
    const list = byRound.get(m.roundNo) ?? [];
    list.push(m);
    byRound.set(m.roundNo, list);
  }

  const roundNos = [...byRound.keys()].sort((a, b) => a - b);
  const out: ScheduledMatchSlot[] = [];

  for (const roundNo of roundNos) {
    const roundMatches = [...(byRound.get(roundNo) ?? [])].sort((a, b) => {
      if (a.groupSortOrder !== b.groupSortOrder) return a.groupSortOrder - b.groupSortOrder;
      return a.matchNo - b.matchNo;
    });

    const roundStartMs =
      baseStart != null ? baseStart + (roundNo - 1) * fechaGapMs : null;

    for (let i = 0; i < roundMatches.length; i++) {
      const waveNo = Math.floor(i / cfg.courtIds.length);
      const courtId = cfg.courtIds[i % cfg.courtIds.length]!;
      const scheduledAt =
        roundStartMs != null
          ? new Date(roundStartMs + waveNo * slotMs).toISOString()
          : new Date(Date.now() + (roundNo - 1) * fechaGapMs + waveNo * slotMs).toISOString();

      out.push({ id: roundMatches[i]!.id, courtId, scheduledAt, waveNo });
    }
  }

  return out;
}

export function fmtScheduleTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
}

export function fmtScheduleDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
}
