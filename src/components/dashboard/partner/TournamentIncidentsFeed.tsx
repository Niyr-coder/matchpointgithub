"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  listMatchIncidents,
  type MatchIncident,
} from "@/server/actions/tournament-operation";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";

const TYPE_LABELS: Record<MatchIncident["type"], string> = {
  behavior: "Conducta",
  equipment: "Equipamiento",
  weather: "Clima",
  other: "Otro",
};

const TYPE_COLORS: Record<MatchIncident["type"], { bg: string; color: string }> = {
  behavior: { bg: "#fca5a522", color: "#dc2626" },
  equipment: { bg: "#fbbf2422", color: "#a16207" },
  weather: { bg: "#7dd3fc22", color: "#0369a1" },
  other: { bg: "var(--border)", color: "var(--muted-fg)" },
};

function IncidentTypePill({ type }: { type: MatchIncident["type"] }) {
  const { bg, color } = TYPE_COLORS[type];
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 100,
        background: bg,
        color,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function IncidentRow({ incident }: { incident: MatchIncident }) {
  const courtLabel = incident.courtCode ?? incident.courtName ?? "Cancha";
  const relativeTime = (() => {
    const diff = Date.now() - new Date(incident.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `Hace ${hrs} h`;
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <IncidentTypePill type={incident.type} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 100,
            background: "var(--foreground)",
            color: "var(--background, #fff)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {courtLabel}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted-fg)", marginLeft: "auto" }}>
          {relativeTime}
        </span>
      </div>

      {incident.notes && (
        <p
          style={{
            fontSize: 12,
            color: "var(--foreground)",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {incident.notes}
        </p>
      )}

      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        Monitor:{" "}
        <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
          {incident.monitorDisplayName ?? "—"}
        </span>
      </div>
    </div>
  );
}

export function TournamentIncidentsFeed({ tournamentId }: { tournamentId: string }) {
  const [incidents, setIncidents] = useState<MatchIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTx] = useTransition();

  const load = useCallback(() => {
    startTx(async () => {
      const res = await listMatchIncidents({ tournamentId });
      if (res.ok) setIncidents(res.data.incidents);
      setLoading(false);
    });
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    [{ table: "match_incidents", filter: `tournament_id=eq.${tournamentId}` }],
    { onChange: () => load() },
  );

  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="label-mp">Incidentes</div>
        {incidents.length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 100,
              background: "#fca5a522",
              color: "#dc2626",
              letterSpacing: "0.04em",
            }}
          >
            {incidents.length}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{ height: 56, borderRadius: 8, background: "var(--muted)", opacity: 0.6 }}
            />
          ))}
        </div>
      )}

      {!loading && incidents.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-fg)",
            textAlign: "center",
            padding: "10px 0",
          }}
        >
          Sin incidentes reportados
        </div>
      )}

      {!loading && incidents.length > 0 && (
        <div>
          {incidents.map((inc) => (
            <IncidentRow key={inc.id} incident={inc} />
          ))}
        </div>
      )}
    </div>
  );
}
