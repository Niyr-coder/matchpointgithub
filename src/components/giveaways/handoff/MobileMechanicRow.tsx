"use client";

import { Icon } from "@/components/Icon";
import { getMechanicCatalogEntry } from "../mechanic-catalog";
import type { MechanicKind } from "../types";

type Props = {
  kind: MechanicKind;
  label: string;
  weight: number;
  done?: boolean;
  pending?: boolean;
  preview?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

/** Fila mobile — JoinDetail / JoinConfirmation (gw-join-mobile.jsx MobileMechRow) */
export function MobileMechanicRow({ kind, label, weight, done = false, pending = false, preview = false, actionLabel, onAction }: Props) {
  const cat = getMechanicCatalogEntry(kind);
  const reviewing = pending && !done;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 10,
        background: done ? "var(--primary-light)" : reviewing ? "var(--warn-bg, #fffbeb)" : "#fff",
        border: `1px solid ${done ? "var(--primary)" : reviewing ? "var(--warn-fg, #d97706)" : "var(--border)"}`,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: done ? "var(--primary)" : "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={done ? "check" : cat?.icon ?? "circle"} size={14} color={done ? "#fff" : "var(--muted-fg)"} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 600, marginTop: 2 }}>
          {done ? `Sumadas · +${weight}` : reviewing ? "En revisión" : `+${weight} entrada${weight > 1 ? "s" : ""}`}
        </div>
      </div>
      {done ? (
        <span className="chip" style={{ background: "var(--primary-dark)", color: "#fff", fontSize: 9.5 }}>
          +{weight}
        </span>
      ) : reviewing ? (
        <span className="chip" style={{ background: "var(--warn-fg, #d97706)", color: "#fff", fontSize: 9.5 }}>
          En revisión
        </span>
      ) : preview ? (
        <span className="chip" style={{ fontSize: 9.5 }}>
          +{weight}
        </span>
      ) : (
        <button type="button" className="btn btn-onyx btn-sm" style={{ padding: "5px 10px", fontSize: 9.5 }} onClick={onAction}>
          {actionLabel ?? "Hacer"}
        </button>
      )}
    </div>
  );
}
