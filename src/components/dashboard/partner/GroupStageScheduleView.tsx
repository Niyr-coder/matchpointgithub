"use client";

import { useMemo } from "react";
import { ScoreMatchCard } from "@/components/dashboard/brackets/ScoreMatchCard";
import { fmtScheduleDate, fmtScheduleTime } from "@/lib/tournaments/group-court-schedule";
import type { GroupStageSummary } from "@/server/actions/tournament-group-stage";

type GroupMatch = GroupStageSummary["groups"][number]["matches"][number];

function isMatchDone(status: string): boolean {
  return status === "reported" || status === "confirmed";
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
  matchFilter,
  reportingMatchId,
  busy,
  onScoreSubmit,
}: {
  summary: GroupStageSummary;
  registrationLabels: Record<string, string>;
  canEditScores: boolean;
  matchFilter: "pending" | "all";
  reportingMatchId: string | null;
  busy: boolean;
  onScoreSubmit: (matchId: string, setsA: number, setsB: number) => void;
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

  const filtered = useMemo(() => {
    if (matchFilter === "all") return allMatches;
    return allMatches.filter((m) => !isMatchDone(m.status));
  }, [allMatches, matchFilter]);

  const byRound = useMemo(() => {
    const map = new Map<number, typeof filtered>();
    for (const m of filtered) {
      const list = map.get(m.roundNo) ?? [];
      list.push(m);
      map.set(m.roundNo, list);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [filtered]);

  if (!selectedCourtIds.length) {
    return (
      <p className="mp-grp-empty">
        Configura las canchas activas para esta categoría y guarda la programación. Así verás
        partidos por fecha y cancha.
      </p>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="mp-grp-empty">
        {matchFilter === "pending"
          ? "No hay partidos pendientes con el filtro actual."
          : "No hay partidos programados."}
      </p>
    );
  }

  return (
    <div className="mp-grp-schedule">
      {byRound.map(([roundNo, roundMatches]) => {
        const waves = new Map<number, typeof roundMatches>();
        for (const m of roundMatches) {
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
                    return (
                      <div key={courtId} className="mp-grp-schedule-court">
                        <div className="mp-grp-schedule-court-head">
                          <span>{courtLabels.get(courtId) ?? "Cancha"}</span>
                          {slotMatch?.scheduledAt && (
                            <span>{fmtScheduleTime(slotMatch.scheduledAt)}</span>
                          )}
                        </div>
                        {slotMatch ? (
                          <ScheduleMatchCard
                            match={slotMatch}
                            registrationLabels={registrationLabels}
                            canEditScores={canEditScores}
                            reportingMatchId={reportingMatchId}
                            busy={busy}
                            onScoreSubmit={onScoreSubmit}
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
  registrationLabels,
  canEditScores,
  reportingMatchId,
  busy,
  onScoreSubmit,
}: {
  match: GroupMatch & { groupName: string };
  registrationLabels: Record<string, string>;
  canEditScores: boolean;
  reportingMatchId: string | null;
  busy: boolean;
  onScoreSubmit: (matchId: string, setsA: number, setsB: number) => void;
}) {
  const done = isMatchDone(match.status);
  const labelA =
    registrationLabels[match.sideARegistrationId] ?? "Equipo A";
  const labelB =
    registrationLabels[match.sideBRegistrationId] ?? "Equipo B";

  return (
    <ScoreMatchCard
      matchId={match.id}
      labelA={labelA}
      labelB={labelB}
      scoreA={parseSetsWon(match.score, "a")}
      scoreB={parseSetsWon(match.score, "b")}
      winnerSide={match.winnerSide === "a" || match.winnerSide === "b" ? match.winnerSide : null}
      editable={canEditScores && !done}
      correctable={canEditScores && done}
      busy={reportingMatchId === match.id && busy}
      dimmed={done}
      meta={`Grupo ${match.groupName}`}
      onScoreSubmit={onScoreSubmit}
    />
  );
}
