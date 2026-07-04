"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ScoreMatchCard } from "@/components/dashboard/brackets/ScoreMatchCard";
import { useToast, TOAST_SCORE_MS } from "../ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import {
  addLateEntryToGroup,
  assignGroupsManually,
  closeGroupStage,
  drawTournamentGroups,
  generateKnockoutFromGroups,
  getGroupStageSummary,
  listCategoryAcceptedRegistrationIds,
  reportGroupMatch,
  correctGroupMatch,
  confirmGroupMatch,
  saveGroupStageScheduling,
  resetGroupDraw,
} from "@/server/actions/tournament-group-stage";
import type { GroupStageSummary } from "@/server/actions/tournament-group-stage";
import { groupLabel, validateManualGroupAssignment } from "@/lib/tournaments/group-stage";
import { GroupStageScheduleView } from "./GroupStageScheduleView";
import { DeclareWalkoverModal } from "./DeclareWalkoverModal";
import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";

/**
 * Parche optimista de un partido de grupo (Opción de latencia): se aplica al
 * instante en la UI mientras el server confirma. `score`/`winnerSide` solo
 * vienen al reportar/corregir; al confirmar basta el `status`.
 */
type GroupScorePatch = {
  score?: { sets: Array<{ a: number; b: number }> };
  winnerSide?: "a" | "b";
  status: string;
};

/** Aplica los parches optimistas a las matches del summary (no toca standings). */
function applyScorePatches(
  summary: GroupStageSummary | null,
  patches: Record<string, GroupScorePatch>,
): GroupStageSummary | null {
  if (!summary || Object.keys(patches).length === 0) return summary;
  return {
    ...summary,
    groups: summary.groups.map((g) => ({
      ...g,
      matches: g.matches.map((m) => {
        const p = patches[m.id];
        if (!p) return m;
        return {
          ...m,
          ...(p.score !== undefined ? { score: p.score } : {}),
          ...(p.winnerSide !== undefined ? { winnerSide: p.winnerSide } : {}),
          status: p.status,
        };
      }),
    })),
  };
}

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
  playerOpsEnabled?: boolean;
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

function isMatchConfirmed(status: string): boolean {
  return status === "confirmed";
}

function isMatchAwaitingConfirm(status: string): boolean {
  return status === "reported";
}

function isMatchPendingPlay(status: string): boolean {
  return !isMatchConfirmed(status) && !isMatchAwaitingConfirm(status);
}

function isMatchScored(status: string): boolean {
  return isMatchConfirmed(status) || isMatchAwaitingConfirm(status);
}

function matchListSortOrder(status: string): number {
  if (isMatchPendingPlay(status)) return 0;
  if (isMatchAwaitingConfirm(status)) return 1;
  return 2;
}

function sortGroupMatches<T extends { status: string; matchNo: number }>(matches: T[]): T[] {
  return [...matches].sort(
    (a, b) =>
      matchListSortOrder(a.status) - matchListSortOrder(b.status) || a.matchNo - b.matchNo,
  );
}

export function GroupStagePanel({
  tournamentId,
  categories,
  clubCourts,
  registrationLabels,
  initialCategoryId,
  initial,
  playerOpsEnabled = false,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  // Latencia del marcador: optimismo per-match + guard per-match (no un `busy`
  // global que descarta taps) + ventana para ignorar el eco de realtime propio.
  const [scoreOptimistic, setScoreOptimistic] = useState<Record<string, GroupScorePatch>>({});
  const [savingScoreIds, setSavingScoreIds] = useState<Set<string>>(() => new Set());
  const skipRealtimeUntil = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [walkoverTarget, setWalkoverTarget] = useState<{
    matchId: string;
    teamA: string;
    teamB: string;
  } | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("groups");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    initialCategoryId ?? categories[0]?.id ?? null,
  );
  const [summary, setSummary] = useState<GroupStageSummary | null>(
    initial && initial.categoryId === (initialCategoryId ?? categories[0]?.id) ? initial : null,
  );
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [manualAcceptedIds, setManualAcceptedIds] = useState<string[] | null>(null);
  const [lateReg, setLateReg] = useState("");
  const [lateGroupId, setLateGroupId] = useState("");

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

  const reloadAccepted = useCallback(
    async (categoryId: string) => {
      const res = await listCategoryAcceptedRegistrationIds({ tournamentId, categoryId });
      if (res.ok) setManualAcceptedIds(res.data.registrationIds);
    },
    [tournamentId],
  );

  // Reconciliación DEBOUNCED: una ráfaga de confirmaciones (o de ecos de
  // realtime) colapsa en un solo refetch. La comparte el éxito de la acción y
  // el realtime onChange, así no se refetchea dos veces por marcador.
  const scheduleReload = useCallback(() => {
    if (!activeCategoryId) return;
    const cid = activeCategoryId;
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      void reloadSummary(cid);
      void reloadAccepted(cid);
    }, REALTIME_DEBOUNCE.LIVE);
  }, [activeCategoryId, reloadSummary, reloadAccepted]);

  useEffect(
    () => () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    },
    [],
  );

  // Limpia el parche optimista cuando el server ya refleja el mismo estado.
  useEffect(() => {
    if (!summary) return;
    setScoreOptimistic((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const statusById = new Map<string, string>();
      for (const g of summary.groups) for (const m of g.matches) statusById.set(m.id, m.status);
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        const serverStatus = statusById.get(id);
        if (serverStatus !== undefined && serverStatus === prev[id].status) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [summary]);

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
          { table: "tournament_group_matches", filter: `tournament_id=eq.${tournamentId}` },
          { table: "tournament_groups", filter: `category_id=eq.${activeCategoryId}` },
          { table: "tournament_categories", filter: `id=eq.${activeCategoryId}` },
          // Ingreso tardío (Opción B): un walk-in aceptado debe aparecer en vivo.
          { table: "registrations", filter: `tournament_id=eq.${tournamentId}` },
        ]
      : [],
    {
      enabled: !!activeCategoryId,
      onChange: () => {
        if (!activeCategoryId) return;
        // Ignora el eco de nuestra propia escritura (ya mostramos el optimista);
        // los cambios de otros (otro monitor, otra pantalla) sí reconcilian.
        if (Date.now() < skipRealtimeUntil.current) return;
        scheduleReload();
      },
    },
  );

  const stage = summary?.stage ?? "pending_groups";
  const mergedSummary = useMemo(
    () => applyScorePatches(summary, scoreOptimistic),
    [summary, scoreOptimistic],
  );
  const groups = mergedSummary?.groups ?? [];
  const acceptedCount = summary?.acceptedCount ?? 0;
  const drawMode: "auto" | "manual" =
    summary?.config.drawMode === "manual" ? "manual" : "auto";
  // Ingreso tardío (Opción B): aceptadas que aún no están en ningún grupo.
  const assignedRegIds = new Set(
    groups.flatMap((g) => g.standings.map((s) => s.registrationId)),
  );
  const unassignedLate = (manualAcceptedIds ?? []).filter((id) => !assignedRegIds.has(id));

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
    setViewMode("groups");
  }, [activeCategoryId]);

  // Inscripciones aceptadas de la categoría: para el sorteo manual (Opción A,
  // en pending_groups) y para el ingreso tardío (Opción B, en group_stage).
  useEffect(() => {
    const needsAccepted =
      (stage === "pending_groups" && drawMode === "manual") || stage === "group_stage";
    if (!needsAccepted || !activeCategoryId) {
      setManualAcceptedIds(null);
      return;
    }
    let cancelled = false;
    setManualAcceptedIds(null);
    void listCategoryAcceptedRegistrationIds({ tournamentId, categoryId: activeCategoryId }).then(
      (res) => {
        if (cancelled) return;
        if (res.ok) setManualAcceptedIds(res.data.registrationIds);
        else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [stage, drawMode, activeCategoryId, tournamentId, toast]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0] ?? null;
  const teamsPerGroup =
    summary && summary.config.groupsCount > 0
      ? Math.floor(acceptedCount / summary.config.groupsCount)
      : 0;

  const selectedPlayCount = selectedGroup
    ? selectedGroup.matches.filter((m) => isMatchPendingPlay(m.status)).length
    : 0;
  const selectedAwaitingCount = selectedGroup
    ? selectedGroup.matches.filter((m) => isMatchAwaitingConfirm(m.status)).length
    : 0;
  const selectedConfirmedCount = selectedGroup
    ? selectedGroup.matches.filter((m) => isMatchConfirmed(m.status)).length
    : 0;
  const selectedTotalCount = selectedGroup?.matches.length ?? 0;

  const displayedMatches = useMemo(() => {
    if (!selectedGroup) return [];
    return sortGroupMatches(selectedGroup.matches);
  }, [selectedGroup]);

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
            durationMs:
              key === "report" || key === "correct" || key === "confirm"
                ? TOAST_SCORE_MS
                : undefined,
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

  const onDraw = async () => {
    if (!summary || !activeCategoryId) return;
    if (selectedCourts.length === 0 && clubCourts.length > 0) {
      toast({
        icon: "alert-triangle",
        title: "Configura canchas",
        sub: "Selecciona las canchas activas y guarda la programación antes del sorteo.",
      });
      return;
    }
    const ok = await confirm({
      title: "Sortear grupos",
      body: "Se generan grupos y calendario. El formato competitivo quedará bloqueado. ¿Continuar?",
      confirmLabel: "Sortear",
    });
    if (!ok) return;
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

  const onManualCreate = (
    assignments: Array<{ groupIndex: number; registrationIds: string[] }>,
  ) => {
    if (!activeCategoryId) return;
    wrap(
      "manual",
      () => assignGroupsManually({ tournamentId, categoryId: activeCategoryId, assignments }),
      "Grupos creados y calendario generado",
    );
  };

  const onAddLate = () => {
    if (!lateReg || !lateGroupId) return;
    wrap(
      "late",
      () => addLateEntryToGroup({ tournamentId, groupId: lateGroupId, registrationId: lateReg }),
      "Pareja agregada al grupo",
      () => setLateReg(""),
    );
  };

  const closeReadiness = useMemo(() => {
    // Sobre datos del server (raw), NO optimistas: "Cerrar grupos" solo se
    // habilita cuando el server confirmó de verdad todos los partidos.
    const rawGroups = summary?.groups ?? [];
    if (rawGroups.length === 0) return { canClose: false, confirmed: 0, expected: 0, awaiting: 0, pending: 0 };
    let confirmed = 0;
    let expected = 0;
    let awaiting = 0;
    let pending = 0;
    for (const g of rawGroups) {
      expected += (g.members.length * (g.members.length - 1)) / 2;
      for (const m of g.matches) {
        if (isMatchConfirmed(m.status)) confirmed++;
        else if (isMatchAwaitingConfirm(m.status)) awaiting++;
        else pending++;
      }
    }
    return {
      canClose: expected > 0 && confirmed === expected,
      confirmed,
      expected,
      awaiting,
      pending,
    };
  }, [summary]);

  const onCloseGroups = async () => {
    if (!closeReadiness.canClose) {
      toast({
        icon: "alert-triangle",
        title: "Faltan confirmaciones",
        sub: `${closeReadiness.confirmed}/${closeReadiness.expected} partidos confirmados. Reporta, confirma y vuelve a intentar.`,
      });
      return;
    }
    const ok = await confirm({
      title: "Cerrar fase de grupos",
      body: "Se calculan clasificados y wildcards con los marcadores confirmados. ¿Continuar?",
      confirmLabel: "Cerrar grupos",
    });
    if (!ok) return;
    wrap(
      "close",
      () =>
        closeGroupStage({
          tournamentId,
          categoryId: summary!.categoryId,
        }),
      "Fase de grupos cerrada",
    );
  };

  const onKnockout = async () => {
    const ok = await confirm({
      title: "Generar cuadro final",
      body: "Se crea la llave eliminatoria con los clasificados. Revisa la config de mejores terceros y bronce antes de continuar.",
      confirmLabel: "Generar llave",
    });
    if (!ok) return;
    wrap(
      "ko",
      () =>
        generateKnockoutFromGroups({
          tournamentId,
          categoryId: summary!.categoryId,
        }),
      "Cuadro final generado",
    );
  };

  const onResetDraw = async () => {
    if (!summary) return;
    const ok = await confirm({
      title: "Reiniciar sorteo",
      body: "Se eliminarán todos los grupos y partidos de esta categoría. La categoría vuelve a 'Por sortear'. Esta acción no es posible si hay partidos con resultado.",
      confirmLabel: "Reiniciar",
    });
    if (!ok) return;
    wrap(
      "reset",
      () =>
        resetGroupDraw({
          tournamentId,
          categoryId: summary.categoryId,
        }),
      "Sorteo reiniciado",
    );
  };

  const onScoreSubmit = (matchId: string, setsA: number, setsB: number) => {
    if (savingScoreIds.has(matchId)) return;
    const winnerSide: "a" | "b" = setsA > setsB ? "a" : "b";
    let isCorrection = false;
    for (const g of groups) {
      const m = g.matches.find((x) => x.id === matchId);
      if (m) {
        isCorrection = isMatchScored(m.status);
        break;
      }
    }
    const score = { sets: [{ a: setsA, b: setsB }] };
    // Optimista: se ve al instante; el server reconcilia por scheduleReload.
    setScoreOptimistic((prev) => ({ ...prev, [matchId]: { score, winnerSide, status: "reported" } }));
    setSavingScoreIds((prev) => new Set(prev).add(matchId));
    skipRealtimeUntil.current = Date.now() + 2500;
    startTx(async () => {
      try {
        const res = isCorrection
          ? await correctGroupMatch({ tournamentId, matchId, winnerSide, score })
          : await reportGroupMatch({ tournamentId, matchId, winnerSide, score });
        if (res.ok) {
          toast({
            icon: "check",
            title: isCorrection ? "Marcador corregido" : "Resultado registrado",
            durationMs: TOAST_SCORE_MS,
          });
          scheduleReload();
        } else {
          setScoreOptimistic((prev) => {
            const next = { ...prev };
            delete next[matchId];
            return next;
          });
          toast({ icon: "alert-triangle", title: "No se pudo", sub: res.error.message, tone: "error" });
        }
      } finally {
        setSavingScoreIds((prev) => {
          const next = new Set(prev);
          next.delete(matchId);
          return next;
        });
      }
    });
  };

  const onConfirmMatch = (matchId: string) => {
    if (savingScoreIds.has(matchId)) return;
    setScoreOptimistic((prev) => ({ ...prev, [matchId]: { status: "confirmed" } }));
    setSavingScoreIds((prev) => new Set(prev).add(matchId));
    skipRealtimeUntil.current = Date.now() + 2500;
    startTx(async () => {
      try {
        const res = await confirmGroupMatch({ tournamentId, matchId });
        if (res.ok) {
          toast({ icon: "check", title: "Resultado confirmado", durationMs: TOAST_SCORE_MS });
          scheduleReload();
        } else {
          setScoreOptimistic((prev) => {
            const next = { ...prev };
            delete next[matchId];
            return next;
          });
          toast({ icon: "alert-triangle", title: "No se pudo", sub: res.error.message, tone: "error" });
        }
      } finally {
        setSavingScoreIds((prev) => {
          const next = new Set(prev);
          next.delete(matchId);
          return next;
        });
      }
    });
  };

  const schedulePendingPlayCount = useMemo(
    () =>
      groups.reduce(
        (n, g) => n + g.matches.filter((m) => isMatchPendingPlay(m.status)).length,
        0,
      ),
    [groups],
  );
  const scheduleAwaitingCount = useMemo(
    () =>
      groups.reduce(
        (n, g) => n + g.matches.filter((m) => isMatchAwaitingConfirm(m.status)).length,
        0,
      ),
    [groups],
  );
  const scheduleTotalCount = useMemo(
    () => groups.reduce((n, g) => n + g.matches.length, 0),
    [groups],
  );

  if (categories.length === 0) {
    return (
      <div className="card mp-grp-panel">
        <div className="label-mp">Fase de grupos</div>
        <p className="mp-grp-empty">Crea una categoría con config de grupos para este torneo.</p>
      </div>
    );
  }

  const canEditScores = stage === "group_stage";
  const showScheduling = stage === "pending_groups" || stage === "group_stage";

  return (
    <>
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
              {stage === "pending_groups" && drawMode === "auto" && (
                <ActionBtn
                  icon="shuffle"
                  label="Sortear grupos"
                  onClick={onDraw}
                  loading={busy === "draw"}
                  disabled={acceptedCount < summary.config.groupsCount}
                  primary
                />
              )}
              {stage === "group_stage" && closeReadiness.confirmed === 0 && (
                <ActionBtn
                  icon="rotate-ccw"
                  label="Reiniciar sorteo"
                  onClick={onResetDraw}
                  loading={busy === "reset"}
                  title="Solo disponible si no hay resultados confirmados"
                />
              )}
              {stage === "group_stage" && (
                <ActionBtn
                  icon="lock"
                  label="Cerrar fase de grupos"
                  onClick={onCloseGroups}
                  loading={busy === "close"}
                  disabled={!closeReadiness.canClose}
                  title={
                    closeReadiness.canClose
                      ? undefined
                      : `${closeReadiness.confirmed}/${closeReadiness.expected} confirmados`
                  }
                  primary
                />
              )}
              {stage === "knockout" && (
                <Link href="/dashboard/partner/p-brackets" className="btn btn-primary mp-grp-link-btn">
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

          {stage === "group_stage" && !closeReadiness.canClose && closeReadiness.expected > 0 && (
            <p className="mp-grp-alert">
              Para cerrar grupos necesitas{" "}
              <b>
                {closeReadiness.confirmed}/{closeReadiness.expected}
              </b>{" "}
              partidos confirmados
              {closeReadiness.awaiting > 0
                ? ` (${closeReadiness.awaiting} reportados sin confirmar)`
                : closeReadiness.pending > 0
                  ? ` (${closeReadiness.pending} por jugar)`
                  : ""}
              . La tabla solo cuenta confirmados.
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

          {stage === "pending_groups" &&
            drawMode === "manual" &&
            (manualAcceptedIds === null ? (
              <p className="mp-grp-empty">Cargando inscripciones…</p>
            ) : (
              <ManualGroupDraw
                key={manualAcceptedIds.join(",")}
                groupsCount={summary.config.groupsCount}
                advancePerGroup={summary.config.advancePerGroup}
                acceptedIds={manualAcceptedIds}
                registrationLabels={registrationLabels}
                busy={busy === "manual"}
                onCreate={onManualCreate}
              />
            ))}

          {stage === "group_stage" && unassignedLate.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <div className="label-mp">Agregar pareja tarde</div>
              <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.5 }}>
                {unassignedLate.length} inscripción(es) aceptada(s) sin grupo. Al agregar, se le
                crean sus partidos contra todos los del grupo (los ya jugados no se tocan).
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <select
                  value={lateReg}
                  onChange={(e) => setLateReg(e.target.value)}
                  style={{
                    flex: "1 1 200px",
                    padding: "9px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#0a0a0a",
                  }}
                >
                  <option value="">Elige la pareja…</option>
                  {unassignedLate.map((id) => (
                    <option key={id} value={id}>
                      {registrationLabels[id] ?? "Equipo sin nombre"}
                    </option>
                  ))}
                </select>
                <select
                  value={lateGroupId}
                  onChange={(e) => setLateGroupId(e.target.value)}
                  style={{
                    flex: "1 1 140px",
                    padding: "9px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#0a0a0a",
                  }}
                >
                  <option value="">Elige el grupo…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      Grupo {g.name} ({g.standings.length})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onAddLate}
                  disabled={!lateReg || !lateGroupId || busy === "late"}
                >
                  {busy === "late" ? "Agregando…" : "Agregar al grupo"}
                </button>
              </div>
            </div>
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
                <p className="mp-grp-schedule-summary">
                  {schedulePendingPlayCount} por jugar
                  {scheduleAwaitingCount > 0 ? ` · ${scheduleAwaitingCount} por confirmar` : ""}
                  {scheduleTotalCount - schedulePendingPlayCount - scheduleAwaitingCount > 0
                    ? ` · ${scheduleTotalCount - schedulePendingPlayCount - scheduleAwaitingCount} confirmados`
                    : ""}
                </p>
              )}
            </div>
          )}

          {groups.length > 0 && viewMode === "schedule" && (
            <GroupStageScheduleView
              summary={mergedSummary ?? summary}
              registrationLabels={registrationLabels}
              canEditScores={canEditScores}
              savingIds={savingScoreIds}
              onScoreSubmit={onScoreSubmit}
              onConfirmMatch={onConfirmMatch}
            />
          )}

          {groups.length > 0 && viewMode === "groups" && (
            <div className="mp-grp-panel-body">
              <div className="mp-grp-group-strip-wrap">
                <div className="label-mp mp-grp-group-strip-label">Grupos</div>
                <div className="mp-grp-group-strip" role="tablist" aria-label="Grupos">
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
              </div>

              {selectedGroup && (
                <div className="mp-grp-detail">
                  <div className="mp-grp-detail-grid">
                    <section className="mp-grp-standings-section" aria-label="Posiciones del grupo">
                      <div className="label-mp mp-grp-standings-section-label">
                        Posiciones ·{" "}
                        <span className="mp-grp-matches-group-tag">{selectedGroup.name}</span>
                      </div>
                      <GroupStandingsTable
                        group={selectedGroup}
                        advancePerGroup={summary.config.advancePerGroup}
                        registrationLabels={registrationLabels}
                        narrow
                      />
                    </section>

                    <section className="mp-grp-matches-section">
                      <div className="mp-grp-matches-pane">
                        <div className="mp-grp-matches-head">
                          <div>
                            <div className="label-mp">
                              Partidos ·{" "}
                              <span className="mp-grp-matches-group-tag">{selectedGroup.name}</span>
                            </div>
                            <p className="mp-grp-matches-sub">
                              {selectedGroup.standings.length} equipos
                              {selectedTotalCount > 0 && (
                                <>
                                  {" · "}
                                  {selectedPlayCount} por jugar
                                  {selectedAwaitingCount > 0
                                    ? ` · ${selectedAwaitingCount} por confirmar`
                                    : ""}
                                  {selectedConfirmedCount > 0
                                    ? ` · ${selectedConfirmedCount} confirmados`
                                    : ""}
                                </>
                              )}
                              {canEditScores && selectedTotalCount > 0 && (
                                <span className="mp-grp-matches-sub-legend" aria-hidden>
                                  {" · "}
                                  <span className="mp-grp-legend-inline is-pending">Por jugar</span>
                                  {" · "}
                                  <span className="mp-grp-legend-inline is-awaiting">
                                    Por confirmar
                                  </span>
                                  {" · "}
                                  <span className="mp-grp-legend-inline is-done">Confirmado</span>
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div key={selectedGroup.id} className="mp-grp-matches-switch">
                          <GroupMatchesPane
                            matches={displayedMatches}
                            totalCount={selectedTotalCount}
                            registrationLabels={registrationLabels}
                            canEditScores={canEditScores}
                            savingIds={savingScoreIds}
                            onScoreSubmit={onScoreSubmit}
                            onConfirmMatch={onConfirmMatch}
                            playerOpsEnabled={playerOpsEnabled}
                            onDeclareWalkover={(matchId, teamA, teamB) =>
                              setWalkoverTarget({ matchId, teamA, teamB })
                            }
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>

    {walkoverTarget && (
      <DeclareWalkoverModal
        open
        onClose={() => setWalkoverTarget(null)}
        matchId={walkoverTarget.matchId}
        matchType="group"
        teamA={walkoverTarget.teamA}
        teamB={walkoverTarget.teamB}
        tournamentId={tournamentId}
        onSuccess={() => { setWalkoverTarget(null); if (activeCategoryId) reloadSummary(activeCategoryId); }}
      />
    )}
    </>
  );
}

function GroupStandingsTable({
  group,
  advancePerGroup,
  registrationLabels,
  compact = false,
  narrow = false,
}: {
  group: GroupRow;
  advancePerGroup: number;
  registrationLabels: Record<string, string>;
  compact?: boolean;
  narrow?: boolean;
}) {
  return (
    <div
      className={`mp-grp-standings${compact ? " mp-grp-standings--compact" : ""}${
        narrow ? " mp-grp-standings--narrow" : ""
      }`}
    >
      {!narrow ? (
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
      ) : (
        <div className="mp-grp-standings-head mp-grp-standings-head--narrow">
          <span>#</span>
          <span>Equipo</span>
          <span className="mp-grp-standings-head-advance">Avanzan {advancePerGroup}</span>
        </div>
      )}
      {group.standings.map((row) => {
        const showCutoff =
          row.rank === advancePerGroup &&
          group.standings.some((r) => r.rank === advancePerGroup + 1);
        const teamName = registrationLabels[row.registrationId] ?? "Equipo sin nombre";
        const isAfterCutoff = narrow && row.rank === advancePerGroup + 1;
        const advances = row.rank <= advancePerGroup;
        return (
          <Fragment key={row.registrationId}>
            <div className={`mp-grp-standing-row${isAfterCutoff ? " is-after-cutoff" : ""}`}>
              <span className="mp-grp-standing-rank">{row.rank}</span>
              {narrow ? (
                <>
                  <div className="mp-grp-standing-body">
                    <span className="mp-grp-standing-name" title={teamName}>
                      {teamName}
                    </span>
                    <span className="mp-grp-standing-record" aria-label="Victorias, derrotas y sets">
                      {row.wins}G · {row.losses}P · {row.setsWon}-{row.setsLost} sets
                    </span>
                  </div>
                  <span
                    className={`mp-grp-standing-advance${advances ? " is-on" : ""}`}
                    aria-label={advances ? "Clasifica" : undefined}
                    aria-hidden={!advances}
                  >
                    {advances ? <Icon name="arrow-up" size={12} /> : null}
                  </span>
                </>
              ) : (
                <>
                  <span className="mp-grp-standing-name" title={teamName}>
                    {teamName}
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
                </>
              )}
            </div>
            {showCutoff && !narrow && (
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
  registrationLabels,
  onSelect,
}: {
  group: GroupRow;
  active: boolean;
  advancePerGroup: number;
  registrationLabels: Record<string, string>;
  onSelect: () => void;
}) {
  const pendingPlayCount = group.matches.filter((m) => isMatchPendingPlay(m.status)).length;
  const awaitingCount = group.matches.filter((m) => isMatchAwaitingConfirm(m.status)).length;
  const confirmedCount = group.matches.filter((m) => isMatchConfirmed(m.status)).length;
  const leader = group.standings[0];
  const leaderLabel = leader
    ? (registrationLabels[leader.registrationId] ?? "—").split(" ")[0]
    : null;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`mp-grp-group-chip${active ? " is-active" : ""}`}
      onClick={onSelect}
    >
      <span className="mp-grp-group-chip-letter" aria-hidden>
        {group.name}
      </span>
      <span className="mp-grp-group-chip-body">
        <span className="mp-grp-group-chip-title">Grupo {group.name}</span>
        {group.matches.length > 0 && (
          <span className="mp-grp-group-chip-meta">
            {confirmedCount}/{group.matches.length}
            {leaderLabel ? ` · ${leaderLabel}` : ""}
          </span>
        )}
      </span>
      {awaitingCount > 0 ? (
        <span className="mp-grp-group-chip-badge is-confirm">{awaitingCount}</span>
      ) : pendingPlayCount > 0 ? (
        <span className="mp-grp-group-chip-badge">{pendingPlayCount}</span>
      ) : null}
    </button>
  );
}

function GroupMatchesPane({
  matches,
  totalCount,
  registrationLabels,
  canEditScores,
  savingIds,
  onScoreSubmit,
  onConfirmMatch,
  playerOpsEnabled = false,
  onDeclareWalkover,
}: {
  matches: GroupRow["matches"];
  totalCount: number;
  registrationLabels: Record<string, string>;
  canEditScores: boolean;
  savingIds: Set<string>;
  onScoreSubmit: (matchId: string, setsA: number, setsB: number) => void;
  onConfirmMatch: (matchId: string) => void;
  playerOpsEnabled?: boolean;
  onDeclareWalkover?: (matchId: string, teamA: string, teamB: string) => void;
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

  return (
    <div className="mp-grp-rounds">
      {rounds.map(([roundNo, roundMatches]) => (
        <div key={roundNo} className="mp-grp-round">
          <div className="mp-grp-round-label">Fecha {roundNo}</div>
          <div className="mp-grp-round-grid">
            {roundMatches.map((m) => {
              const pending = isMatchPendingPlay(m.status);
              const awaiting = isMatchAwaitingConfirm(m.status);
              const confirmed = isMatchConfirmed(m.status);
              const isWalkover = m.status === "walkover";
              const labelA = registrationLabels[m.sideARegistrationId] ?? "Equipo A";
              const labelB = registrationLabels[m.sideBRegistrationId] ?? "Equipo B";
              return (
                <div key={m.id} style={{ position: "relative" }}>
                  <ScoreMatchCard
                    matchId={m.id}
                    labelA={labelA}
                    labelB={labelB}
                    scoreA={parseSetsWon(m.score, "a")}
                    scoreB={parseSetsWon(m.score, "b")}
                    winnerSide={m.winnerSide === "a" || m.winnerSide === "b" ? m.winnerSide : null}
                    editable={canEditScores && pending}
                    correctable={canEditScores && (awaiting || confirmed)}
                    confirmable={canEditScores && awaiting}
                    onConfirm={() => onConfirmMatch(m.id)}
                    busy={savingIds.has(m.id)}
                    dimmed={confirmed || isWalkover}
                    meta={isWalkover ? `W/O · Partido ${m.matchNo}` : `Partido ${m.matchNo}`}
                    onScoreSubmit={onScoreSubmit}
                  />
                  {playerOpsEnabled && pending && onDeclareWalkover && (
                    <button
                      type="button"
                      onClick={() => onDeclareWalkover(m.id, labelA, labelB)}
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid #ef4444",
                        background: "#fff",
                        color: "#ef4444",
                        cursor: "pointer",
                        letterSpacing: "0.04em",
                      }}
                    >
                      W/O
                    </button>
                  )}
                </div>
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
  title,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={primary ? "btn btn-primary mp-grp-action-btn" : "btn mp-grp-action-btn"}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
    >
      <Icon name={icon} size={13} />
      {loading ? "…" : label}
    </button>
  );
}

/**
 * Tablero de asignación manual de grupos (Opción A). Tap-to-assign: cada pareja
 * sin asignar tiene botones con la letra del grupo; las asignadas se quitan con
 * ×. Valida en vivo con el mismo `validateManualGroupAssignment` del server.
 */
function ManualGroupDraw({
  groupsCount,
  advancePerGroup,
  acceptedIds,
  registrationLabels,
  busy,
  onCreate,
}: {
  groupsCount: number;
  advancePerGroup: number;
  acceptedIds: string[];
  registrationLabels: Record<string, string>;
  busy: boolean;
  onCreate: (assignments: Array<{ groupIndex: number; registrationIds: string[] }>) => void;
}) {
  const [assign, setAssign] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(acceptedIds.map((id) => [id, null])),
  );

  const groupCols = Array.from({ length: groupsCount }, (_, i) => i);
  const unassigned = acceptedIds.filter((id) => assign[id] == null);
  const bucketOf = (i: number) => acceptedIds.filter((id) => assign[id] === i);
  const assignments = groupCols.map((i) => ({ groupIndex: i, registrationIds: bucketOf(i) }));
  const validationError = validateManualGroupAssignment(assignments, acceptedIds, groupsCount);
  const label = (id: string) => registrationLabels[id] ?? "Equipo sin nombre";

  const setGroup = (id: string, group: number | null) =>
    setAssign((prev) => ({ ...prev, [id]: group }));

  const autofill = () =>
    setAssign((prev) => {
      const next = { ...prev };
      const counts = groupCols.map((i) => acceptedIds.filter((id) => next[id] === i).length);
      for (const id of acceptedIds) {
        if (next[id] != null) continue;
        let min = 0;
        for (let i = 1; i < counts.length; i++) if (counts[i] < counts[min]) min = i;
        next[id] = min;
        counts[min]++;
      }
      return next;
    });

  const clearAll = () => setAssign(Object.fromEntries(acceptedIds.map((id) => [id, null])));

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="label-mp">Asignar grupos a mano</div>
          <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.5 }}>
            {acceptedIds.length} parejas · {groupsCount} grupos · pasan {advancePerGroup} por grupo.
            Toca la letra del grupo para asignar cada pareja.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
            onClick={autofill}
            disabled={busy || unassigned.length === 0}
          >
            Rellenar parejo
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
            onClick={clearAll}
            disabled={busy || unassigned.length === acceptedIds.length}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label-mp" style={{ marginBottom: 6 }}>
          Sin asignar ({unassigned.length})
        </div>
        {unassigned.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            Todas las parejas están en un grupo.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {unassigned.map((id) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "#fff",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#0a0a0a",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={label(id)}
                >
                  {label(id)}
                </span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {groupCols.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setGroup(id, i)}
                      disabled={busy}
                      title={`Mover a Grupo ${groupLabel(i)}`}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#0a0a0a",
                        cursor: busy ? "default" : "pointer",
                      }}
                    >
                      {groupLabel(i)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {groupCols.map((i) => {
          const members = bucketOf(i);
          const short = members.length < 2;
          return (
            <div
              key={i}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 10,
                background: "var(--muted)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 900, color: "#0a0a0a" }}>
                  Grupo {groupLabel(i)}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: short ? "#dc2626" : "var(--muted-fg)",
                  }}
                >
                  {members.length} pareja{members.length === 1 ? "" : "s"}
                </span>
              </div>
              {members.length === 0 ? (
                <p style={{ fontSize: 11, color: "var(--muted-fg)" }}>Vacío</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {members.map((id) => (
                    <div
                      key={id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        padding: "5px 8px",
                        borderRadius: 6,
                        background: "#fff",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: "#0a0a0a",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={label(id)}
                      >
                        {label(id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGroup(id, null)}
                        disabled={busy}
                        aria-label="Quitar del grupo"
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: busy ? "default" : "pointer",
                          color: "var(--muted-fg)",
                          fontSize: 15,
                          lineHeight: 1,
                          padding: 2,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: validationError ? "#dc2626" : "#16a34a" }}>
          {validationError ?? "Todo listo para crear los grupos."}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !!validationError}
          onClick={() => onCreate(assignments)}
        >
          {busy ? "Creando…" : "Crear grupos y calendario"}
        </button>
      </div>
    </div>
  );
}
