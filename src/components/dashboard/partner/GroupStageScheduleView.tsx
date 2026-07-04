"use client";

import { useMemo } from "react";
import { ScoreMatchCard } from "@/components/dashboard/brackets/ScoreMatchCard";
import { fmtScheduleDate, fmtScheduleTime } from "@/lib/tournaments/group-court-schedule";
import type { GroupStageSummary } from "@/server/actions/tournament-group-stage";

type GroupMatch = GroupStageSummary["groups"][number]["matches"][number];

function isMatchConfirmed(status: string): boolean {
  return status === "confirmed";
}

function isMatchAwaitingConfirm(status: string): boolean {
  return status === "reported";
}

function isMatchPendingPlay(status: string): boolean {
  return !isMatchConfirmed(status) && !isMatchAwaitingConfirm(status);
}

function matchListSortOrder(status: string): number {
  if (isMatchPendingPlay(status)) return 0;
  if (isMatchAwaitingConfirm(status)) return 1;
  return 2;
}

function parseSetsWon(score: unknown, side: "a" | "b"): number | null {
  if (!score || typeof score !== "object") return null;
  const sets = (score as { sets?: Array<{ a: number; b: number }> }).sets;
  if (!sets?.length) return null;
  const first = sets[0];
  return side === "a" ? first.a : first.b;
}

export function GroupStageScheduleView({
  summary,
  registrationLabels,
  canEditScores,
  savingIds,
  onScoreSubmit,
  onConfirmMatch,
}: {
  summary: GroupStageSummary;
  registrationLabels: Record<string, string>;
  canEditScores: boolean;
  savingIds: Set<string>;
  onScoreSubmit: (matchId: string, setsA: number, setsB: number) => void;
  onConfirmMatch: (matchId: string) => void;
}) {
  const courtLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of summary.courts) m.set(c.id, c.label);
    return m;
  }, [summary.courts]);

  const selectedCourtIds = summary.config.scheduling?.courtIds ?? [];

  const allMatches = useMemo(() => {
    const list: Array<GroupMatch & { groupName: string }> = [];
    for (const g of summary.groups) {
      for (const m of g.matches) {
        list.push({ ...m, groupName: g.name });
      }
    }
    return list;
  }, [summary.groups]);

  const byRound = useMemo(() => {
    const map = new Map<number, typeof allMatches>();
    for (const m of allMatches) {
      const list = map.get(m.roundNo) ?? [];
      list.push(m);
      map.set(m.roundNo, list);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [allMatches]);

  if (!selectedCourtIds.length) {
    return (
      <p className="mp-grp-empty">
        Configura las canchas activas para esta categoría y guarda la programación. Así verás
        partidos por fecha y cancha.
      </p>
    );
  }

  if (allMatches.length === 0) {
    return <p className="mp-grp-empty">No hay partidos programados.</p>;
  }

  return (
    <div className="mp-grp-schedule">
      {canEditScores && (
        <p className="mp-grp-match-legend mp-grp-match-legend--schedule" aria-hidden>
          <span className="mp-grp-legend-pill is-pending">Por jugar</span>
          <span className="mp-grp-legend-pill is-awaiting">Por confirmar</span>
          <span className="mp-grp-legend-pill is-done">Confirmado</span>
        </p>
      )}
      {byRound.map(([roundNo, roundMatches]) => {
        const sortedRound = [...roundMatches].sort(
          (a, b) =>
            matchListSortOrder(a.status) - matchListSortOrder(b.status) || a.matchNo - b.matchNo,
        );
        const waves = new Map<number, typeof sortedRound>();
        for (const m of sortedRound) {
          const w = m.waveNo ?? 0;
          const list = waves.get(w) ?? [];
          list.push(m);
          waves.set(w, list);
        }
        const waveNos = [...waves.keys()].sort((a, b) => a - b);

        return (
          <section key={roundNo} className="mp-grp-schedule-fecha">
            <div className="mp-grp-schedule-fecha-head">
              <h3 className="font-heading mp-grp-schedule-fecha-title">Fecha {roundNo}</h3>
              {roundMatches[0]?.scheduledAt && (
                <span className="mp-grp-schedule-fecha-date">
                  {fmtScheduleDate(roundMatches[0].scheduledAt)}
                </span>
              )}
              <span className="mp-grp-schedule-fecha-meta">
                {roundMatches.length} partido{roundMatches.length === 1 ? "" : "s"} ·{" "}
                {waveNos.length} ola{waveNos.length === 1 ? "" : "s"}
              </span>
            </div>

            {waveNos.map((waveNo) => (
              <div key={waveNo} className="mp-grp-schedule-wave">
                {waveNos.length > 1 && (
                  <div className="mp-grp-schedule-wave-label">
                    Ola {waveNo + 1}
                    {waves.get(waveNo)?.[0]?.scheduledAt && (
                      <span> · {fmtScheduleTime(waves.get(waveNo)![0]!.scheduledAt!)}</span>
                    )}
                  </div>
                )}
                <div
                  className="mp-grp-schedule-courts"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(selectedCourtIds.length, 4)}, minmax(0, 1fr))`,
                  }}
                >
                  {selectedCourtIds.map((courtId) => {
                    const slotMatch = (waves.get(waveNo) ?? []).find((m) => m.courtId === courtId);
                    const courtLabel = courtLabels.get(courtId) ?? "Cancha";
                    const showCourtTime = Boolean(slotMatch?.scheduledAt) && waveNos.length <= 1;
                    return (
                      <div key={courtId} className="mp-grp-schedule-court">
                        {!slotMatch && (
                          <div className="mp-grp-schedule-court-head">
                            <span>{courtLabel}</span>
                          </div>
                        )}
                        {slotMatch ? (
                          <ScheduleMatchCard
                            match={slotMatch}
                            courtLabel={courtLabel}
                            showTime={showCourtTime}
                            registrationLabels={registrationLabels}
                            canEditScores={canEditScores}
                            savingIds={savingIds}
                            onScoreSubmit={onScoreSubmit}
                            onConfirmMatch={onConfirmMatch}
                          />
                        ) : (
                          <div className="mp-grp-schedule-court-empty">Libre</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ScheduleMatchCard({
  match,
  courtLabel,
  showTime,
  registrationLabels,
  canEditScores,
  savingIds,
  onScoreSubmit,
  onConfirmMatch,
}: {
  match: GroupMatch & { groupName: string };
  courtLabel: string;
  showTime: boolean;
  registrationLabels: Record<string, string>;
  canEditScores: boolean;
  savingIds: Set<string>;
  onScoreSubmit: (matchId: string, setsA: number, setsB: number) => void;
  onConfirmMatch: (matchId: string) => void;
}) {
  const pending = isMatchPendingPlay(match.status);
  const awaiting = isMatchAwaitingConfirm(match.status);
  const confirmed = isMatchConfirmed(match.status);
  const labelA = registrationLabels[match.sideARegistrationId] ?? "Equipo A";
  const labelB = registrationLabels[match.sideBRegistrationId] ?? "Equipo B";
  const metaParts = [courtLabel, `Grupo ${match.groupName}`];
  if (showTime && match.scheduledAt) {
    metaParts.push(fmtScheduleTime(match.scheduledAt));
  }

  return (
    <ScoreMatchCard
      matchId={match.id}
      labelA={labelA}
      labelB={labelB}
      scoreA={parseSetsWon(match.score, "a")}
      scoreB={parseSetsWon(match.score, "b")}
      winnerSide={match.winnerSide === "a" || match.winnerSide === "b" ? match.winnerSide : null}
      editable={canEditScores && pending}
      correctable={canEditScores && (awaiting || confirmed)}
      confirmable={canEditScores && awaiting}
      onConfirm={() => onConfirmMatch(match.id)}
      busy={savingIds.has(match.id)}
      dimmed={confirmed}
      embedded
      meta={metaParts.join(" · ")}
      onScoreSubmit={onScoreSubmit}
    />
  );
}
