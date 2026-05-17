// Client view de ClubReservasScreen — layout del mock 1:1. Solo cambian valores.
// El mock con celdas "+ $14" YA es el estado vacío natural del grid.
"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type ReservasData = {
  clubId: string | null;
  clubName: string;
  // Todas las canchas activas del club (no hay cap). Cada una con su grid 7×8
  // y su precio mínimo individual.
  courts: { id: string; label: string; grid: number[][]; minPriceCents: number | null }[];
  weekRangeLabel: string;
  daysLabels: string[]; // 7 labels tipo "LUN 12"
  occupancyPct: number;
  minPriceCents: number | null; // global, fallback
};

// Grid alineado a la convención de booking (09:00–22:00, cada hora).
const HOURS = ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];

const LEGEND: { c: string; l: string }[] = [
  { c: "#ecfdf5", l: "Libre" },
  { c: "var(--primary)", l: "Reservada" },
  { c: "#fbbf24", l: "Evento" },
  { c: "#7c3aed", l: "Clase" },
];

function cell(s: number, disabled = false) {
  return {
    height: 36,
    borderRadius: 5,
    fontSize: 9.5,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      s === 0 ? "#ecfdf5" : s === 1 ? "var(--primary)" : s === 2 ? "#fbbf24" : "#7c3aed",
    color: s === 0 ? "#065f46" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  } as const;
}

function emptyGrid(): number[][] {
  return Array(7).fill(null).map(() => Array(8).fill(0));
}

// Cuando el club no tiene canchas, 1 tab placeholder + grid vacío sin precio.
const EMPTY_COURT = {
  id: "empty",
  label: "Sin canchas",
  grid: emptyGrid(),
  minPriceCents: null as number | null,
};

export function ClubReservasScreenView({ data }: { data: ReservasData }) {
  useRealtimeRefresh(
    data.clubId ? [{ table: "reservations", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId },
  );

  // Si hay courts reales → todos; si no → 1 tab "Sin canchas".
  const courts = data.courts.length > 0 ? data.courts : [EMPTY_COURT];
  const hasReal = data.courts.length > 0;

  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = activeIdx < courts.length ? activeIdx : 0;
  const activeCourt = courts[safeIdx];

  const activeMinPrice =
    activeCourt.minPriceCents != null
      ? Math.round(activeCourt.minPriceCents / 100)
      : null;

  const freeCellLabel = activeMinPrice != null ? `+ $${activeMinPrice}` : "+ $—";
  const LABEL: Record<number, string> = {
    0: freeCellLabel,
    1: "BOOK",
    2: "EVT",
    3: "CLASE",
  };
  const GRID = activeCourt.grid;

  return (
    <>
      <RSHeader
        label="Club · Operación"
        title="Reservas semanales"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              disabled={!hasReal}
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="chevron-left" size={12} />
            </button>
            <button
              className="btn"
              disabled={!hasReal}
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              {data.weekRangeLabel}
            </button>
            <button
              className="btn"
              disabled={!hasReal}
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="chevron-right" size={12} />
            </button>
            <button
              className="btn btn-primary"
              disabled={!hasReal}
              style={{
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="plus" size={13} color="#fff" />
              Reserva manual
            </button>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 10.5 }}>
        {LEGEND.map((k) => (
          <span key={k.l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: k.c }} />
            {k.l}
          </span>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--muted-fg)" }}>
          Ocupación esta semana · <b style={{ color: "#0a0a0a" }}>{data.occupancyPct}%</b>
        </span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 10,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {courts.map((c, n) => {
            const on = n === safeIdx;
            return (
              <button
                key={c.id}
                onClick={() => setActiveIdx(n)}
                disabled={!hasReal}
                style={{
                  flex: courts.length <= 6 ? 1 : "0 0 auto",
                  minWidth: courts.length > 6 ? 100 : undefined,
                  padding: "8px",
                  borderRadius: 8,
                  border: on && hasReal ? "2px solid var(--primary)" : RS_BORDER,
                  borderStyle: hasReal ? "solid" : "dashed",
                  background: on && hasReal ? "#ecfdf5" : "#fff",
                  cursor: hasReal ? "pointer" : "default",
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  color: hasReal ? "#0a0a0a" : "var(--muted-fg)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "50px repeat(7, 1fr)",
            gap: 4,
            marginBottom: 6,
          }}
        >
          <div />
          {data.daysLabels.map((d, i) => (
            <div
              key={d}
              style={{
                fontSize: 9,
                fontWeight: 900,
                textAlign: "center",
                letterSpacing: "0.08em",
                padding: 6,
                color: i === 1 ? "var(--primary)" : "var(--muted-fg)",
              }}
            >
              {d}
            </div>
          ))}
        </div>
        {HOURS.map((h, hi) => (
          <div
            key={h}
            style={{
              display: "grid",
              gridTemplateColumns: "50px repeat(7, 1fr)",
              gap: 4,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: "var(--muted-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 6,
              }}
            >
              {h}:00
            </div>
            {GRID.map((day, di) => (
              <div key={di} style={cell(day[hi], !hasReal)}>
                {LABEL[day[hi]]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
