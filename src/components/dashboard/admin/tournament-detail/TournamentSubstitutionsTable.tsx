"use client";

import { useEffect, useState } from "react";
import {
  listRegistrationSubstitutions,
  type RegistrationSubstitution,
  type SubstitutionReason,
} from "@/server/actions/tournament-player-ops";

const REASON_LABEL: Record<SubstitutionReason, string> = {
  injury: "Lesión",
  no_show: "No llegó",
  voluntary: "Voluntario",
  other: "Otro",
};

export function TournamentSubstitutionsTable({ tournamentId }: { tournamentId: string }) {
  const [items, setItems] = useState<RegistrationSubstitution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRegistrationSubstitutions({ tournamentId }).then((res) => {
      if (res.ok) setItems(res.data);
      setLoading(false);
    });
  }, [tournamentId]);

  if (loading) {
    return (
      <div style={{ color: "var(--muted-fg)", fontSize: 12, padding: "12px 0" }}>
        Cargando sustituciones…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ color: "var(--muted-fg)", fontSize: 12, padding: "12px 0" }}>
        Sin sustituciones registradas.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((s) => {
        const dt = new Date(s.createdAt);
        return (
          <div
            key={s.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              alignItems: "start",
            }}
          >
            <div>
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#ef4444", fontWeight: 700 }}>↑</span>
                <span style={{ fontWeight: 600 }}>{s.outPlayerName}</span>
                <span style={{ color: "var(--muted-fg)", fontSize: 11 }}>sale</span>
              </div>
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ color: "var(--primary)", fontWeight: 700 }}>↓</span>
                <span style={{ fontWeight: 600 }}>{s.inPlayerName}</span>
                <span style={{ color: "var(--muted-fg)", fontSize: 11 }}>entra</span>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 7px",
                borderRadius: 4,
                background: "var(--muted)",
                color: "var(--muted-fg)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                alignSelf: "center",
              }}
            >
              {REASON_LABEL[s.reason] ?? s.reason}
            </span>
            <time
              dateTime={s.createdAt}
              style={{ fontSize: 11, color: "var(--muted-fg)", whiteSpace: "nowrap", alignSelf: "center" }}
            >
              {dt.toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}
            </time>
          </div>
        );
      })}
    </div>
  );
}
