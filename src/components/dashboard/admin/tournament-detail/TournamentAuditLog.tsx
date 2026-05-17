"use client";

// Cliente: timeline de auditoría filtrada por torneo. Llama a la action
// admin-only `getTournamentAuditLog` (audit_log + registrations + transactions
// del torneo) y renderiza una línea cronológica con diff JSON expandible.

import { useEffect, useState } from "react";
import {
  getTournamentAuditLog,
  type AuditEntry,
} from "@/server/actions/admin-audit";
import { SectionTitle, EmptyState } from "../event-detail/primitives";

function fmtWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "hace unos segundos";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD} d`;
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const ENTITY_COLOR: Record<string, string> = {
  tournaments: "#0ea5e9",
  registrations: "var(--primary)",
  transactions: "#16a34a",
};

function TimelineRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const dotColor = ENTITY_COLOR[entry.entity] ?? "var(--muted-fg)";
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "16px 1fr",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ position: "relative" }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: dotColor,
            marginTop: 6,
            marginLeft: 3,
          }}
        />
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>{entry.summary}</strong>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            por {entry.actorName}
            {entry.actorRole ? ` · ${entry.actorRole}` : ""}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-fg)",
            marginTop: 2,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span>{fmtWhen(entry.createdAt)}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ fontFamily: "monospace" }}>
            {entry.entity}.{entry.action.toLowerCase()}
          </span>
          {entry.rawDiff ? (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 11,
                  color: "var(--primary)",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {open ? "Ocultar diff" : "Ver diff"}
              </button>
            </>
          ) : null}
        </div>
        {open && entry.rawDiff ? (
          <pre
            style={{
              marginTop: 8,
              padding: 10,
              background: "#0a0a0a",
              color: "#e5e7eb",
              borderRadius: 8,
              fontSize: 11,
              lineHeight: 1.5,
              overflowX: "auto",
              maxHeight: 280,
            }}
          >
            {JSON.stringify(entry.rawDiff, null, 2)}
          </pre>
        ) : null}
      </div>
    </li>
  );
}

export function TournamentAuditLog({ tournamentId }: { tournamentId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getTournamentAuditLog({ tournamentId, limit: 50 });
      if (cancelled) return;
      if (res.ok) setEntries(res.data);
      else setErrorMsg(`${res.error.code}: ${res.error.message}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  return (
    <div style={{ marginTop: 16 }}>
      <SectionTitle>Historial</SectionTitle>
      {errorMsg ? (
        <EmptyState label={`No se pudo cargar el historial (${errorMsg}).`} />
      ) : entries === null ? (
        <EmptyState label="Cargando historial…" />
      ) : entries.length === 0 ? (
        <EmptyState label="Aún no hay registros de auditoría para este torneo." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {entries.map((e) => (
            <TimelineRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
