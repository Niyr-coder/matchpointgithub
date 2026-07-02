"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  startMatch,
  updateMatchScore,
  submitMatchResult,
  getNextMatchForCourt,
  reportMatchIncident,
  type MonitorContext,
  type MatchType,
  type SetScore,
  type ScoringConfig,
  type MonitorCurrentMatch,
} from "@/server/actions/tournament-monitors";

const INCIDENT_TYPES = [
  { value: "behavior",  label: "Conducta inapropiada" },
  { value: "equipment", label: "Problema de equipamiento" },
  { value: "weather",   label: "Condición climática" },
  { value: "other",     label: "Otro" },
] as const;

type IncidentType = typeof INCIDENT_TYPES[number]["value"];

// ── Tipos locales ────────────────────────────────────────────────────────────

type Phase = "inicio" | "live" | "cierre";

interface LiveState {
  setScores: SetScore[];
  currentA: number;
  currentB: number;
  serving: "a" | "b";
  history: Array<"a" | "b">;
  setsA: number;
  setsB: number;
  startedAt: number;
}

function isSetComplete(a: number, b: number, cfg: ScoringConfig): boolean {
  return (a >= cfg.points || b >= cfg.points) && Math.abs(a - b) >= cfg.winBy;
}

function getWinner(setsA: number, setsB: number, bestOf: number): "a" | "b" | null {
  const needed = Math.ceil(bestOf / 2);
  if (setsA >= needed) return "a";
  if (setsB >= needed) return "b";
  return null;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Componente principal ─────────────────────────────────────────────────────

export function MonitorAppClient({
  context,
  slug,
}: {
  context: MonitorContext;
  slug: string;
}) {
  const toast = useToast();
  const [, startTx] = useTransition();

  const [currentMatch, setCurrentMatch] = useState<MonitorCurrentMatch | null>(context.currentMatch);

  // ── Estado inicial restaurado desde DB ────────────────────────────────────
  const [phase, setPhase] = useState<Phase>(() => {
    if (context.currentMatch?.status === "live") return "live";
    if (context.currentMatch?.status === "reported") return "cierre";
    return "inicio";
  });

  // Check-in state
  const [checkedA, setCheckedA] = useState(() => !!context.currentMatch && (context.currentMatch.status === "live" || context.currentMatch.status === "reported"));
  const [checkedB, setCheckedB] = useState(() => !!context.currentMatch && (context.currentMatch.status === "live" || context.currentMatch.status === "reported"));
  const [servingFirst, setServingFirst] = useState<"a" | "b" | null>(null);
  const [starting, setStarting] = useState(false);

  // Live state — restaurar sets completados, serving y puntos del set en curso desde DB
  const [live, setLive] = useState<LiveState>(() => {
    const m = context.currentMatch;
    if (!m || (m.status !== "live" && m.status !== "reported")) {
      return { setScores: [], currentA: 0, currentB: 0, serving: "a", history: [], setsA: 0, setsB: 0, startedAt: 0 };
    }
    const score = m.score as { sets?: Array<{ a: number; b: number }>; serving?: "a" | "b"; current?: { a: number; b: number } } | null;
    const completedSets: SetScore[] = score?.sets ?? [];
    const setsA = completedSets.filter((s) => s.a > s.b).length;
    const setsB = completedSets.filter((s) => s.b > s.a).length;
    return {
      setScores: completedSets,
      currentA: score?.current?.a ?? 0,
      currentB: score?.current?.b ?? 0,
      serving: score?.serving ?? "a",
      history: [],
      setsA,
      setsB,
      startedAt: m.startedAt ? new Date(m.startedAt).getTime() : Date.now(),
    };
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [timeoutActive, setTimeoutActive] = useState(false);
  const [timeoutSecs, setTimeoutSecs] = useState(60);
  const timeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cierre state
  const [submitted, setSubmitted] = useState(() => context.currentMatch?.status === "reported");
  const [submitting, setSubmitting] = useState(false);

  // Estado para el flujo "siguiente partido"
  const [loadingNext, setLoadingNext] = useState(false);
  const [noMoreMatches, setNoMoreMatches] = useState(false);

  // Estado para el flujo de incidentes
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType>("other");
  const [incidentNotes, setIncidentNotes] = useState("");
  const [submittingIncident, setSubmittingIncident] = useState(false);

  // Bandera para saber si la sesión fue restaurada (no iniciada manualmente)
  const wasRestoredRef = useRef(context.currentMatch?.status === "live" || context.currentMatch?.status === "reported");

  const scoringConfig = currentMatch?.matchScoringConfig ?? context.scoringConfig;

  // ── Reloj de partido (actualiza cada 30s cuando está en vivo) ────────────
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== "live") {
      if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
      return;
    }
    setElapsed(Date.now() - live.startedAt);
    elapsedRef.current = setInterval(() => setElapsed(Date.now() - live.startedAt), 30000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, live.startedAt]);
  const courtLabel = context.courtCode ?? context.courtName ?? "Cancha";
  const teamA = currentMatch?.teamA ?? "Equipo A";
  const teamB = currentMatch?.teamB ?? "Equipo B";

  // ── Persistencia del marcador ──────────────────────────────────────────────
  // Dos capas: (1) localStorage síncrono por punto — sobrevive recarga
  // inmediata en el mismo teléfono; (2) server con debounce de 2s — sobrevive
  // cambio de dispositivo y alimenta el courts-live del partner.

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localKey = useCallback(
    (matchId: string) => `mp:monitor:${matchId}`,
    [],
  );

  const saveLocal = useCallback(
    (matchId: string, state: { setScores: SetScore[]; currentA: number; currentB: number; serving: "a" | "b"; history: Array<"a" | "b"> }) => {
      try {
        localStorage.setItem(
          localKey(matchId),
          JSON.stringify({
            sets: state.setScores.length,
            currentA: state.currentA,
            currentB: state.currentB,
            serving: state.serving,
            history: state.history,
          }),
        );
      } catch {
        // storage lleno o bloqueado — la capa server sigue cubriendo
      }
    },
    [localKey],
  );

  const clearLocal = useCallback(
    (matchId: string) => {
      try {
        localStorage.removeItem(localKey(matchId));
      } catch {
        // ignorar
      }
    },
    [localKey],
  );

  // Set completado: persistir inmediato (sin debounce) y resetear current.
  const persistScore = useCallback(
    (sets: SetScore[], serving: "a" | "b") => {
      if (!currentMatch) return;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      startTx(async () => {
        await updateMatchScore({
          matchId: currentMatch.matchId,
          matchType: currentMatch.matchType as MatchType,
          score: { sets, serving, current: { a: 0, b: 0 } },
          slug,
        });
      });
    },
    [currentMatch, slug],
  );

  // Punto suelto: persistir con debounce para no saturar realtime.
  const persistLivePoints = useCallback(
    (state: { setScores: SetScore[]; currentA: number; currentB: number; serving: "a" | "b" }) => {
      if (!currentMatch) return;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        startTx(async () => {
          await updateMatchScore({
            matchId: currentMatch.matchId,
            matchType: currentMatch.matchType as MatchType,
            score: {
              sets: state.setScores,
              serving: state.serving,
              current: { a: state.currentA, b: state.currentB },
            },
            slug,
          });
        });
      }, 2000);
    },
    [currentMatch, slug],
  );

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // ── Sumar punto ────────────────────────────────────────────────────────────

  const addPoint = useCallback(
    (side: "a" | "b") => {
      setLive((prev) => {
        const newA = side === "a" ? prev.currentA + 1 : prev.currentA;
        const newB = side === "b" ? prev.currentB + 1 : prev.currentB;
        const newHistory: Array<"a" | "b"> = [...prev.history, side];

        if (isSetComplete(newA, newB, scoringConfig)) {
          const completedSet: SetScore = { a: newA, b: newB };
          const newSetScores = [...prev.setScores, completedSet];
          const newSetsA = prev.setsA + (newA > newB ? 1 : 0);
          const newSetsB = prev.setsB + (newB > newA ? 1 : 0);
          const nextServing: "a" | "b" = newA > newB ? "a" : "b";
          persistScore(newSetScores, nextServing);
          if (currentMatch) {
            saveLocal(currentMatch.matchId, { setScores: newSetScores, currentA: 0, currentB: 0, serving: nextServing, history: [] });
          }
          return {
            ...prev,
            setScores: newSetScores,
            currentA: 0,
            currentB: 0,
            history: [],
            setsA: newSetsA,
            setsB: newSetsB,
            serving: nextServing,
          };
        }

        if (currentMatch) {
          saveLocal(currentMatch.matchId, { setScores: prev.setScores, currentA: newA, currentB: newB, serving: prev.serving, history: newHistory });
        }
        persistLivePoints({ setScores: prev.setScores, currentA: newA, currentB: newB, serving: prev.serving });
        return { ...prev, currentA: newA, currentB: newB, history: newHistory };
      });
    },
    [persistScore, persistLivePoints, saveLocal, currentMatch, scoringConfig],
  );

  // ── Deshacer último punto ───────────────────────────────────────────────────

  const undoPoint = useCallback(() => {
    setLive((prev) => {
      // Deshacer dentro del set actual
      if (prev.history.length > 0) {
        const last = prev.history[prev.history.length - 1];
        const next = {
          ...prev,
          currentA: last === "a" ? prev.currentA - 1 : prev.currentA,
          currentB: last === "b" ? prev.currentB - 1 : prev.currentB,
          history: prev.history.slice(0, -1),
        };
        if (currentMatch) {
          saveLocal(currentMatch.matchId, { setScores: next.setScores, currentA: next.currentA, currentB: next.currentB, serving: next.serving, history: next.history });
        }
        persistLivePoints({ setScores: next.setScores, currentA: next.currentA, currentB: next.currentB, serving: next.serving });
        return next;
      }
      // Deshacer el último set completado (cuando el set actual no ha empezado)
      if (prev.setScores.length > 0) {
        const lastSet = prev.setScores[prev.setScores.length - 1];
        const newSetScores = prev.setScores.slice(0, -1);
        const newSetsA = prev.setsA - (lastSet.a > lastSet.b ? 1 : 0);
        const newSetsB = prev.setsB - (lastSet.b > lastSet.a ? 1 : 0);
        const lastWinner: "a" | "b" = lastSet.a > lastSet.b ? "a" : "b";
        const next = {
          ...prev,
          setScores: newSetScores,
          currentA: lastSet.a - (lastWinner === "a" ? 1 : 0),
          currentB: lastSet.b - (lastWinner === "b" ? 1 : 0),
          setsA: newSetsA,
          setsB: newSetsB,
          history: [lastWinner] as Array<"a" | "b">,
        };
        if (currentMatch) {
          saveLocal(currentMatch.matchId, { setScores: next.setScores, currentA: next.currentA, currentB: next.currentB, serving: next.serving, history: next.history });
        }
        persistLivePoints({ setScores: next.setScores, currentA: next.currentA, currentB: next.currentB, serving: next.serving });
        return next;
      }
      return prev;
    });
  }, [currentMatch, saveLocal, persistLivePoints]);

  // ── Restaurar desde localStorage (solo al montar) ──────────────────────────
  // El server ya restauró sets + puntos del set en curso (score.current); el
  // localStorage puede tener hasta 2s más de puntos (debounce) y el history
  // para deshacer. Solo se adopta si corresponde al mismo partido y set.
  useEffect(() => {
    if (!wasRestoredRef.current || !currentMatch || phase !== "live") return;
    try {
      const raw = localStorage.getItem(localKey(currentMatch.matchId));
      if (!raw) return;
      const entry = JSON.parse(raw) as {
        sets?: number;
        currentA?: number;
        currentB?: number;
        serving?: "a" | "b";
        history?: Array<"a" | "b">;
      };
      setLive((prev) => {
        if (entry.sets !== prev.setScores.length) return prev;
        const entryPoints = (entry.currentA ?? 0) + (entry.currentB ?? 0);
        if (entryPoints < prev.currentA + prev.currentB) return prev;
        return {
          ...prev,
          currentA: entry.currentA ?? prev.currentA,
          currentB: entry.currentB ?? prev.currentB,
          serving: entry.serving ?? prev.serving,
          history: entry.history ?? prev.history,
        };
      });
    } catch {
      // entrada corrupta — quedarse con lo del server
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tiempo fuera ───────────────────────────────────────────────────────────

  const startTimeout = () => {
    setSheetOpen(false);
    setTimeoutActive(true);
    setTimeoutSecs(60);
    if (timeoutRef.current) clearInterval(timeoutRef.current);
    timeoutRef.current = setInterval(() => {
      setTimeoutSecs((s) => {
        if (s <= 1) {
          clearInterval(timeoutRef.current!);
          setTimeoutActive(false);
          return 60;
        }
        return s - 1;
      });
    }, 1000);
  };

  // ── Iniciar partido ────────────────────────────────────────────────────────

  const onStartMatch = async () => {
    if (!currentMatch || !servingFirst) return;
    setStarting(true);
    const startedAt = Date.now();
    const res = await startMatch({
      matchId: currentMatch.matchId,
      matchType: currentMatch.matchType as MatchType,
      servingFirst,
      slug,
    });
    setStarting(false);
    if (!res.ok) {
      if (res.error.code === "MONITORS.MATCH_TAKEN") {
        // Otro monitor ganó la carrera por este partido — cargar el siguiente.
        toast({ icon: "alert-triangle", title: "Partido tomado por otra cancha", sub: "Cargando el siguiente partido…", tone: "error" });
        await onNextMatch();
        return;
      }
      toast({ icon: "alert-triangle", title: "Error al iniciar", sub: res.error.message, tone: "error" });
      return;
    }
    wasRestoredRef.current = false;
    clearLocal(currentMatch.matchId);
    setLive({
      setScores: [],
      currentA: 0,
      currentB: 0,
      serving: servingFirst,
      history: [],
      setsA: 0,
      setsB: 0,
      startedAt,
    });
    setPhase("live");
  };

  // ── Enviar resultado ───────────────────────────────────────────────────────

  const onSubmit = async () => {
    if (!currentMatch) return;
    const winner = getWinner(live.setsA, live.setsB, scoringConfig.bestOf);
    if (!winner) return;
    setSubmitting(true);
    // Cancelar cualquier persist debounced pendiente: no debe pisar el score final.
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const durationMs = live.startedAt > 0 ? Math.round(Date.now() - live.startedAt) : undefined;
    const res = await submitMatchResult({
      matchId: currentMatch.matchId,
      matchType: currentMatch.matchType as MatchType,
      score: { sets: live.setScores },
      winnerSide: winner,
      durationMs,
      slug,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error al enviar", sub: res.error.message, tone: "error" });
      return;
    }
    clearLocal(currentMatch.matchId);
    setSubmitted(true);
  };

  // ── Siguiente partido ──────────────────────────────────────────────────────

  const onNextMatch = async () => {
    if (currentMatch) clearLocal(currentMatch.matchId);
    setLoadingNext(true);
    const res = await getNextMatchForCourt({ slug });
    setLoadingNext(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error al cargar siguiente partido", sub: res.error.message, tone: "error" });
      return;
    }
    if (!res.data) {
      setNoMoreMatches(true);
      return;
    }
    setCurrentMatch(res.data);
    setPhase("inicio");
    setCheckedA(false);
    setCheckedB(false);
    setServingFirst(null);
    setSubmitted(false);
    setNoMoreMatches(false);
    setLive({
      setScores: [],
      currentA: 0,
      currentB: 0,
      serving: "a",
      history: [],
      setsA: 0,
      setsB: 0,
      startedAt: 0,
    });
    wasRestoredRef.current = false;
  };

  // ── Banner de estado ───────────────────────────────────────────────────────

  const winner = getWinner(live.setsA, live.setsB, scoringConfig.bestOf);
  const isMatchPoint =
    !winner &&
    (isSetComplete(live.currentA + 1, live.currentB, scoringConfig) ||
      isSetComplete(live.currentA, live.currentB + 1, scoringConfig));

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: INICIO
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === "inicio") {
    const canStart = checkedA && checkedB && servingFirst !== null;
    return (
      <div
        key="inicio"
        className="mp-monitor-phase"
        style={{
          minHeight: "100dvh",
          background: "#000",
          display: "flex",
          flexDirection: "column",
          padding: "0 20px 32px",
          color: "#fff",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 0 10px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#34d399" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#34d399",
                display: "inline-block",
                animation: "mpMonitorPulse 2s infinite",
              }}
            />
            Monitor · {courtLabel}
          </div>
          {currentMatch && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {currentMatch.matchType === "bracket" ? "Bracket" : "Grupos"}
            </div>
          )}
        </div>

        {/* Título */}
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>
            Check-in.
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
            {context.tournamentName}
          </div>
        </div>

        {/* Botones de check-in */}
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
            Confirmar presencia
          </div>
          {[
            { side: "a" as const, name: teamA, checked: checkedA, toggle: () => setCheckedA((v) => !v) },
            { side: "b" as const, name: teamB, checked: checkedB, toggle: () => setCheckedB((v) => !v) },
          ].map(({ side, name, checked, toggle }) => (
            <button
              key={side}
              type="button"
              className="mp-monitor-btn-tap"
              onClick={toggle}
              style={{
                width: "100%",
                padding: "18px 20px",
                borderRadius: 16,
                border: `2px solid ${checked ? "#34d399" : "rgba(255,255,255,0.12)"}`,
                background: checked ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {name}
              <span style={{ fontSize: 20, color: checked ? "#34d399" : "rgba(255,255,255,0.2)" }}>
                {checked ? "✓" : "○"}
              </span>
            </button>
          ))}
        </div>

        {/* Selector de saque */}
        {checkedA && checkedB && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>
              ¿Quién saca primero?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {(["a", "b"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className="mp-monitor-btn-tap"
                  onClick={() => setServingFirst(side)}
                  style={{
                    flex: 1,
                    padding: "14px 12px",
                    borderRadius: 14,
                    border: `2px solid ${servingFirst === side ? "#34d399" : "rgba(255,255,255,0.12)"}`,
                    background: servingFirst === side ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {side === "a" ? teamA : teamB}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Botón iniciar */}
        <div style={{ marginTop: "auto", paddingTop: 32 }}>
          {!currentMatch ? (
            <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "20px 0" }}>
              No hay partido programado en esta cancha.
            </div>
          ) : (
            <button
              type="button"
              className="mp-monitor-btn-tap"
              disabled={!canStart || starting}
              onClick={onStartMatch}
              style={{
                width: "100%",
                padding: "18px 20px",
                borderRadius: 16,
                background: canStart ? "#34d399" : "rgba(255,255,255,0.08)",
                color: canStart ? "#000" : "rgba(255,255,255,0.3)",
                fontSize: 16,
                fontWeight: 800,
                border: "none",
                cursor: canStart ? "pointer" : "default",
              }}
            >
              {starting ? "Iniciando…" : "Iniciar partido"}
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 24 }}>
          Monitor{context.positionLabel ? ` · ${context.positionLabel}` : ""}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: LIVE
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === "live") {
    const servingName = live.serving === "a" ? teamA : teamB;
    const scoreLabel = `${live.setsA} · ${live.setsB}`;

    const winnerBanner = winner ? (
      <div
        className="mp-monitor-banner"
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          transform: "translateY(-50%)",
          zIndex: 10,
          background: "rgba(52,211,153,0.95)",
          color: "#000",
          textAlign: "center",
          padding: "16px 20px",
          fontWeight: 800,
          fontSize: 18,
          pointerEvents: "none",
        }}
      >
        {winner === "a" ? teamA : teamB} gana el partido
      </div>
    ) : isMatchPoint ? (
      <div
        className="mp-monitor-banner"
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          transform: "translateY(-50%)",
          zIndex: 10,
          background: "rgba(251,191,36,0.95)",
          color: "#000",
          textAlign: "center",
          padding: "12px 20px",
          fontWeight: 700,
          fontSize: 15,
          pointerEvents: "none",
        }}
      >
        Match point
      </div>
    ) : null;

    return (
      <div
        key="live"
        className="mp-monitor-phase"
        style={{ minHeight: "100dvh", background: "#000", color: "#fff", display: "flex", flexDirection: "column", position: "relative" }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="mp-monitor-btn-tap"
            onClick={() => setPhase("inicio")}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 22, padding: "4px 8px" }}
          >
            ‹
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            {timeoutActive ? (
              <span style={{ color: "#fbbf24", fontWeight: 700 }}>Tiempo fuera {timeoutSecs}s</span>
            ) : (
              <>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#34d399",
                    display: "inline-block",
                    animation: "mpMonitorPulse 1.2s infinite",
                  }}
                />
                <span style={{ color: "#34d399", fontWeight: 700 }}>En vivo</span>
                {live.startedAt > 0 && (
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{formatDuration(elapsed)}</span>
                )}
              </>
            )}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
            Sets {scoreLabel}
          </div>
        </div>

        {/* Paneles de puntuación */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
          {/* Panel equipo A */}
          <button
            type="button"
            className="mp-monitor-score-panel mp-monitor-btn-tap"
            disabled={!!winner}
            onClick={() => addPoint("a")}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "#fff",
              cursor: winner ? "default" : "pointer",
              padding: "20px 16px",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              {live.serving === "a" && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#34d399",
                    display: "inline-block",
                    animation: "mpMonitorPulse 1.2s infinite",
                  }}
                />
              )}
              <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{teamA}</span>
            </div>
            <div
              style={{
                fontSize: 128,
                fontWeight: 900,
                lineHeight: 1,
                color: live.currentA >= live.currentB ? "#34d399" : "#fff",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {live.currentA}
            </div>
          </button>

          {/* Strip central */}
          <div
            style={{
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              background: "rgba(255,255,255,0.04)",
              flexShrink: 0,
              fontSize: 12,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <span>Saca {servingName}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {live.setScores.map((s, i) => `${s.a}-${s.b}`).join("  ")}
              {live.setScores.length > 0 ? "  " : ""}
              {live.currentA} · {live.currentB}
            </span>
          </div>

          {/* Panel equipo B */}
          <button
            type="button"
            className="mp-monitor-score-panel mp-monitor-btn-tap"
            disabled={!!winner}
            onClick={() => addPoint("b")}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "#fff",
              cursor: winner ? "default" : "pointer",
              padding: "20px 16px",
            }}
          >
            <div
              style={{
                fontSize: 128,
                fontWeight: 900,
                lineHeight: 1,
                color: live.currentB > live.currentA ? "#34d399" : "#fff",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {live.currentB}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              {live.serving === "b" && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#34d399",
                    display: "inline-block",
                    animation: "mpMonitorPulse 1.2s infinite",
                  }}
                />
              )}
              <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{teamB}</span>
            </div>
          </button>

          {/* Banner de match point / ganador */}
          {winnerBanner}

          {/* Aviso de sesión restaurada */}
          {wasRestoredRef.current && !winner && (
            <div style={{ textAlign: "center", fontSize: 11, color: "rgba(52,211,153,0.6)", padding: "4px 0", flexShrink: 0 }}>
              Sesión restaurada · marcador recuperado
            </div>
          )}
        </div>

        {/* Barra inferior */}
        <div
          style={{
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
            gap: 8,
          }}
        >
          <button
            type="button"
            className="mp-monitor-btn-tap"
            onClick={undoPoint}
            disabled={live.history.length === 0 && live.setScores.length === 0}
            style={{
              flex: 1,
              padding: "10px 4px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "none",
              color: (live.history.length === 0 && live.setScores.length === 0) ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
              fontSize: 13,
              fontWeight: 600,
              cursor: (live.history.length === 0 && live.setScores.length === 0) ? "default" : "pointer",
            }}
          >
            Deshacer
          </button>
          <button
            type="button"
            className="mp-monitor-btn-tap"
            onClick={() => setSheetOpen(true)}
            style={{
              flex: 1,
              padding: "10px 4px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "none",
              color: "rgba(255,255,255,0.7)",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ···
          </button>
          <button
            type="button"
            className="mp-monitor-btn-tap"
            disabled={!winner}
            onClick={() => { setPhase("cierre"); }}
            style={{
              flex: 1,
              padding: "10px 4px",
              borderRadius: 12,
              border: `1px solid ${winner ? "#34d399" : "rgba(255,255,255,0.12)"}`,
              background: winner ? "rgba(52,211,153,0.15)" : "none",
              color: winner ? "#34d399" : "rgba(255,255,255,0.3)",
              fontSize: 13,
              fontWeight: 700,
              cursor: winner ? "pointer" : "default",
            }}
          >
            Terminar
          </button>
        </div>

        {/* Bottom sheet */}
        {sheetOpen && (
          <>
            <div className="mp-monitor-sheet-overlay" onClick={() => setSheetOpen(false)} />
            <div className="mp-monitor-sheet">
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.2)",
                  margin: "0 auto 18px",
                }}
              />
              {[
                {
                  label: "Tiempo fuera (60s)",
                  icon: "⏱",
                  action: startTimeout,
                },
                {
                  label: "Cambiar saque",
                  icon: "⇄",
                  action: () => {
                    setLive((p) => ({ ...p, serving: p.serving === "a" ? "b" : "a" }));
                    setSheetOpen(false);
                  },
                },
                {
                  label: "Let · repetir punto",
                  icon: "↩",
                  action: () => {
                    setSheetOpen(false);
                    toast({ icon: "check", title: "Let — se repite el punto" });
                  },
                },
                {
                  label: "Reportar incidente",
                  icon: "⚠",
                  action: () => {
                    setSheetOpen(false);
                    setIncidentType("other");
                    setIncidentNotes("");
                    setIncidentOpen(true);
                  },
                },
              ].map(({ label, icon, action }) => (
                <button
                  key={label}
                  type="button"
                  className="mp-monitor-btn-tap"
                  onClick={action}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 12px",
                    borderRadius: 14,
                    border: "none",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    marginBottom: 8,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{icon}</span>
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="mp-monitor-btn-tap"
                onClick={() => setSheetOpen(false)}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "none",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 14,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {/* Formulario de incidente */}
        {incidentOpen && (
          <>
            <div className="mp-monitor-sheet-overlay" onClick={() => setIncidentOpen(false)} />
            <div className="mp-monitor-sheet">
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 18px" }} />
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Reportar incidente</div>

              {/* Selector de tipo */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {INCIDENT_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className="mp-monitor-btn-tap"
                    onClick={() => setIncidentType(value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `2px solid ${incidentType === value ? "#fbbf24" : "rgba(255,255,255,0.1)"}`,
                      background: incidentType === value ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                      color: incidentType === value ? "#fbbf24" : "rgba(255,255,255,0.7)",
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Notas opcionales */}
              <textarea
                value={incidentNotes}
                onChange={(e) => setIncidentNotes(e.target.value)}
                placeholder="Notas adicionales (opcional)"
                maxLength={500}
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: 13,
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  marginBottom: 14,
                  boxSizing: "border-box",
                }}
              />

              <button
                type="button"
                className="mp-monitor-btn-tap"
                disabled={submittingIncident}
                onClick={async () => {
                  if (!currentMatch || submittingIncident) return;
                  setSubmittingIncident(true);
                  const res = await reportMatchIncident({
                    matchId: currentMatch.matchId,
                    matchType: currentMatch.matchType as MatchType,
                    type: incidentType,
                    notes: incidentNotes.trim() || undefined,
                    slug,
                  });
                  setSubmittingIncident(false);
                  setIncidentOpen(false);
                  if (res.ok) {
                    toast({ icon: "check", title: "Incidente registrado", sub: "El organizador fue notificado." });
                  } else {
                    toast({ icon: "alert-triangle", title: "Error al registrar", sub: res.error.message, tone: "error" });
                  }
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 12,
                  background: submittingIncident ? "rgba(251,191,36,0.3)" : "#fbbf24",
                  border: "none",
                  color: "#000",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: submittingIncident ? "default" : "pointer",
                  marginBottom: 8,
                }}
              >
                {submittingIncident ? "Enviando…" : "Enviar incidente"}
              </button>
              <button
                type="button"
                className="mp-monitor-btn-tap"
                onClick={() => setIncidentOpen(false)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "none",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {/* Pulso CSS (inline keyframe) */}
        <style>{`
          @keyframes mpMonitorPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: CIERRE
  // ─────────────────────────────────────────────────────────────────────────

  const finalWinner = getWinner(live.setsA, live.setsB, scoringConfig.bestOf);
  const winnerName = finalWinner === "a" ? teamA : finalWinner === "b" ? teamB : "—";
  const duration = live.startedAt > 0 ? formatDuration(Date.now() - live.startedAt) : "—";
  const monitorInitials = initials(context.monitorDisplayName);

  return (
    <div
      key="cierre"
      className="mp-monitor-phase"
      style={{
        minHeight: "100dvh",
        background: "#000",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        padding: "0 20px 40px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px 0 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          gap: 12,
        }}
      >
        {!submitted && (
          <button
            type="button"
            className="mp-monitor-btn-tap"
            onClick={() => setPhase("live")}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 22, padding: "4px 8px" }}
          >
            ‹
          </button>
        )}
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Cierre del partido</div>
      </div>

      {submitted ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ fontSize: 56, color: "#34d399" }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Resultado enviado</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
            El organizador recibirá el resultado para su aprobación.
          </div>
          {noMoreMatches ? (
            <div style={{ textAlign: "center", fontSize: 14, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>
              Sin partidos pendientes. Espera al organizador.
            </div>
          ) : (
            <button
              type="button"
              className="mp-monitor-btn-tap"
              onClick={onNextMatch}
              disabled={loadingNext}
              style={{
                padding: "16px 32px",
                borderRadius: 14,
                background: "rgba(52,211,153,0.15)",
                border: "1px solid #34d399",
                color: "#34d399",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                marginTop: 8,
              }}
            >
              {loadingNext ? "Cargando…" : "Siguiente partido →"}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Ganador */}
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
              Ganador
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#34d399" }}>{winnerName}</div>
          </div>

          {/* Sets */}
          <div
            style={{
              marginTop: 24,
              padding: 20,
              borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
              Sets
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {live.setScores.map((s, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    color: s.a > s.b ? "#34d399" : s.b > s.a ? "rgba(255,255,255,0.5)" : "#fff",
                  }}
                >
                  {s.a}-{s.b}
                </div>
              ))}
              <div
                style={{
                  marginLeft: "auto",
                  padding: "4px 12px",
                  borderRadius: 20,
                  background: "rgba(52,211,153,0.15)",
                  color: "#34d399",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {live.setsA}-{live.setsB}
              </div>
            </div>
          </div>

          {/* Duración y MVP */}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <div
              style={{
                flex: 1,
                padding: 16,
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>
                Duración
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{duration}</div>
            </div>
            <div
              style={{
                flex: 1,
                padding: 16,
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>
                MVP
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399" }}>{winnerName}</div>
            </div>
          </div>

          {/* Firma del monitor */}
          <div
            style={{
              marginTop: 12,
              padding: 16,
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "rgba(52,211,153,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 14,
                color: "#34d399",
                flexShrink: 0,
              }}
            >
              {monitorInitials}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Monitor</div>
              {context.positionLabel && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{context.positionLabel}</div>
              )}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{courtLabel}</div>
            </div>
          </div>

          {/* Botón enviar */}
          <div style={{ marginTop: "auto", paddingTop: 32 }}>
            <button
              type="button"
              className="mp-monitor-btn-tap"
              disabled={submitting || !finalWinner}
              onClick={onSubmit}
              style={{
                width: "100%",
                padding: "18px 20px",
                borderRadius: 16,
                background: finalWinner ? "#34d399" : "rgba(255,255,255,0.08)",
                color: finalWinner ? "#000" : "rgba(255,255,255,0.3)",
                fontSize: 16,
                fontWeight: 800,
                border: "none",
                cursor: finalWinner ? "pointer" : "default",
              }}
            >
              {submitting ? "Enviando…" : "Confirmar y enviar al organizador"}
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes mpMonitorPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
