"use client";

// Primitivos compartidos entre AdminEventDetailView y AdminTournamentDetailView.
// Cada sub-componente del detalle admin (header, actions, tablas, audit) importa
// formatters, StatusPill, Kpi y CancelDialog desde aquí para mantener consistencia
// visual sin acoplarse al View padre.

import { Icon } from "@/components/Icon";

export function fmtMoney(cents: number, currency: string | null): string {
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency ?? "USD"} ${amount}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_COLOR: Record<string, string> = {
  draft: "#6b7280",
  published: "#0ea5e9",
  registration_open: "var(--primary)",
  registration_closed: "#fbbf24",
  live: "#dc2626",
  finished: "#0a0a0a",
  cancelled: "#7f1d1d",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 9999,
        fontSize: 9.5,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        background: STATUS_COLOR[status] ?? "var(--muted-fg)",
        color: "#fff",
      }}
    >
      {status}
    </span>
  );
}

export function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="label-mp">{label}</div>
      <div
        className="font-heading"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          marginTop: 5,
          color: color ?? "#0a0a0a",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        color: "var(--muted-fg)",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-heading"
      style={{
        fontSize: 16,
        fontWeight: 900,
        letterSpacing: "-0.02em",
        textTransform: "uppercase",
        margin: "0 0 10px",
      }}
    >
      {children}
      <span className="dot">.</span>
    </h2>
  );
}

export function CancelDialog({
  title,
  reason,
  setReason,
  onClose,
  onConfirm,
  pending,
}: {
  title: string;
  reason: string;
  setReason: (s: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 440,
        }}
      >
        <h3
          className="font-heading"
          style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          {title}
        </h3>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Esta acción es visible para todos los inscritos y deja la fila marcada como cancelada.
          No emite refunds automáticos.
        </p>
        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginTop: 14,
            marginBottom: 6,
          }}
        >
          Motivo (opcional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Queda en el audit log."
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            onClick={onClose}
            disabled={pending}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Volver
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="btn"
            style={{ background: "#dc2626", color: "#fff", opacity: pending ? 0.6 : 1 }}
          >
            <Icon name="x-octagon" size={13} color="#fff" />
            {pending ? "Cancelando…" : "Confirmar cancelación"}
          </button>
        </div>
      </div>
    </div>
  );
}
