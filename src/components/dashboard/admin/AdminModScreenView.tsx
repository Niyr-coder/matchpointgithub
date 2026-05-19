// Client view de AdminModScreen — layout 1:1 (RoleScreens.jsx 157-208).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { actOnReport } from "@/server/actions/moderation";

export type Severity = "alta" | "media" | "baja";
export type CaseRow = {
  id: string;
  t: string;
  who: string;
  sev: Severity;
  when: string;
  evidence: string;
  reporter: string;
};
export type ModData = {
  queueCount: number;
  cases: CaseRow[];
  summary: {
    resolvedCount: number;
    suspendCount: number;
    warnCount: number;
    dismissCount: number;
    avgLabel: string;
  };
};

const SEV_COLOR: Record<Severity, string> = {
  alta: "#dc2626",
  media: "#fbbf24",
  baja: "var(--muted-fg)",
};

const PLACEHOLDER_COUNT = 3;

function CasePlaceholder() {
  return (
    <div
      style={{
        padding: 16,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        borderLeft: "3px solid var(--border)",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                color: "var(--muted-fg)",
                letterSpacing: "0.14em",
              }}
            >
              MOD-—
            </span>
            <RSPill bg="var(--muted-fg)">—</RSPill>
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: "-0.015em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            Sin reportes
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            — · reportado por —
          </div>
        </div>
        <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>—</span>
      </div>
      <div
        style={{
          padding: 10,
          background: "var(--muted)",
          borderRadius: 8,
          fontSize: 11,
          color: "var(--muted-fg)",
          fontStyle: "italic",
        }}
      >
        Sin evidencia
      </div>
    </div>
  );
}

export function AdminModScreenView({ data }: { data: ModData }) {
  useRealtimeRefresh([{ table: "reports" }, { table: "moderation_actions" }], { debounceMs: 4000 });
  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleAction = async (id: string, action: "suspend" | "warn" | "dismiss") => {
    const isSuspend = action === "suspend";
    const isWarn = action === "warn";
    const reason = await ask({
      title: isSuspend ? "Suspender usuario" : isWarn ? "Advertir usuario" : "Cerrar reporte",
      label: isSuspend ? "Razón de la suspensión" : isWarn ? "Texto de la advertencia" : "Motivo del cierre",
      placeholder: "Explica brevemente",
      multiline: true,
      required: true,
      confirmLabel: isSuspend ? "Suspender" : isWarn ? "Enviar advertencia" : "Cerrar",
      destructive: isSuspend,
    });
    if (reason == null) return;
    startTransition(async () => {
      const res = await actOnReport({
        id,
        body: { action, reason, durationHours: action === "suspend" ? 168 : undefined },
      });
      if (res.ok)
        toast({
          icon: "check",
          title:
            action === "suspend" ? "Usuario suspendido" : action === "warn" ? "Advertencia enviada" : "Reporte cerrado",
        });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const hasCases = data.cases.length > 0;

  const SUMMARY: [string, string, string][] = [
    ["Casos resueltos", String(data.summary.resolvedCount), "var(--primary)"],
    ["Suspensiones", String(data.summary.suspendCount), "#dc2626"],
    ["Advertencias", String(data.summary.warnCount), "#fbbf24"],
    ["Sin acción", String(data.summary.dismissCount), "var(--muted-fg)"],
    ["Promedio resolución", data.summary.avgLabel, "#0a0a0a"],
  ];

  return (
    <>
      <RSHeader
        label="Plataforma · Moderación"
        title={
          <>
            Cola moderación <span className="dot">●</span> {data.queueCount}
          </>
        }
        action={
          <button className="btn btn-primary">
            <Icon name="check-check" size={13} />
            Marcar todas vistas
          </button>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {hasCases
            ? data.cases.map((c) => (
                <div
                  key={c.id}
                  className="card"
                  style={{ padding: 16, borderLeft: "3px solid " + SEV_COLOR[c.sev] }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 900,
                            color: "var(--muted-fg)",
                            letterSpacing: "0.14em",
                          }}
                        >
                          {c.id}
                        </span>
                        <RSPill bg={SEV_COLOR[c.sev]}>{c.sev}</RSPill>
                      </div>
                      <div
                        className="font-heading"
                        style={{
                          fontSize: 15,
                          fontWeight: 900,
                          letterSpacing: "-0.015em",
                          textTransform: "uppercase",
                        }}
                      >
                        {c.t}
                        <span style={{ color: "var(--primary)" }}>.</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                        {c.who} · reportado por {c.reporter}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>{c.when}</span>
                  </div>
                  <div
                    style={{
                      padding: 10,
                      background: "var(--muted)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#0a0a0a",
                      fontStyle: "italic",
                      borderLeft: "2px solid " + SEV_COLOR[c.sev],
                    }}
                  >
                    {c.evidence}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 10.5 }}
                      onClick={() => handleAction(c.id, "suspend")}
                      disabled={isPending}
                    >
                      <Icon name="ban" size={11} />
                      Suspender
                    </button>
                    <button
                      className="btn"
                      style={{ background: "#fff", border: RS_BORDER, fontSize: 10.5 }}
                      onClick={() => handleAction(c.id, "warn")}
                      disabled={isPending}
                    >
                      <Icon name="alert-triangle" size={11} />
                      Advertir
                    </button>
                    <button
                      className="btn"
                      style={{ background: "#fff", border: RS_BORDER, fontSize: 10.5 }}
                      onClick={() => handleAction(c.id, "dismiss")}
                      disabled={isPending}
                    >
                      <Icon name="check" size={11} />
                      Sin acción
                    </button>
                    <button
                      className="btn"
                      style={{
                        background: "#fff",
                        border: RS_BORDER,
                        fontSize: 10.5,
                        marginLeft: "auto",
                      }}
                    >
                      <Icon name="external-link" size={11} />
                      Ver evidencia
                    </button>
                  </div>
                </div>
              ))
            : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <CasePlaceholder key={k} />)}
        </div>
        <div
          className="card"
          style={{
            padding: 18,
            alignSelf: "flex-start",
            position: "sticky",
            top: 80,
          }}
        >
          <div className="label-mp" style={{ marginBottom: 10 }}>
            Resumen · últimos 30 días
          </div>
          {SUMMARY.map(([k, v, c]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 0",
                fontSize: 11.5,
                borderTop: "1px dashed var(--border)",
              }}
            >
              <span style={{ color: "var(--muted-fg)" }}>{k}</span>
              <span
                className="font-heading"
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: c,
                  letterSpacing: "-0.02em",
                }}
              >
                {v}
              </span>
            </div>
          ))}
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 8,
              fontSize: 10.5,
              lineHeight: 1.5,
            }}
          >
            <b style={{ color: "var(--primary)" }}>● SLA:</b> Casos de severidad alta deben
            resolverse en &lt; 30 min.
          </div>
        </div>
      </div>
    </>
  );
}
