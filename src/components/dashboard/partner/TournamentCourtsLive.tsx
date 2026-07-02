"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import {
  listCourtsLiveStatus,
  type CourtLiveStatus,
  type CourtLiveMatch,
} from "@/server/actions/tournament-operation";
import { confirmGroupMatch } from "@/server/actions/tournament-group-stage";
import { confirmBracketMatch } from "@/server/actions/tournament-monitors";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { useToast } from "@/components/dashboard/ToastProvider";

// ── Sub-componentes ───────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <>
      <style>{`@keyframes mp-cl-pulse{0%,100%{opacity:1}50%{opacity:0.3}}.mp-cl-pulse{animation:mp-cl-pulse 1.4s ease-in-out infinite;}`}</style>
      <span
        className="mp-cl-pulse"
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#34d399",
          flexShrink: 0,
        }}
      />
    </>
  );
}

function CourtPill({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 100,
        background: "var(--foreground)",
        color: "var(--background, #fff)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: CourtLiveMatch["status"] | null }) {
  if (!status) {
    return (
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 100,
          background: "var(--border)",
          color: "var(--muted-fg)",
          letterSpacing: "0.04em",
        }}
      >
        Sin partido
      </span>
    );
  }

  const cfgMap: Record<CourtLiveMatch["status"], { bg: string; color: string; label: string }> = {
    scheduled: { bg: "var(--border)", color: "var(--muted-fg)", label: "Programado" },
    live: { bg: "#34d39922", color: "#059669", label: "En vivo" },
    reported: { bg: "#fbbf2422", color: "#a16207", label: "Por confirmar" },
  };
  const cfg = cfgMap[status];

  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 100,
        background: cfg.bg,
        color: cfg.color,
        letterSpacing: "0.04em",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {status === "live" && <PulsingDot />}
      {cfg.label}
    </span>
  );
}

function MatchDetails({ match }: { match: CourtLiveMatch }) {
  const livePoints =
    match.status === "live" && match.currentPoints ? match.currentPoints : null;
  if (match.status === "live" && match.setsCompleted.length === 0 && !livePoints) {
    return (
      <div style={{ fontSize: 11, color: "#059669" }}>
        Primer set en juego
      </div>
    );
  }
  if (match.status === "scheduled" && match.scheduledAt) {
    const time = new Date(match.scheduledAt).toLocaleTimeString("es-EC", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        Programado · {time}
      </div>
    );
  }
  if (match.setsCompleted.length > 0 || livePoints) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {match.setsCompleted.map((s, i) => (
          <span
            key={i}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--foreground)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {s.a}-{s.b}
          </span>
        ))}
        {livePoints && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#059669",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {livePoints.a}-{livePoints.b}
          </span>
        )}
      </div>
    );
  }
  return null;
}

function CourtCard({
  court,
  tournamentId,
  onConfirmed,
}: {
  court: CourtLiveStatus;
  tournamentId: string;
  onConfirmed: () => void;
}) {
  const match = court.currentMatch;
  const isReported = match?.status === "reported";
  const courtLabel = court.courtCode ?? court.courtName ?? "Cancha";
  const [confirming, setConfirming] = useState(false);
  const [, startConfirmTx] = useTransition();
  const toast = useToast();

  const handleConfirm = () => {
    if (!match || confirming) return;
    setConfirming(true);
    startConfirmTx(async () => {
      const res =
        match.matchType === "group"
          ? await confirmGroupMatch({ tournamentId, matchId: match.matchId })
          : await confirmBracketMatch({ matchId: match.matchId, tournamentId });
      setConfirming(false);
      if (res.ok) {
        onConfirmed();
      } else {
        toast({ icon: "alert-triangle", title: "Error al confirmar", sub: res.error.message, tone: "error" });
      }
    });
  };

  return (
    <div
      style={{
        background: "var(--muted)",
        borderRadius: 10,
        padding: "10px 12px",
        border: isReported ? "1px solid #fbbf24" : "1px solid transparent",
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      {/* Pills: cancha + estado + categoría */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <CourtPill label={courtLabel} />
        <StatusPill status={match?.status ?? null} />
        {match?.categoryName && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 100,
              background: "var(--border)",
              color: "var(--muted-fg)",
              letterSpacing: "0.04em",
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={match.categoryName}
          >
            {match.categoryName}
          </span>
        )}
      </div>

      {/* Monitor */}
      <div style={{ fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.4 }}>
        Monitor:{" "}
        <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
          {court.monitorDisplayName}
        </span>
      </div>

      {/* Partido */}
      {match ? (
        <>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.4,
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <span>{match.teamA}</span>
            <span style={{ color: "var(--muted-fg)", fontWeight: 400 }}>vs</span>
            <span>{match.teamB}</span>
          </div>
          <MatchDetails match={match} />
          {isReported && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              style={{
                width: "100%",
                marginTop: 4,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid #fbbf24",
                background: confirming ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.15)",
                color: "#a16207",
                fontSize: 11,
                fontWeight: 700,
                cursor: confirming ? "default" : "pointer",
                letterSpacing: "0.03em",
              }}
            >
              {confirming ? "Confirmando…" : "Confirmar resultado"}
            </button>
          )}
        </>
      ) : (
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>Sin partido asignado</div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function TournamentCourtsLive({
  tournamentId,
  slug: _slug,
}: {
  tournamentId: string;
  slug: string;
}) {
  const [data, setData] = useState<{
    courts: CourtLiveStatus[];
    reportedCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, startTx] = useTransition();

  const load = useCallback(() => {
    startTx(async () => {
      const res = await listCourtsLiveStatus({ tournamentId });
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error.message);
      }
      setLoading(false);
    });
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtrado server-side por torneo (tournament_id denormalizado, mig
  // 20260715000000) + debounce de 1s para colapsar ráfagas de puntos.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
  }, []);
  useRealtimeRefresh(
    [
      { table: "bracket_matches", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_group_matches", filter: `tournament_id=eq.${tournamentId}` },
      { table: "tournament_court_monitors", filter: `tournament_id=eq.${tournamentId}` },
    ],
    {
      onChange: () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => load(), 1000);
      },
    },
  );

  if (loading) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="label-mp" style={{ marginBottom: 14 }}>
          Canchas en vivo
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 80,
                borderRadius: 10,
                background: "var(--muted)",
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const courts = data?.courts ?? [];
  const reportedCount = data?.reportedCount ?? 0;

  return (
    <div className="card" style={{ padding: 18 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="label-mp">Canchas en vivo</div>
        {reportedCount > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 100,
              background: "#fbbf2422",
              color: "#a16207",
              letterSpacing: "0.04em",
            }}
          >
            {reportedCount} por confirmar
          </span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            fontSize: 12,
            color: "#dc2626",
            textAlign: "center",
            padding: "10px 0",
          }}
        >
          No se pudo cargar: {error}
        </div>
      )}

      {/* Empty state */}
      {!error && courts.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-fg)",
            textAlign: "center",
            padding: "10px 0",
          }}
        >
          No hay monitores asignados. Asígnalos más abajo.
        </div>
      )}

      {/* Grid de canchas */}
      {!error && courts.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {courts.map((court) => (
            <CourtCard key={court.courtId} court={court} tournamentId={tournamentId} onConfirmed={load} />
          ))}
        </div>
      )}
    </div>
  );
}
