// Admin panel de gobernanza/soporte de Quedadas (juntas sociales de usuarios).
// Flow: atender cola de reportes (resolver/descartar) + listar todas las
// quedadas e inspeccionarlas/cancelarlas. Mutaciones via server actions que
// registran audit automático (setAuditActor con actor=admin).
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  listQuedadasAdmin,
  cancelQuedadaAdmin,
  listQuedadaReports,
  resolveQuedadaReport,
  type AdminQuedadaRow,
  type QuedadaReportRow,
} from "@/server/actions/admin/quedadas";

// ── Labels legibles ──────────────────────────────────────────────────────────
const FORMAT_LABELS: Record<string, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  round_robin: "Round Robin",
  kotc: "Rey de Cancha",
  canguil: "Canguil",
  libre: "Libre",
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Pública",
  private: "Privada",
  unlisted: "No listada",
  friends: "Amigos",
};

function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

function visibilityLabel(visibility: string): string {
  return VISIBILITY_LABELS[visibility] ?? visibility;
}

function feeLabel(feeCents: number): string {
  if (!feeCents || feeCents <= 0) return "Gratis";
  return `$${(feeCents / 100).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Estado → chip. Cualquier estado desconocido cae al estilo neutro.
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Borrador", bg: "#f1f5f9", fg: "#475569" },
  open: { label: "Abierta", bg: "#dcfce7", fg: "#15803d" },
  full: { label: "Llena", bg: "#fef9c3", fg: "#a16207" },
  in_progress: { label: "En curso", bg: "#dbeafe", fg: "#1d4ed8" },
  finished: { label: "Finalizada", bg: "#ede9fe", fg: "#6d28d9" },
  cancelled: { label: "Cancelada", bg: "#fee2e2", fg: "#dc2626" },
};

function StatusChip({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, bg: "#f1f5f9", fg: "#475569" };
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 6,
        background: meta.bg,
        color: meta.fg,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

// Quedadas en estos estados ya no se pueden cancelar.
const NON_CANCELABLE = new Set(["cancelled", "finished"]);

export function AdminQuedadasScreen() {
  const toast = useToast();
  const router = useRouter();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();

  const [reports, setReports] = useState<QuedadaReportRow[] | null>(null);
  const [quedadas, setQuedadas] = useState<AdminQuedadaRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    listQuedadaReports().then((r) => {
      if (alive && r.ok) setReports(r.data);
      else if (alive) setReports([]);
    });
    listQuedadasAdmin().then((r) => {
      if (alive && r.ok) setQuedadas(r.data);
      else if (alive) setQuedadas([]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleResolve = (report: QuedadaReportRow, resolution: "resolved" | "dismissed") => {
    if (pending) return;
    startTransition(async () => {
      const r = await resolveQuedadaReport({ reportId: report.id, resolution });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      setReports((prev) => prev?.filter((x) => x.id !== report.id) ?? null);
      toast({
        icon: "check",
        title: resolution === "resolved" ? "Reporte resuelto" : "Reporte descartado",
      });
      router.refresh();
    });
  };

  const handleCancel = async (q: AdminQuedadaRow) => {
    if (pending) return;
    const ok = await confirm({
      title: "Cancelar quedada",
      body: `¿Cancelar "${q.title}"? Esta acción la cierra para todos los participantes.`,
      confirmLabel: "Cancelar quedada",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await cancelQuedadaAdmin({ quedadaId: q.id });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      setQuedadas((prev) =>
        prev?.map((x) => (x.id === q.id ? { ...x, status: "cancelled" } : x)) ?? null,
      );
      toast({ icon: "check", title: "Quedada cancelada" });
      router.refresh();
    });
  };

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
      <header style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            marginBottom: 6,
          }}
        >
          ● Admin · Quedadas
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Quedadas
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 6 }}>
          Atiende reportes de moderación, inspecciona todas las quedadas y cancela las
          problemáticas.
        </p>
      </header>

      {/* ── Sección: reportes ── */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            marginBottom: 4,
          }}
        >
          Reportes
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 12px" }}>
          Cola de reportes abiertos. Resuelve (acción tomada) o descarta (sin mérito) cada uno.
        </p>
        {reports === null ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando reportes…</div>
        ) : reports.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin reportes abiertos.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reports.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "#fafafa",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, wordBreak: "break-word" }}>
                    {r.reason}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                    {fmtDate(r.createdAt)} · Quedada{" "}
                    <span style={{ fontFamily: "monospace" }}>{r.quedadaId.slice(0, 8)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handleResolve(r, "resolved")}
                    disabled={pending}
                    className="btn btn-primary"
                    style={{ padding: "7px 14px", fontSize: 10.5 }}
                  >
                    Resolver
                  </button>
                  <button
                    onClick={() => handleResolve(r, "dismissed")}
                    disabled={pending}
                    className="btn"
                    style={{
                      background: "#fff",
                      border: "1px solid var(--border)",
                      padding: "7px 14px",
                      fontSize: 10.5,
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sección: todas las quedadas ── */}
      <div className="card" style={{ padding: 18 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            marginBottom: 4,
          }}
        >
          Todas las quedadas
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 12px" }}>
          Las 100 quedadas más recientes. Cancela cualquiera que esté abierta o en curso si hay un
          problema.
        </p>
        {quedadas === null ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando quedadas…</div>
        ) : quedadas.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>No hay quedadas todavía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {quedadas.map((q) => {
              const cancelable = !NON_CANCELABLE.has(q.status);
              return (
                <div
                  key={q.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: cancelable ? "#fff" : "#fafafa",
                    opacity: cancelable ? 1 : 0.75,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: 13, wordBreak: "break-word" }}>
                        {q.title}
                      </span>
                      <StatusChip status={q.status} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 3 }}>
                      {formatLabel(q.format)} · {visibilityLabel(q.visibility)} ·{" "}
                      {feeLabel(q.feeCents)} · {fmtDate(q.startsAt)}
                    </div>
                  </div>
                  {cancelable && (
                    <button
                      onClick={() => handleCancel(q)}
                      disabled={pending}
                      className="btn"
                      style={{
                        background: "#fff",
                        border: "1px solid #fecaca",
                        color: "#dc2626",
                        padding: "7px 14px",
                        fontSize: 10.5,
                        flexShrink: 0,
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
