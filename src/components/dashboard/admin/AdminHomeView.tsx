// Client view de AdminHome — layout 1:1 (RoleHomes.jsx 54-128).
"use client";
import { RHKpi, RHPanel, RHWelcome } from "../widgets/RH";
import { Icon } from "@/components/Icon";
import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type ActivityItem = {
  id: string;
  i: string;
  t: string;
  s: string;
  when: string;
  tag: string;
  color: string;
};
export type ModQueueItem = { id: string; t: string; sev: "alta" | "media" | "baja" };
export type AdminHomeData = {
  kpis: {
    mau: number;
    gmvCents: number;
    gmvDeltaCents: number;
    clubsActive: number;
    clubsThisWeek: number;
    matchesWeek: number;
  };
  activity: ActivityItem[];
  queue: ModQueueItem[];
  queueTotal: number;
};

function fmtCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
function fmtCompactUSD(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(0)}k`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

const ACTIVITY_PLACEHOLDER_COUNT = 4;
const QUEUE_PLACEHOLDER_COUNT = 3;

function ActivityPlaceholder() {
  return (
    <div
      style={{
        display: "flex",
        gap: 11,
        padding: "10px 12px",
        border: "1px dashed var(--border)",
        background: "#fafafa",
        borderRadius: 10,
        alignItems: "center",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="circle" size={14} color="var(--muted-fg)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
          <span
            style={{
              padding: "1px 6px",
              borderRadius: 3,
              background: "var(--muted-fg)",
              color: "#fff",
              fontSize: 8,
              fontWeight: 900,
              letterSpacing: "0.12em",
            }}
          >
            —
          </span>
          <span style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 700 }}>—</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3, color: "var(--muted-fg)" }}>
          Sin actividad
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>—</div>
      </div>
    </div>
  );
}

function QueuePlaceholder() {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        opacity: 0.6,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Sin reportes</span>
      <span
        style={{
          fontSize: 8.5,
          padding: "2px 6px",
          borderRadius: 3,
          background: "var(--muted-fg)",
          color: "#fff",
          fontWeight: 900,
          letterSpacing: "0.12em",
        }}
      >
        —
      </span>
    </div>
  );
}

export function AdminHomeView({ data }: { data: AdminHomeData }) {
  // audit_log se escribe en CADA server action de la plataforma; suscribirlo
  // aquí re-renderiza Home por cada acción de cualquier usuario. Home no
  // muestra log, así que lo quitamos. transactions tampoco: el GMV del KPI es
  // mensual y no necesita refresh en vivo por cada pago.
  useRealtimeRefresh([{ table: "reports" }, { table: "clubs" }], {
    debounceMs: REALTIME_DEBOUNCE.ADMIN_LIST,
  });

  const hasActivity = data.activity.length > 0;
  const hasQueue = data.queue.length > 0;

  const deltaLabel =
    data.kpis.gmvDeltaCents === 0
      ? "—"
      : `${data.kpis.gmvDeltaCents >= 0 ? "↑" : "↓"} ${fmtCompactUSD(Math.abs(data.kpis.gmvDeltaCents))}`;
  const deltaPos = data.kpis.gmvDeltaCents >= 0;

  return (
    <>
      <RHWelcome role="admin" />
      <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3.5 max-md:[&_.mp-rh-kpi]:!p-3.5 max-md:[&_.mp-rh-kpi-value]:!text-[22px] max-md:[&_.mp-rh-kpi-sub]:!text-[9.5px]">
        <RHKpi
          label="Usuarios totales"
          value={fmtCompact(data.kpis.mau)}
          sub="profiles registrados"
          delta="—"
          deltaPos
        />
        <RHKpi
          label="GMV · este mes"
          value={fmtCompactUSD(data.kpis.gmvCents)}
          sub="Reservas + tiendas + eventos"
          delta={deltaLabel}
          deltaPos={deltaPos}
          accent="var(--primary)"
        />
        <RHKpi
          label="Clubes activos"
          value={String(data.kpis.clubsActive)}
          sub={`${data.kpis.clubsThisWeek} nuevos esta semana`}
          delta={data.kpis.clubsThisWeek > 0 ? `↑ ${data.kpis.clubsThisWeek}` : "—"}
          deltaPos
        />
        <RHKpi
          label="Matches jugados"
          value={data.kpis.matchesWeek.toLocaleString("en-US")}
          sub="Esta semana · todos los deportes"
          delta="—"
          deltaPos
        />
      </div>

      <div className="mp-admin-split-panels">
        <RHPanel
          title="Actividad en vivo"
          action={
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
            >
              Ver todo
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hasActivity
              ? data.activity.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      gap: 11,
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: a.color,
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={a.i} size={14} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: 3,
                            background: a.color,
                            color: "#fff",
                            fontSize: 8,
                            fontWeight: 900,
                            letterSpacing: "0.12em",
                          }}
                        >
                          {a.tag}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            color: a.when === "live" ? "#dc2626" : "var(--muted-fg)",
                            fontWeight: 700,
                          }}
                        >
                          {a.when === "live" ? "● EN VIVO" : a.when}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{a.t}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{a.s}</div>
                    </div>
                  </div>
                ))
              : Array.from({ length: ACTIVITY_PLACEHOLDER_COUNT }).map((_, k) => (
                  <ActivityPlaceholder key={k} />
                ))}
          </div>
        </RHPanel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <RHPanel
            title="Cola moderación"
            action={
              <span
                style={{
                  fontSize: 10,
                  padding: "3px 8px",
                  borderRadius: 9999,
                  background: data.queueTotal > 0 ? "#fee2e2" : "var(--muted)",
                  color: data.queueTotal > 0 ? "#dc2626" : "var(--muted-fg)",
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {data.queueTotal} pendiente{data.queueTotal === 1 ? "" : "s"}
              </span>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hasQueue
                ? data.queue.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "var(--muted)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{m.t}</span>
                      <span
                        style={{
                          fontSize: 8.5,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background:
                            m.sev === "alta"
                              ? "#dc2626"
                              : m.sev === "media"
                              ? "#fbbf24"
                              : "var(--muted-fg)",
                          color: "#fff",
                          fontWeight: 900,
                          letterSpacing: "0.12em",
                        }}
                      >
                        {m.sev}
                      </span>
                    </div>
                  ))
                : Array.from({ length: QUEUE_PLACEHOLDER_COUNT }).map((_, k) => (
                    <QueuePlaceholder key={k} />
                  ))}
            </div>
          </RHPanel>
        </div>
      </div>
    </>
  );
}
