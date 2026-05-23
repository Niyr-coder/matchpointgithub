// Client view de OwnerHome — layout 1:1 del mock, valores reales o "—" / empty
// state cuando no hay data. Nunca mostrar mocks como fallback.
"use client";
import { Fragment } from "react";
import { Icon } from "@/components/Icon";
import { RHKpi, RHPanel, RHWelcome } from "../widgets/RH";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type OwnerHomeData = {
  clubId: string | null;
  clubName: string;
  hasClub: boolean;
  userName: string | null;
  clubCity: string | null;
  revenueHoyCents: number;
  todayCount: number;
  ocupacionPct: number;
  sociosCount: number;
  courtsCount: number;
  calendarCourts: string[];
  calendarHours: string[];
  cellState: Record<string, "reserved" | "event" | "class" | "free">;
  revenueBars: number[];
  revenueWeekCents: number;
  events: { d: string; m: string; name: string; sub: string; tag: string }[];
  staff: { name: string; role: string; online: boolean }[];
  ratingAvg: number | null;
  ratingCount: number;
  membersVipCount: number;
  membersVipPending: number;
};

const STAFF_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#7c3aed", "#dc2626", "#737373"];

function money(cents: number): string {
  if (cents === 0) return "$0";
  const n = cents / 100;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString("es-EC")}`;
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function PanelEmpty({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div
      style={{
        padding: "24px 16px",
        textAlign: "center",
        color: "var(--muted-fg)",
        background: "var(--muted)",
        borderRadius: 10,
      }}
    >
      <Icon name={icon} size={24} color="var(--muted-fg)" />
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          marginTop: 8,
          color: "#0a0a0a",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5, maxWidth: 280, margin: "4px auto 0" }}>
        {sub}
      </div>
    </div>
  );
}

export function OwnerHomeView({ data }: { data: OwnerHomeData }) {
  // Realtime: cualquier cambio en reservas/torneos del club dispara re-fetch.
  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
          { table: "tournaments", filter: `club_id=eq.${data.clubId}` },
          { table: "role_assignments", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const calendarCourts = data.calendarCourts.slice(0, 4);
  const hasCalendarCourts = calendarCourts.length > 0;
  const calendarHours = data.calendarHours;
  const hasRevenue = data.revenueBars.some((b) => b > 0);
  const revenueBars = hasRevenue
    ? data.revenueBars
    : data.revenueBars.map(() => 0);

  return (
    <>
      <RHWelcome
        role="owner"
        userName={data.userName}
        contextLabel={
          data.hasClub
            ? [data.clubName, data.clubCity].filter(Boolean).join(" · ")
            : null
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
        <RHKpi
          label="Revenue hoy"
          value={money(data.revenueHoyCents)}
          sub={data.todayCount > 0 ? `${data.todayCount} ${data.todayCount === 1 ? "reserva" : "reservas"}` : "Sin reservas aún"}
          accent="var(--primary)"
        />
        <RHKpi
          label="Ocupación"
          value={`${data.ocupacionPct}%`}
          sub={
            data.courtsCount > 0
              ? `${data.todayCount} / ${data.courtsCount * 16} horas reservadas`
              : "Sin canchas registradas"
          }
        />
        <RHKpi
          label="Socios activos"
          value={String(data.sociosCount)}
          sub={data.sociosCount > 0 ? "últimos 30 días" : "Aún sin actividad"}
        />
        <RHKpi
          label="Rating club"
          value={data.ratingAvg != null ? data.ratingAvg.toFixed(1) : "—"}
          sub={data.ratingCount > 0 ? `${data.ratingCount} ${data.ratingCount === 1 ? "reseña" : "reseñas"}` : "Aún sin reseñas"}
        />
        <RHKpi
          label="Membresías VIP"
          value={String(data.membersVipCount)}
          sub={
            data.membersVipPending > 0
              ? `${data.membersVipPending} ${data.membersVipPending === 1 ? "pendiente" : "pendientes"} de aprobación`
              : "Sin solicitudes"
          }
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <RHPanel
          title="Calendario · hoy"
          action={
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
            >
              Ver semana
            </button>
          }
        >
          {hasCalendarCourts ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px repeat(4, 1fr)",
                  gap: 4,
                }}
              >
                <div />
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      textAlign: "center",
                      color: "var(--muted-fg)",
                      letterSpacing: "0.14em",
                      padding: "4px 0",
                    }}
                  >
                    {calendarCourts[i] ?? "—"}
                  </div>
                ))}
                {calendarHours.map((h) => (
                  <Fragment key={h}>
                    <div
                      style={{
                        fontSize: 10,
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
                    {[0, 1, 2, 3].map((c) => {
                      const hasCourt = c < calendarCourts.length;
                      const state = hasCourt
                        ? (data.cellState[`${h}-${c}`] ?? "free")
                        : "free";
                      const palette: Record<string, [string, string, string]> = {
                        event: ["#fef3c7", "#92400e", "EVT"],
                        reserved: ["var(--primary)", "#fff", "BOOK"],
                        free: ["#fff", "var(--muted-fg)", "—"],
                        class: ["#7c3aed", "#fff", "CLASE"],
                      };
                      const [bg, col, lbl] = palette[state];
                      return (
                        <div
                          key={c}
                          style={{
                            height: 28,
                            borderRadius: 4,
                            background: bg,
                            color: col,
                            fontSize: 9,
                            fontWeight: 800,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: state === "free" ? "1px dashed var(--border)" : 0,
                            opacity: hasCourt ? 1 : 0.4,
                          }}
                        >
                          {lbl}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 12,
                  fontSize: 10.5,
                  color: "var(--muted-fg)",
                }}
              >
                <span>
                  ● <b style={{ color: "#0a0a0a" }}>{data.todayCount} reservas</b>
                </span>
                <span style={{ marginLeft: "auto" }}>Ocupación · {data.ocupacionPct}%</span>
              </div>
            </>
          ) : (
            <PanelEmpty
              icon="square"
              title="Sin canchas registradas"
              sub="Agrega canchas en Canchas para ver el calendario operativo."
            />
          )}
        </RHPanel>

        <RHPanel title="Próximos eventos">
          {data.events.length === 0 ? (
            <PanelEmpty
              icon="calendar"
              title="Sin eventos publicados"
              sub="Cuando publiques un torneo aparecerá aquí con cupos en vivo."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.events.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 11,
                    padding: 10,
                    border: i === 0 ? "2px solid var(--primary)" : "1px solid var(--border)",
                    borderRadius: 10,
                    background: i === 0 ? "#ecfdf5" : "#fff",
                    alignItems: "center",
                  }}
                >
                  <div style={{ width: 38, textAlign: "center", flexShrink: 0 }}>
                    <div
                      className="font-heading"
                      style={{ fontSize: 18, fontWeight: 900, lineHeight: 0.9 }}
                    >
                      {e.d}
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        fontWeight: 900,
                        color: "var(--muted-fg)",
                        letterSpacing: "0.16em",
                      }}
                    >
                      {e.m}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 900,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{e.sub}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 8.5,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: "var(--muted)",
                      fontWeight: 900,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {e.tag}
                  </span>
                </div>
              ))}
            </div>
          )}
        </RHPanel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <RHPanel
          title="Revenue · últimos 7 días"
          action={
            <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 800 }}>
              {money(data.revenueWeekCents)} total
            </span>
          }
        >
          {hasRevenue ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
                height: 140,
                paddingTop: 10,
              }}
            >
              {revenueBars.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: Math.max(4, h),
                      background:
                        i === 6 ? "var(--primary)" : i === 5 ? "#34d399" : "#0a0a0a",
                      borderRadius: "4px 4px 0 0",
                    }}
                  />
                  <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-fg)" }}>
                    {["L", "M", "M", "J", "V", "S", "D"][i]}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PanelEmpty
              icon="bar-chart-3"
              title="Sin revenue todavía"
              sub="Cuando entren las primeras reservas, verás la barra diaria aquí."
            />
          )}
        </RHPanel>

        <RHPanel title="Staff · ahora">
          {data.staff.length === 0 ? (
            <PanelEmpty
              icon="users"
              title="Aún no hay staff invitado"
              sub="Invita a tu manager, recepción o coach desde Staff."
            />
          ) : (
            data.staff.map((p, i) => (
              <div
                key={p.name + i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "7px 0",
                  borderTop: i === 0 ? "0" : "1px dashed var(--border)",
                }}
              >
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: STAFF_COLORS[i % STAFF_COLORS.length],
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Plus Jakarta Sans",
                      fontWeight: 900,
                      fontSize: 10,
                    }}
                  >
                    {initials(p.name)}
                  </div>
                  {p.online && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: -1,
                        right: -1,
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: "var(--primary)",
                        border: "2px solid #fff",
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{p.role}</div>
                </div>
              </div>
            ))
          )}
        </RHPanel>
      </div>

      <span style={{ display: "none" }}>
        <Icon name="building-2" size={1} />
      </span>
    </>
  );
}
