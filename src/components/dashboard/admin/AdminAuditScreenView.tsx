// Client view de AdminAuditScreen — layout 1:1 (RoleScreens2.jsx 94-118).
"use client";
import { Icon } from "@/components/Icon";
import { RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { downloadCsv } from "@/lib/export/csv";

export type LogEntry = { id: string; t: string; who: string; action: string; target: string; ip: string };
export type AuditData = { rows: LogEntry[] };

const PLACEHOLDER_COUNT = 6;

export function AdminAuditScreenView({ data }: { data: AuditData }) {
  useRealtimeRefresh([{ table: "audit_log", event: "INSERT" }], { debounceMs: 5000 });

  const hasRows = data.rows.length > 0;
  const rows = hasRows
    ? data.rows
    : Array.from({ length: PLACEHOLDER_COUNT }).map<LogEntry>((_, i) => ({
        id: `ph-${i}`,
        t: "--:--:--",
        who: "—",
        action: "—",
        target: "Sin actividad",
        ip: "—",
      }));

  return (
    <>
      <RSHeader
        label="Plataforma · Audit"
        title="Audit log"
        action={
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
            onClick={() =>
              downloadCsv("audit-log", data.rows, [
                { header: "id", get: (r) => r.id },
                { header: "hora", get: (r) => r.t },
                { header: "actor", get: (r) => r.who },
                { header: "accion", get: (r) => r.action },
                { header: "objetivo", get: (r) => r.target },
                { header: "ip", get: (r) => r.ip },
              ])
            }
            disabled={!hasRows}
          >
            <Icon name="download" size={12} />
            Exportar CSV
          </button>
        }
      />
      <div
        className="card"
        style={{
          padding: 12,
          background: "#0a0a0a",
          color: "#fff",
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {rows.map((l, i) => (
          <div
            key={l.id}
            style={{
              display: "grid",
              gridTemplateColumns: "90px 220px 200px 1fr 110px",
              gap: 12,
              padding: "6px 8px",
              borderRadius: 4,
              background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent",
              opacity: hasRows ? 1 : 0.5,
            }}
          >
            <span style={{ color: "#10b981" }}>{l.t}</span>
            <span style={{ color: "#fbbf24" }}>{l.who}</span>
            <span style={{ color: "#fff", fontWeight: 700 }}>{l.action}</span>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{l.target}</span>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>{l.ip}</span>
          </div>
        ))}
      </div>
    </>
  );
}
