"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ScoreMatchCard } from "@/components/dashboard/brackets/ScoreMatchCard";
import { useToast, TOAST_SCORE_MS } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import {
  closeGroupStage,
  drawTournamentGroups,
  generateKnockoutFromGroups,
  getGroupStageSummary,
  reportGroupMatch,
  correctGroupMatch,
  saveGroupStageScheduling,
} from "@/server/actions/tournament-group-stage";
import type { GroupStageSummary } from "@/server/actions/tournament-group-stage";
import { GroupStageScheduleView } from "./GroupStageScheduleView";

export type GroupStageCategory = {
  id: string;
  name: string;
  stage: string;
  acceptedCount: number;
};

type Props = {
  tournamentId: string;
  categories: GroupStageCategory[];
  clubCourts: Array<{ id: string; label: string }>;
  registrationLabels: Record<string, string>;
  initialCategoryId: string | null;
  initial: GroupStageSummary | null;
};

type GroupRow = GroupStageSummary["groups"][number];
type ViewMode = "groups" | "schedule";

const STAGE_LABEL: Record<string, string> = {
  pending_groups: "Pendiente sorteo",
  group_stage: "Fase de grupos",
  group_complete: "Grupos cerrados",
  knockout: "Eliminatoria",
  complete: "Finalizada",
};

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

function parseSetsWon(score: unknown, side: "a" | "b"): number | null {
  if (!score || typeof score !== "object") return null;
  const sets = (score as { sets?: Array<{ a: number; b: number }> }).sets;
  if (!sets?.length) return null;
  const first = sets[0];
  return side === "a" ? first.a : first.b;
}

function isMatchDone(status: string): boolean {
  return status === "reported" || status === "confirmed";
}

export function GroupStagePanel({
  tournamentId,
  categories,
  clubCourts,
  registrationLabels,
  initialCategoryId,
  initial,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [reportingMatchId, setReportingMatchId] = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState<"pending" | "all">("pending");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("groups");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    initialCategoryId ?? categories[0]?.id ?? null,
  );
  const [summary, setSummary] = useState<GroupStageSummary | null>(
    initial && initial.categoryId === (initialCategoryId ?? categories[0]?.id) ? initial : null,
  );
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [selectedCourts, setSelectedCourts] = useState<string[]>([]);
  const [slotMin, setSlotMin] = useState(50);
  const [fechaGap, setFechaGap] = useState(24);
  const [roundOneStart, setRoundOneStart] = useState("");

  const [categoryStages, setCategoryStages] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, c.stage])),
  );

  useEffect(() => {
    setCategoryStages(Object.fromEntries(categories.map((c) => [c.id, c.stage])));
  }, [categories]);

  useEffect(() => {
    if (summary?.categoryId && summary.stage) {
      setCategoryStages((prev) => ({ ...prev, [summary.categoryId]: summary.stage }));
    }
  }, [summary?.categoryId, summary?.stage]);

  const reloadSummary = useCallback(
    async (categoryId: string) => {
      setLoadingSummary(true);
      const res = await getGroupStageSummary({ tournamentId, categoryId });
      if (res.ok) setSummary(res.data);
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      setLoadingSummary(false);
    },
    [tournamentId, toast],
  );

  useEffect(() => {
    if (!activeCategoryId) return;
    if (summary?.categoryId === activeCategoryId) return;
    setSummary(null);
    void reloadSummary(activeCategoryId);
  }, [activeCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = summary?.config.scheduling;
    setSelectedCourts(s?.courtIds ?? clubCourts.slice(0, Math.min(5, clubCourts.length)).map((c) => c.id));
    setSlotMin(s?.slotDurationMin ?? 50);
    setFechaGap(s?.fechaGapHours ?? 24);
    setRoundOneStart(s?.roundOneStartsAt ? isoToLocalInput(s.roundOneStartsAt) : "");
  }, [summary?.categoryId, summary?.config.scheduling, clubCourts]);

  useRealtimeRefresh(
    activeCategoryId
      ? [
          { table: "tournament_group_matches" },
          { table: "tournament_groups", filter: `category_id=eq.${activeCategoryId}` },
          { table: "tournament_categories", filter: `id=eq.${activeCategoryId}` },
        ]
      : [],
    {
      enabled: !!activeCategoryId,
      onChange: () => {
        if (activeCategoryId) void reloadSummary(activeCategoryId);
      },
    },
  );

  const stage = summary?.stage ?? "pending_groups";
  const groups = summary?.groups ?? [];
  const acceptedCount = summary?.acceptedCount ?? 0;

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }
    if (!selectedGroupId || !groups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    setMatchFilter("pending");
    setViewMode("groups");
  }, [activeCategoryId]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0] ?? null;
  const teamsPerGroup =
    summary && summary.config.groupsCount > 0
      ? Math.floor(acceptedCount / summary.config.groupsCount)
      : 0;

  const selectedPendingCount = selectedGroup
    ? selectedGroup.matches.filter((m) => !isMatchDone(m.status)).length
    : 0;
  const selectedTotalCount = selectedGroup?.matches.length ?? 0;

  const displayedMatches = useMemo(() => {
    if (!selectedGroup) return [];
    if (matchFilter === "all") return selectedGroup.matches;
    return selectedGroup.matches.filter((m) => !isMatchDone(m.status));
  }, [selectedGroup, matchFilter]);

  useEffect(() => {
    setMatchFilter("pending");
  }, [selectedGroupId]);

  const wrap = (key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    if (busy) return;
    setBusy(key);
    startTx(async () => {
      try {
        const res = (await fn()) as { ok: boolean; error?: { message: string } };
        if (res.ok) {
          toast({
            icon: "check",
            title: ok,
            durationMs: key === "report" || key === "correct" ? TOAST_SCORE_MS : undefined,
          });
          if (activeCategoryId) await reloadSummary(activeCategoryId);
          router.refresh();
          after?.();
        } else {
          toast({
            icon: "alert-triangle",
            title: "No se pudo",
            sub: res.error?.message ?? "Error",
          });
        }
      } finally {
        setBusy(null);
        setReportingMatchId(null);
      }
    });
  };

  const onSaveScheduling = () => {
    if (!activeCategoryId) return;
    if (selectedCourts.length === 0) {
      toast({ icon: "alert-triangle", title: "Elige al menos una cancha" });
      return;
    }
    wrap(
      "sched",
      () =>
        saveGroupStageScheduling({
          tournamentId,
          categoryId: activeCategoryId,
          scheduling: {
            courtIds: selectedCourts,
            slotDurationMin: slotMin,
            fechaGapHours: fechaGap,
            roundOneStartsAt: roundOneStart ? localInputToIso(roundOneStart) : null,
          },
        }),
      "Programación guardada",
    );
  };

  const onDraw = () => {
    if (!summary || !activeCategoryId) return;
    if (selectedCourts.length === 0 && clubCourts.length > 0) {
      toast({
        icon: "alert-triangle",
        title: "Configura canchas",
        sub: "Selecciona las canchas activas y guarda la programación antes del sorteo.",
      });
      return;
    }
    wrap(
      "draw",
      async () => {
        if (selectedCourts.length > 0) {
          const sched = await saveGroupStageScheduling({
            tournamentId,
            categoryId: activeCategoryId,
            scheduling: {
              courtIds: selectedCourts,
              slotDurationMin: slotMin,
              fechaGapHours: fechaGap,
              roundOneStartsAt: roundOneStart ? localInputToIso(roundOneStart) : null,
            },
          });
          if (!sched.ok) return sched;
        }
        return drawTournamentGroups({
          tournamentId,
          categoryId: summary.categoryId,
        });
      },
      "Grupos sorteados y calendario generado",
    );
  };

  const onCloseGroups = () =>
    wrap(
      "close",
      () =>
        closeGroupStage({
          tournamentId,
          categoryId: summary!.categoryId,
        }),
      "Fase de grupos cerrada",
    );

  const onKnockout = () =>
    wrap(
      "ko",
      () =>
        generateKnockoutFromGroups({
          tournamentId,
          categoryId: summary!.categoryId,
        }),
      "Cuadro final generado",
    );

  const onScoreSubmit = (matchId: string, setsA: number, setsB: number) => {
    if (busy) return;
    const winnerSide = setsA > setsB ? "a" : "b";
    let isCorrection = false;
    for (const g of groups) {
      const m = g.matches.find((x) => x.id === matchId);
      if (m) {
        isCorrection = isMatchDone(m.status);
        break;
      }
    }
    setReportingMatchId(matchId);
    wrap(
      isCorrection ? "correct" : "report",
      () =>
        isCorrection
          ? correctGroupMatch({
              tournamentId,
              matchId,
              winnerSide,
              score: { sets: [{ a: setsA, b: setsB }] },
            })
          : reportGroupMatch({
              tournamentId,
              matchId,
              winnerSide,
              score: { sets: [{ a: setsA, b: setsB }] },
            }),
      isCorrection ? "Marcador corregido" : "Resultado registrado",
    );
  };

  if (categories.length === 0) {
    return (
      <div className="card mp-grp-panel">
        <div className="label-mp">Fase de grupos</div>
        <p className="mp-grp-empty">Crea una categoría con config de grupos para este torneo.</p>
      </div>
    );
  }

  const schedulePendingCount = useMemo(
    () =>
      groups.reduce(
        (n, g) => n + g.matches.filter((m) => !isMatchDone(m.status)).length,
        0,
      ),
    [groups],
  );
  const scheduleTotalCount = useMemo(
    () => groups.reduce((n, g) => n + g.matches.length, 0),
    [groups],
  );

  const canEditScores = stage === "group_stage";
  const showScheduling = stage === "pending_groups" || stage === "group_stage";

  return (
    <div className="card mp-grp-panel">
      <div className="mp-grp-panel-head">
        <div>
          <div className="label-mp">Fase de grupos</div>
          <p className="mp-grp-panel-sub">
            Cada categoría avanza por separado. Elige una para sortear, programar canchas y cargar
            marcadores.
          </p>
        </div>
      </div>

      <div className="mp-grp-category-bar" role="tablist" aria-label="Categorías">
        {categories.map((c) => {
          const on = c.id === activeCategoryId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={`mp-grp-category-tab${on ? " is-active" : ""}`}
              onClick={() => setActiveCategoryId(c.id)}
            >
              <span className="mp-grp-category-tab-name">{c.name}</span>
              <span className="mp-grp-category-tab-stage">
                {STAGE_LABEL[c.id === activeCategoryId ? stage : categoryStages[c.id]] ??
                  categoryStages[c.id]}
              </span>
            </button>
          );
        })}
      </div>

      {(loadingSummary || summary?.categoryId !== activeCategoryId) && (
        <p className="mp-grp-empty">Cargando categoría…</p>
      )}

      {summary && summary.categoryId === activeCategoryId && (
        <>
          <div className="mp-grp-panel-head mp-grp-panel-head--sub">
            <div>
              <div className="label-mp">
                {summary.categoryName} · {STAGE_LABEL[stage] ?? stage}
              </div>
              <p className="mp-grp-panel-sub">
                {summary.config.groupsCount} grupos · {teamsPerGroup || 4} equipos c/u · top{" "}
                {summary.config.advancePerGroup} clasifican · {acceptedCount} inscritos aceptados
              </p>
            </div>
            <div className="mp-grp-panel-actions">
              {stage === "pending_groups" && (
                <ActionBtn
                  icon="shuffle"
                  label="Sortear grupos"
                  onClick={onDraw}
                  loading={busy === "draw"}
                  disabled={acceptedCount < summary.config.groupsCount}
                  primary
                />
              )}
              {stage === "group_stage" && (
                <ActionBtn
                  icon="lock"
                  label="Cerrar fase de grupos"
                  onClick={onCloseGroups}
                  loading={busy === "close"}
                  primary
                />
              )}
              {stage === "knockout" && (
                <Link href="/dashboard/partner/brackets" className="btn btn-primary mp-grp-link-btn">
                  Ver bracket en vivo
                </Link>
              )}
              {stage === "group_complete" && (
                <ActionBtn
                  icon="trophy"
                  label="Generar cuadro final"
                  onClick={onKnockout}
                  loading={busy === "ko"}
                  primary
                />
              )}
            </div>
          </div>

          {stage === "pending_groups" && acceptedCount < summary.config.groupsCount && (
            <p className="mp-grp-alert">
              Necesitas al menos {summary.config.groupsCount} inscripciones aceptadas en esta
              categoría (tienes {acceptedCount}).
            </p>
          )}

          {showScheduling && clubCourts.length > 0 && (
            <div className="mp-grp-scheduling-card">
              <div className="mp-grp-scheduling-head">
                <div>
                  <div className="label-mp">Canchas activas · {summary.categoryName}</div>
                  <p className="mp-grp-panel-sub">
                    Elige cuántas canchas usar del club. Si hay más partidos que canchas en una
                    fecha, se forman olas automáticas.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary mp-grp-action-btn"
                  onClick={onSaveScheduling}
                  disabled={busy === "sched" || selectedCourts.length === 0}
                >
                  {busy === "sched" ? "Guardando…" : "Guardar programación"}
                </button>
              </div>
              <div className="mp-grp-court-picks">
                {clubCourts.map((c) => {
                  const on = selectedCourts.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`mp-grp-court-pick${on ? " is-on" : ""}`}
                      onClick={() =>
                        setSelectedCourts((prev) =>
                          on ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                        )
                      }
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div className="mp-grp-scheduling-fields">
                <label className="mp-grp-field">
                  <span>Inicio fecha 1</span>
                  <input
                    type="datetime-local"
                    value={roundOneStart}
                    onChange={(e) => setRoundOneStart(e.target.value)}
                  />
                </label>
                <label className="mp-grp-field">
                  <span>Minutos por partido</span>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    value={slotMin}
                    onChange={(e) => setSlotMin(Number(e.target.value) || 50)}
                  />
                </label>
                <label className="mp-grp-field">
                  <span>Horas entre fechas</span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={fechaGap}
                    onChange={(e) => setFechaGap(Number(e.target.value) || 24)}
                  />
                </label>
              </div>
            </div>
          )}

          {showScheduling && clubCourts.length === 0 && (
            <p className="mp-grp-alert">
              Este torneo no tiene canchas del club configuradas. Los partidos se generan sin
              horario hasta que el club registre canchas.
            </p>
          )}

          {groups.length > 0 && (
            <div className="mp-grp-view-toolbar">
              <div className="mp-grp-view-toggle" role="tablist" aria-label="Vista de partidos">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "groups"}
                  className={`mp-grp-view-tab${viewMode === "groups" ? " is-active" : ""}`}
                  onClick={() => setViewMode("groups")}
                >
                  Por grupo
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "schedule"}
                  className={`mp-grp-view-tab${viewMode === "schedule" ? " is-active" : ""}`}
                  onClick={() => setViewMode("schedule")}
                >
                  Por cancha
                </button>
              </div>
              {scheduleTotalCount > 0 && (
                <div className="mp-grp-filter mp-grp-filter--inline">
                  <div className="mp-grp-filter-tabs" role="tablist" aria-label="Filtrar partidos">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={matchFilter === "pending"}
                      className={`mp-grp-filter-tab${matchFilter === "pending" ? " is-active" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setMatchFilter("pending")}
                    >
                      Pendientes ({schedulePendingCount})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={matchFilter === "all"}
                      className={`mp-grp-filter-tab${matchFilter === "all" ? " is-active" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setMatchFilter("all")}
                    >
                      Todos ({scheduleTotalCount})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {groups.length > 0 && viewMode === "schedule" && (
            <GroupStageScheduleView
              summary={summary}
              registrationLabels={registrationLabels}
              canEditScores={canEditScores}
              matchFilter={matchFilter}
              reportingMatchId={reportingMatchId}
              busy={busy === "report"}
              onScoreSubmit={onScoreSubmit}
            />
          )}

          {groups.length > 0 && viewMode === "groups" && (
            <div className="mp-grp-panel-body">
              <aside className="mp-grp-sidebar" aria-label="Grupos y tablas">
                <div className="label-mp mp-grp-sidebar-label">Grupos</div>
                <div className="mp-grp-sidebar-list">
                  {groups.map((g) => (
                    <GroupStandingsCard
                      key={g.id}
                      group={g}
                      active={selectedGroup?.id === g.id}
                      advancePerGroup={summary.config.advancePerGroup}
                      registrationLabels={registrationLabels}
                      onSelect={() => setSelectedGroupId(g.id)}
                    />
                  ))}
                </div>
              </aside>

              {selectedGroup && (
                <div className="mp-grp-matches-pane">
                  <div className="mp-grp-standings-block mp-grp-standings-block--mobile">
                    <div className="label-mp mp-grp-standings-block-label">
                      Posiciones · Grupo{" "}
                      <span className="mp-grp-matches-group-tag">{selectedGroup.name}</span>
                    </div>
                    <GroupStandingsTable
                      group={selectedGroup}
                      advancePerGroup={summary.config.advancePerGroup}
                      registrationLabels={registrationLabels}
                    />
                  </div>
                  <div className="mp-grp-matches-head">
                    <div>
                      <div className="label-mp">
                        Partidos · Grupo{" "}
                        <span className="mp-grp-matches-group-tag">{selectedGroup.name}</span>
                      </div>
                      <p className="mp-grp-matches-sub">
                        {selectedGroup.standings.length} equipos · {selectedPendingCount} pendientes
                        {selectedTotalCount > 0 &&
                        matchFilter === "all" &&
                        selectedPendingCount < selectedTotalCount
                          ? ` · ${selectedTotalCount - selectedPendingCount} finalizados`
                          : ""}
                      </p>
                    </div>
                    {selectedTotalCount > 0 && (
                      <div className="mp-grp-filter mp-grp-filter--inline">
                        <div
                          className="mp-grp-filter-tabs"
                          role="tablist"
                          aria-label="Filtrar partidos"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={matchFilter === "pending"}
                            className={`mp-grp-filter-tab${matchFilter === "pending" ? " is-active" : ""}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setMatchFilter("pending")}
                          >
                            Pendientes ({selectedPendingCount})
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={matchFilter === "all"}
                            className={`mp-grp-filter-tab${matchFilter === "all" ? " is-active" : ""}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setMatchFilter("all")}
                          >
                            Todos ({selectedTotalCount})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {canEditScores && selectedTotalCount > 0 && (
                    <p className="mp-grp-filter-hint mp-grp-filter-hint--pane">
                      Enter o salir del campo guarda el marcador
                    </p>
                  )}

                  <div key={selectedGroup.id} className="mp-grp-matches-switch">
                    <GroupMatchesPane
                      matches={displayedMatches}
                      totalCount={selectedTotalCount}
                      matchFilter={matchFilter}
                      registrationLabels={registrationLabels}
                      canEditScores={canEditScores}
                      reportingMatchId={reportingMatchId}
                      busy={busy === "report"}
                      onScoreSubmit={onScoreSubmit}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GroupStandingsTable({
  group,
  advancePerGroup,
  registrationLabels,
  compact = false,
}: {
  group: GroupRow;
  advancePerGroup: number;
  registrationLabels: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <div className={`mp-grp-standings${compact ? " mp-grp-standings--compact" : ""}`}>
      <div className="mp-grp-standings-head">
        <span>#</span>
        <span>Equipo</span>
        <div className="mp-grp-standing-stats mp-grp-standing-stats--head" aria-hidden>
          <span>PJ</span>
          <span>G</span>
          <span>P</span>
          <span>Sets</span>
        </div>
      </div>
      {group.standings.map((row) => {
        const qualified = row.rank <= advancePerGroup;
        const showCutoff =
          row.rank === advancePerGroup &&
          group.standings.some((r) => r.rank === advancePerGroup + 1);
        return (
          <Fragment key={row.registrationId}>
            <div className={`mp-grp-standing-row${qualified ? " is-qualified" : ""}`}>
              <span className="mp-grp-standing-rank">{row.rank}</span>
              <span className="mp-grp-standing-name">
                {registrationLabels[row.registrationId] ?? "Equipo sin nombre"}
              </span>
              <div className="mp-grp-standing-stats" aria-label="Estadísticas">
                <span className="mp-grp-standing-stat">
                  <span className="mp-grp-stat-lbl">PJ</span>
                  <span className="mp-grp-stat-val">{row.played}</span>
                </span>
                <span className="mp-grp-standing-stat is-win">
                  <span className="mp-grp-stat-lbl">G</span>
                  <span className="mp-grp-stat-val">{row.wins}</span>
                </span>
                <span className="mp-grp-standing-stat is-loss">
                  <span className="mp-grp-stat-lbl">P</span>
                  <span className="mp-grp-stat-val">{row.losses}</span>
                </span>
                <span className="mp-grp-standing-stat">
                  <span className="mp-grp-stat-lbl">Sets</span>
                  <span className="mp-grp-stat-val">
                    {row.setsWon}-{row.setsLost}
                  </span>
                </span>
              </div>
            </div>
            {showCutoff && (
              <div
                className="mp-grp-cutoff"
                role="separator"
                aria-label={`Clasifican ${advancePerGroup}`}
              >
                <span>Clasifican {advancePerGroup}</span>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function GroupStandingsCard({
  group,
  active,
  advancePerGroup,
  registrationLabels,
  onSelect,
}: {
  group: GroupRow;
  active: boolean;
  advancePerGroup: number;
  registrationLabels: Record<string, string>;
  onSelect: () => void;
}) {
  const pendingCount = group.matches.filter((m) => !isMatchDone(m.status)).length;
  const doneCount = group.matches.length - pendingCount;

  return (
    <button
      type="button"
      className={`mp-grp-sidebar-card${active ? " is-active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <div className="mp-grp-sidebar-card-head">
        <span className="mp-grp-sidebar-card-title">
          {active && <span className="mp-grp-sidebar-card-dot" aria-hidden />}
          Grupo {group.name}
        </span>
        {group.matches.length > 0 && (
          <span className="mp-grp-sidebar-card-meta">
            {doneCount}/{group.matches.length}
          </span>
        )}
      </div>
      <div className="mp-grp-sidebar-card-standings">
        <GroupStandingsTable
          group={group}
          advancePerGroup={advancePerGroup}
          registrationLabels={registrationLabels}
          compact
        />
      </div>
      {group.matches.length > 0 && pendingCount > 0 && (
        <span className="mp-grp-sidebar-pending">{pendingCount} pendientes</span>
      )}
    </button>
  );
}

function GroupMatchesPane({
  matches,
  totalCount,
  registrationLabels,
  canEditScores,
  matchFilter,
  reportingMatchId,
  busy,
  onScoreSubmit,
}: {
  matches: GroupRow["matches"];
  totalCount: number;
  registrationLabels: Record<string, string>;
  canEditScores: boolean;
  matchFilter: "pending" | "all";
  reportingMatchId: string | null;
  busy: boolean;
  onScoreSubmit: (matchId: string, setsA: number, setsB: number) => void;
}) {
  const rounds = useMemo(() => {
    const map = new Map<number, typeof matches>();
    for (const m of matches) {
      const list = map.get(m.roundNo) ?? [];
      list.push(m);
      map.set(m.roundNo, list);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [matches]);

  if (totalCount === 0) {
    return <p className="mp-grp-empty">Sortea los grupos para generar el calendario.</p>;
  }

  if (matches.length === 0) {
    return (
      <p className="mp-grp-empty">
        {matchFilter === "pending"
          ? "No hay partidos pendientes en este grupo."
          : "No hay partidos en este grupo."}
      </p>
    );
  }

  return (
    <div className="mp-grp-rounds">
      {matchFilter === "all" && matches.length === totalCount && (
        <p className="mp-grp-filter-hint mp-grp-filter-hint--pane" style={{ marginTop: 0 }}>
          {matches.every((m) => !isMatchDone(m.status))
            ? "Todos los partidos siguen pendientes de marcador."
            : "Los partidos con marcador aparecen atenuados."}
        </p>
      )}
      {rounds.map(([roundNo, roundMatches]) => (
        <div key={roundNo} className="mp-grp-round">
          <div className="mp-grp-round-label">Fecha {roundNo}</div>
          <div className="mp-grp-round-grid">
            {roundMatches.map((m) => {
              const done = isMatchDone(m.status);
              const labelA = registrationLabels[m.sideARegistrationId] ?? "Equipo A";
              const labelB = registrationLabels[m.sideBRegistrationId] ?? "Equipo B";
              return (
                <ScoreMatchCard
                  key={m.id}
                  matchId={m.id}
                  labelA={labelA}
                  labelB={labelB}
                  scoreA={parseSetsWon(m.score, "a")}
                  scoreB={parseSetsWon(m.score, "b")}
                  winnerSide={m.winnerSide === "a" || m.winnerSide === "b" ? m.winnerSide : null}
                  editable={canEditScores && !done}
                  correctable={canEditScores && done}
                  busy={reportingMatchId === m.id && busy}
                  dimmed={done && matchFilter === "all"}
                  meta={`Partido ${m.matchNo}`}
                  onScoreSubmit={onScoreSubmit}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  loading,
  disabled,
  primary,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? "btn btn-primary mp-grp-action-btn" : "btn mp-grp-action-btn"}
      onClick={onClick}
      disabled={disabled || loading}
    >
      <Icon name={icon} size={13} />
      {loading ? "…" : label}
    </button>
  );
}
