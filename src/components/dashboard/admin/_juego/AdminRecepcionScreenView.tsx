"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../../useRealtimeRefresh";
import { AJHero, AJKpiStrip } from "./components";
import type { AdminReceptionOverview } from "@/server/actions/admin/reception";

function money(cents: number, currency = "USD"): string {
  const value = (cents / 100).toFixed(2);
  return currency === "USD" ? `$${value}` : `${value} ${currency}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "15px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h2
          className="font-heading"
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {title}<span className="dot">.</span>
        </h2>
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
      <Icon name="check-circle-2" size={20} color="var(--muted-fg)" />
      <div style={{ marginTop: 8 }}>{label}</div>
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        boxShadow: "0 0 0 4px rgba(16,185,129,0.12)",
      }}
    />
  );
}

export function AdminRecepcionScreenView({ data }: { data: AdminReceptionOverview }) {
  useRealtimeRefresh(
    [
      { table: "walkins" },
      { table: "check_ins" },
      { table: "cash_sessions" },
      { table: "transactions" },
      { table: "products" },
      { table: "sales" },
      { table: "inventory_movements" },
    ],
    { debounceMs: 1200 },
  );

  const stats = [
    { v: data.kpis.activeWalkins, l: "Walk-ins en cola", highlight: data.kpis.activeWalkins > 0 },
    { v: data.kpis.checkinsToday, l: "Check-ins hoy" },
    { v: data.kpis.openCashSessions, l: "Cajas abiertas", highlight: data.kpis.openCashSessions === 0 },
    { v: money(data.kpis.capturedTodayCents), l: "Caja capturada" },
    { v: money(data.kpis.proshopTodayCents), l: "Pro shop hoy" },
    { v: data.kpis.lowStockProducts, l: "Bajo stock", highlight: data.kpis.lowStockProducts > 0 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AJHero
        chipText=""
        title="Recepción cross-club"
        sub="Visibilidad operativa de walk-ins, check-in, caja y tienda. Esta pantalla no replica el POS de empleados ni ejecuta cobros."
        wordmark="FRONT"
        bg="linear-gradient(135deg,#0a0a0a,#14532d 48%,#10b981)"
        accent="#86efac"
      />

      <AJKpiStrip stats={stats} />

      <div className="card" style={{ padding: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon name="shield-check" size={18} color="var(--primary)" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 900 }}>Alcance admin read-only</div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
            Para operar usa las pantallas del club o del empleado. Aquí solo se monitorean señales cross-club y se
            derivan casos hacia `admin-reservas` o `admin-pagos` cuando hace falta soporte.
          </div>
        </div>
      </div>

      <Section title="Clubes activos" subtitle="ordenados por urgencia operativa">
        {data.clubs.length === 0 ? (
          <EmptyState label="No hay señales de recepción para hoy." />
        ) : (
          <div className="mp-table-scroll">
            <div style={{ minWidth: 860 }}>
              <div
                className="mp-table-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr repeat(6, 1fr)",
                  gap: 12,
                  padding: "10px 16px",
                  background: "var(--muted)",
                  fontSize: 9.5,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                }}
              >
                <span>Club</span>
                <span>Walk-ins</span>
                <span>Check-ins</span>
                <span>Caja</span>
                <span>Capturado</span>
                <span>Pro shop</span>
                <span>Bajo stock</span>
              </div>
              {data.clubs.map((club, index) => (
                <div
                  key={club.clubId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr repeat(6, 1fr)",
                    gap: 12,
                    padding: "12px 16px",
                    borderTop: index === 0 ? 0 : "1px solid var(--border)",
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{club.clubName}</div>
                    <div style={{ color: "var(--muted-fg)", marginTop: 2 }}>{club.city}</div>
                  </div>
                  <b style={{ color: club.activeWalkins > 0 ? "#dc2626" : "var(--fg)" }}>{club.activeWalkins}</b>
                  <b>{club.checkinsToday}</b>
                  <b style={{ color: club.openCashSessions > 0 ? "var(--primary)" : "#b45309" }}>
                    {club.openCashSessions}
                  </b>
                  <span className="tabular">{money(club.capturedTodayCents)}</span>
                  <span className="tabular">{money(club.proshopTodayCents)}</span>
                  <b style={{ color: club.lowStockProducts > 0 ? "#dc2626" : "var(--fg)" }}>
                    {club.lowStockProducts}
                  </b>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <div className="mp-grid-form-2 gap-4" style={{ alignItems: "start" }}>
        <Section title="Walk-ins" subtitle="cola abierta de hoy">
          {data.activeWalkins.length === 0 ? (
            <EmptyState label="Sin walk-ins activos." />
          ) : (
            data.activeWalkins.map((w, index) => (
              <div
                key={w.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr auto",
                  gap: 10,
                  padding: "12px 16px",
                  borderTop: index === 0 ? 0 : "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div
                  className="font-heading"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: index === 0 ? "#dc2626" : "#0a0a0a",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>{w.customer}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                    {w.club} · {w.partySize}p · {w.durationMinutes} min{w.sport ? ` · ${w.sport}` : ""}
                  </div>
                </div>
                <b style={{ fontSize: 11, color: index === 0 ? "#dc2626" : "var(--muted-fg)" }}>
                  {minutesLabel(w.waitMinutes)}
                </b>
              </div>
            ))
          )}
        </Section>

        <Section title="Check-in" subtitle="últimos scans manuales o QR">
          {data.recentCheckins.length === 0 ? (
            <EmptyState label="Sin check-ins registrados hoy." />
          ) : (
            data.recentCheckins.map((c, index) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "12px 16px",
                  borderTop: index === 0 ? 0 : "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusDot color={c.method === "qr" ? "var(--primary)" : "#0ea5e9"} />
                    <b style={{ fontSize: 12.5 }}>{c.target}</b>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>
                    {c.club} · {c.scannedBy} · {c.method}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 800 }}>
                  {timeLabel(c.scannedAt)}
                </span>
              </div>
            ))
          )}
        </Section>
      </div>

      <div className="mp-grid-form-2 gap-4" style={{ alignItems: "start" }}>
        <Section title="Caja" subtitle="sesiones abiertas y efectivo capturado">
          {data.openCashSessions.length === 0 ? (
            <EmptyState label="No hay cajas abiertas." />
          ) : (
            data.openCashSessions.map((s, index) => (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "12px 16px",
                  borderTop: index === 0 ? 0 : "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>{s.club}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                    Abierta por {s.openedBy} · {timeLabel(s.openedAt)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900 }}>
                    {money(s.cashCapturedCents)}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>
                    base {money(s.openingFloatCents)}
                  </div>
                </div>
              </div>
            ))
          )}
        </Section>

        <Section title="Pro shop" subtitle="ventas recientes">
          {data.recentSales.length === 0 ? (
            <EmptyState label="Sin ventas de tienda hoy." />
          ) : (
            data.recentSales.map((s, index) => (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "12px 16px",
                  borderTop: index === 0 ? 0 : "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>{s.club}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                    {s.customer} · vendido por {s.soldBy} · {timeLabel(s.createdAt)}
                  </div>
                </div>
                <b className="font-heading tabular" style={{ color: "var(--primary)", fontSize: 14 }}>
                  {money(s.totalCents, s.currency)}
                </b>
              </div>
            ))
          )}
        </Section>
      </div>

      <Section title="Bajo stock" subtitle="productos activos bajo el mínimo configurado">
        {data.lowStockProducts.length === 0 ? (
          <EmptyState label="Sin alertas de stock." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, padding: 16 }}>
            {data.lowStockProducts.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(220,38,38,0.24)",
                  background: "rgba(220,38,38,0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusDot color="#dc2626" />
                  <b style={{ fontSize: 12.5 }}>{p.name}</b>
                </div>
                <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--muted-fg)" }}>
                  {p.club}{p.sku ? ` · SKU ${p.sku}` : ""}
                </div>
                <div className="font-heading tabular" style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>
                  {p.stock}
                  <span style={{ fontSize: 11, color: "var(--muted-fg)", marginLeft: 4 }}>/ mín {p.threshold}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
