"use client";

import type { CourtOccupancyRow } from "@/server/queries/court-occupancy";

type Props = {
  court: CourtOccupancyRow;
  onReserve: () => void;
};

/** Cancha en tab Reservar — club-web.jsx CourtTile */
export function ClubCourtTile({ court, onReserve }: Props) {
  const isLive = court.status === "busy" || court.status === "class";

  const state = isLive
    ? {
        bg: "var(--primary-light)",
        fg: "var(--primary-light-fg)",
        label: court.status === "class" ? "Clase" : "En juego",
        dot: "var(--primary)",
      }
    : { bg: "#fff", fg: "var(--fg)", label: "Disponible", dot: "#16a34a" };

  const subline = isLive ? `Hasta ${court.until}` : "Libre ahora";

  return (
    <div className="card" style={{ padding: 14, borderColor: isLive ? "var(--primary)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, textTransform: "uppercase" }}>
          {court.n}
          <span style={{ color: "var(--primary)" }}>.</span>
        </div>
        <span className="chip" style={{ background: state.bg, color: state.fg, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: state.dot }} /> {state.label}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 600 }}>{court.sport}</div>
      <div style={{ fontSize: 11.5, marginTop: 6, fontWeight: 700 }}>{subline}</div>
      {!isLive && (
        <button type="button" className="btn btn-onyx btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={onReserve}>
          Reservar
        </button>
      )}
    </div>
  );
}
