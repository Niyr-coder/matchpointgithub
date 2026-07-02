"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ScoreMatchCard } from "@/components/dashboard/brackets/ScoreMatchCard";
import { useToast, TOAST_SCORE_MS } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import {
  generateRoundRobinSchedule,
  reportLigaMatch,
  correctLigaMatch,
  closeLigaStage,
} from "@/server/actions/tournament-liga";
import type { LigaData, LigaMatchRow } from "@/server/actions/tournament-liga";
import type { GroupStandingRow } from "@/lib/tournaments/group-stage";

type Props = {
  tournamentId: string;
  categoryId: string;
  categoryName: string;
  tournamentFormat: string;
  registrationLabels: Record<string, string>;
  initialData: LigaData;
};

function label(registrationLabels: Record<string, string>, regId: string): string {
  return registrationLabels[regId] ?? "—";
}

function setScoreDisplay(match: LigaMatchRow): { a: number | null; b: number | null } {
  const sets = (match.score as { sets?: Array<{ a: number; b: number }> } | null)?.sets;
  if (!sets?.length) return { a: null, b: null };
  return { a: sets[0].a, b: sets[0].b };
}

// ---------------------------------------------------------------------------
// Standings table
// ---------------------------------------------------------------------------
function StandingsTable({
  standings,
  registrationLabels,
}: {
  standings: GroupStandingRow[];
  registrationLabels: Record<string, string>;
}) {
  if (standings.length === 0) return null;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="bar-chart-2" size={14} />
        <span className="label-mp" style={{ margin: 0 }}>
          Tabla de posiciones
        </span>
      </div>
      <div style={{ overflowX: "auto", overscrollBehavior: "contain" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "var(--subtle-bg)", color: "var(--muted-fg)" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>#</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>Equipo</th>
              <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700 }}>PJ</th>
              <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700 }}>G</th>
              <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700 }}>P</th>
              <th
                style={{
                  padding: "8px 12px",
                  textAlign: "center",
                  fontWeight: 700,
                }}
              >
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => (
              <tr
                key={row.registrationId}
                style={{
                  borderTop: "1px solid var(--border)",
                  background: i % 2 === 0 ? "transparent" : "var(--subtle-bg)",
                }}
              >
                <td
                  style={{
                    padding: "10px 12px",
                    fontWeight: 900,
                    color: row.rank === 1 ? "var(--primary)" : "var(--muted-fg)",
                  }}
                >
                  {row.rank}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                  {label(registrationLabels, row.registrationId)}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>{row.played}</td>
                <td style={{ padding: "10px 12px", textAlign: "center", color: "#16a34a", fontWeight: 700 }}>
                  {row.wins}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", color: "#dc2626" }}>
                  {row.losses}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 900 }}>
                  {row.wins * 3}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round section
// ---------------------------------------------------------------------------
function RoundSection({
  roundNo,
  totalRounds,
  matches,
  registrationLabels,
  busy,
  readOnly,
  onScore,
}: {
  roundNo: number;
  totalRounds: number;
  matches: LigaMatchRow[];
  registrationLabels: Record<string, string>;
  busy: boolean;
  readOnly: boolean;
  onScore: (matchId: string, setsA: number, setsB: number) => void;
}) {
  const pending = matches.filter((m) => m.status === "scheduled").length;
  const done = matches.filter((m) => m.status === "confirmed").length;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="label-mp" style={{ margin: 0 }}>
            Fecha {roundNo}
            {totalRounds > 1 && (
              <span style={{ fontWeight: 400, color: "var(--muted-fg)", marginLeft: 4 }}>
                de {totalRounds}
              </span>
            )}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: done === matches.length ? "var(--primary)" : "var(--muted-fg)",
          }}
        >
          {done}/{matches.length} jugados
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {matches.map((m, idx) => {
          const { a, b } = setScoreDisplay(m);
          const isReported = m.status === "confirmed";
          return (
            <div
              key={m.id}
              style={{
                borderTop: idx > 0 ? "1px solid var(--border)" : undefined,
                padding: "12px 18px",
              }}
            >
              <ScoreMatchCard
                matchId={m.id}
                labelA={label(registrationLabels, m.sideARegistrationId)}
                labelB={label(registrationLabels, m.sideBRegistrationId)}
                scoreA={a}
                scoreB={b}
                winnerSide={m.winnerSide}
                editable={!isReported && !busy && !readOnly}
                correctable={isReported && !busy && !readOnly}
                busy={busy}
                onScoreSubmit={onScore}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / no-schedule state
// ---------------------------------------------------------------------------
function EmptyState({
  tournamentFormat,
  busy,
  onGenerate,
}: {
  tournamentFormat: string;
  busy: boolean;
  onGenerate: () => void;
}) {
  if (tournamentFormat === "swiss") {
    return (
      <div className="card mp-partner-torneo-operacion-brackets">
        <div className="mp-partner-torneo-operacion-brackets-icon" aria-hidden>
          <Icon name="shuffle" size={18} />
        </div>
        <div className="mp-partner-torneo-operacion-brackets-body">
          <div className="label-mp">Calendario suizo</div>
          <p className="mp-partner-torneo-operacion-brackets-sub">
            La generación automática de rondas suizas estará disponible pronto.
            Por ahora puedes reportar resultados manualmente una vez que tengas el calendario.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card mp-partner-torneo-operacion-brackets">
      <div className="mp-partner-torneo-operacion-brackets-icon" aria-hidden>
        <Icon name="list" size={18} />
      </div>
      <div className="mp-partner-torneo-operacion-brackets-body">
        <div className="label-mp">Calendario de liga</div>
        <p className="mp-partner-torneo-operacion-brackets-sub">
          Genera el calendario round-robin automáticamente a partir de los inscritos aceptados.
          Cada equipo jugará una vez contra todos los demás.
        </p>
        <button
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={busy}
          style={{ alignSelf: "flex-start" }}
        >
          {busy ? (
            <>
              <Icon name="loader" size={12} color="#fff" />
              Generando...
            </>
          ) : (
            <>
              <Icon name="calendar-plus" size={12} color="#fff" />
              Sortear calendario
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function LigaOperacionPanelView({
  tournamentId,
  categoryId,
  categoryName,
  tournamentFormat,
  registrationLabels,
  initialData,
}: Props) {
  const [data, setData] = useState<LigaData>(initialData);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const showToast = useToast();

  const isBusy = busy || isPending;

  // Filtrado por el grupo de ESTA liga (group_id es filtro de igualdad válido)
  // + debounce default del hook. Antes: sin filtro (fanout global de todos los
  // torneos) y refresh inmediato sin debounce, multiplicado por un panel por
  // categoría (audit de costos 2026-07-01).
  useRealtimeRefresh(
    [{ table: "tournament_group_matches", filter: `group_id=eq.${data.groupId}` }],
    { enabled: !!data.groupId },
  );

  const roundsMap = useMemo(() => {
    const map = new Map<number, LigaMatchRow[]>();
    for (const m of data.matches) {
      if (!map.has(m.roundNo)) map.set(m.roundNo, []);
      map.get(m.roundNo)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [data.matches]);

  const totalRounds = roundsMap.length;

  const progressStats = useMemo(() => {
    const total = data.matches.length;
    const done = data.matches.filter((m) => m.status === "confirmed").length;
    return { total, done };
  }, [data.matches]);

  const closed = data.categoryStage === "complete";
  const allConfirmed = progressStats.total > 0 && progressStats.done === progressStats.total;
  const championLabel =
    data.standings[0] != null
      ? label(registrationLabels, data.standings[0].registrationId)
      : null;

  async function handleClose() {
    setBusy(true);
    try {
      const res = await closeLigaStage({ tournamentId, categoryId });
      if (!res.ok) {
        showToast({ icon: "alert-triangle", title: "Error", sub: res.error.message, tone: "error" });
        return;
      }
      showToast({
        icon: "check",
        title: `Liga finalizada · Campeón: ${championLabel ?? "—"}`,
        sub: res.data.tournamentFinished ? "El torneo pasó a finalizado y se notificó a los inscritos." : undefined,
        tone: "success",
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    setBusy(true);
    try {
      const res = await generateRoundRobinSchedule({ tournamentId, categoryId });
      if (!res.ok) {
        showToast({ icon: "alert-triangle", title: "Error", sub: res.error.message, tone: "error" });
        return;
      }
      showToast({ icon: "check", title: `Calendario listo: ${res.data.matchesCreated} partidos generados`, tone: "success" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function handleScore(matchId: string, setsA: number, setsB: number) {
    const winnerSide = setsA > setsB ? ("a" as const) : ("b" as const);
    const score = { sets: [{ a: setsA, b: setsB }] };

    const match = data.matches.find((m) => m.id === matchId);
    const isCorrection = match?.status === "confirmed";

    setBusy(true);
    try {
      const action = isCorrection ? correctLigaMatch : reportLigaMatch;
      const res = await action({ tournamentId, matchId, winnerSide, score });
      if (!res.ok) {
        showToast({ icon: "alert-triangle", title: "Error", sub: res.error.message, tone: "error" });
        return;
      }
      showToast({ icon: "check", title: "Marcador guardado", tone: "success", durationMs: TOAST_SCORE_MS });

      // Optimistic update
      setData((prev) => ({
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === matchId
            ? { ...m, winnerSide, score, status: "confirmed" }
            : m,
        ),
      }));

      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (!data.hasSchedule) {
    return (
      <EmptyState
        tournamentFormat={tournamentFormat}
        busy={isBusy}
        onGenerate={handleGenerate}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header con progreso */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="list" size={14} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            {categoryName} · Liga
          </span>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
          {progressStats.done}/{progressStats.total} partidos jugados
        </span>
      </div>

      {/* Liga cerrada: campeón publicado */}
      {closed && (
        <div
          className="card"
          style={{
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.35)",
          }}
        >
          <Icon name="trophy" size={16} color="#059669" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#059669" }}>
              Liga finalizada
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Campeón: {championLabel ?? "—"}
            </div>
          </div>
        </div>
      )}

      {/* Cierre: disponible cuando todos los partidos están confirmados */}
      {!closed && allConfirmed && (
        <div
          className="card"
          style={{
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Todos los partidos confirmados
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
              Al finalizar se publica el campeón ({championLabel ?? "—"}) y los marcadores quedan cerrados.
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleClose} disabled={isBusy}>
            {isBusy ? (
              <>
                <Icon name="loader" size={12} color="#fff" />
                Finalizando…
              </>
            ) : (
              <>
                <Icon name="flag" size={12} color="#fff" />
                Finalizar liga
              </>
            )}
          </button>
        </div>
      )}

      {/* Tabla de posiciones */}
      <StandingsTable standings={data.standings} registrationLabels={registrationLabels} />

      {/* Fechas */}
      {roundsMap.map(([roundNo, matches]) => (
        <RoundSection
          key={roundNo}
          roundNo={roundNo}
          totalRounds={totalRounds}
          matches={matches}
          registrationLabels={registrationLabels}
          busy={isBusy}
          readOnly={closed}
          onScore={handleScore}
        />
      ))}
    </div>
  );
}
