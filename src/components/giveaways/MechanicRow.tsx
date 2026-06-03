"use client";

import { Icon } from "@/components/Icon";
import { getMechanicCatalogEntry } from "./mechanic-catalog";
import type { MechanicKind } from "./types";

type Props = {
  kind: MechanicKind;
  label: string;
  weight: number;
  done?: boolean;
  pending?: boolean;
  disabled?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

/** Fila de mecánica — 1:1 con gw-detail-web.jsx */
export function MechanicRow({ kind, label, weight, done = false, pending = false, disabled = false, actionLabel, onAction }: Props) {
  const cat = getMechanicCatalogEntry(kind);
  const reviewing = pending && !done;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr auto auto",
        gap: 12,
        alignItems: "center",
        padding: "11px 14px",
        borderRadius: 10,
        background: done ? "var(--primary-light)" : reviewing ? "var(--warn-bg, #fffbeb)" : "#fff",
        border: `1px solid ${done ? "var(--primary)" : reviewing ? "var(--warn-fg, #d97706)" : "var(--border)"}`,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 9,
          background: done ? "var(--primary)" : "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={done ? "check" : cat?.icon ?? "circle"} size={16} color={done ? "#fff" : "var(--muted-fg)"} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 600, marginTop: 2 }}>
          {done
            ? `Hecho · ${weight}${weight === 1 ? " entrada sumada" : " entradas sumadas"}`
            : reviewing
              ? "En revisión · el club validará tu captura"
              : `+${weight} entrada${weight > 1 ? "s" : ""} · ${cat?.autoVerify ? "auto" : "validación manual"}`}
        </div>
      </div>
      <span
        className="chip"
        style={{
          background: done ? "var(--primary-dark)" : reviewing ? "var(--warn-fg, #d97706)" : "var(--muted)",
          color: done || reviewing ? "#fff" : "var(--muted-fg)",
          fontSize: 9.5,
        }}
      >
        {reviewing ? "…" : `+${weight}`}
      </span>
      {!done && !disabled && !reviewing ? (
        <button type="button" className="btn btn-onyx btn-sm" onClick={onAction}>
          {actionLabel ?? "Hacer"}
        </button>
      ) : reviewing ? (
        <span className="chip" style={{ background: "var(--warn-fg, #d97706)", color: "#fff", fontSize: 9.5 }}>
          En revisión
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}
