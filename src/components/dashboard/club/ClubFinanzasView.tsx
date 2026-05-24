"use client";
// Club Owner · Finanzas v2 — command center financiero. Fase 1 cableada a
// datos reales vía ClubFinanzasScreen (KPIs, 30-day stack, sources, txns,
// payouts calendar, hero waterfall). Mantiene mock para Fase 2/3 (ranking
// por cancha, heatmap $/hora) y para fuentes que aún no tienen tabla
// (cuenta bancaria destino, pagos a staff). Botones con toast "próximamente".
// Ver docs/product/02-payments.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";

export type FinanzasData = {
  clubId: string | null;
  period: "hoy" | "sem" | "mes" | "anio";
  revenueGrossCents: number;
  revenuePrevCents: number;
  monthGross: number;
  totalDeltaCents: number;
  ticketAvgCents: number;
  ticketPrevCents: number;
  arpuMemberCents: number;
  activeMembersCount: number;
  refundRatePct: number;
  refundCount: number;
  txnCount: number;
  stack30: Array<{ reservations: number; events: number; classes: number; proshop: number }>;
  sources: {
    reservations: { cents: number; count: number; pct: number; deltaPct: number };
    events: { cents: number; count: number; pct: number; deltaPct: number };
    classes: { cents: number; count: number; pct: number; deltaPct: number };
    proshop: { cents: number; count: number; pct: number; deltaPct: number };
  };
  txns: Array<{
    id: string;
    timeHM: string;
    who: string;
    initials: string;
    kind: string;
    sub: string;
    amountCents: number;
    method: string;
    status: "ok" | "refund" | "hold";
  }>;
  payouts: Array<{
    id: string;
    label: string;
    when: string;
    netCents: number;
    status: "PROGRAMADO" | "PAGADO" | "ESTIMADO";
  }>;
  nextPayout: {
    netCents: number;
    scheduledFor: string | null;
    grossCents: number;
    commissionCents: number;
    refundsCents: number;
    deltaPct: number;
  } | null;
  courtRanking: Array<{
    id: string;
    n: number;
    t: string;
    tag: string;
    revenueCents: number;
    reservationsCount: number;
    avgTicketCents: number;
    occ: number;
    color: string;
  }>;
};

function fmtMoney(cents: number, sign: "" | "-" = ""): string {
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}
function fmtDeltaPct(pct: number): string {
  if (pct === 0) return "0%";
  const arrow = pct > 0 ? "+" : "−";
  return `${arrow}${Math.abs(pct)}%`;
}
const HEATMAP = [
  [0, 0, 0, 0, 0, 8, 18, 28, 22, 18, 32, 42, 40, 32, 28, 30, 52, 68, 72, 68, 52, 28, 12, 0],
  [0, 0, 0, 0, 0, 6, 15, 25, 20, 15, 28, 40, 38, 30, 25, 28, 48, 65, 70, 65, 48, 25, 10, 0],
  [0, 0, 0, 0, 0, 6, 16, 26, 20, 16, 30, 42, 40, 32, 26, 30, 50, 68, 72, 68, 50, 28, 12, 0],
  [0, 0, 0, 0, 0, 8, 18, 28, 22, 18, 32, 45, 42, 32, 28, 32, 52, 70, 75, 72, 52, 28, 12, 0],
  [0, 0, 0, 0, 0, 10, 22, 32, 28, 22, 38, 52, 48, 40, 32, 38, 62, 82, 88, 85, 72, 42, 22, 8],
  [0, 0, 0, 0, 0, 15, 32, 52, 68, 80, 92, 98, 95, 88, 72, 68, 82, 95, 95, 82, 68, 48, 28, 12],
  [0, 0, 0, 0, 0, 12, 28, 48, 62, 75, 88, 95, 92, 82, 68, 62, 75, 88, 88, 72, 52, 32, 18, 8],
];
const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const KIND_BG: Record<string, string> = { Reserva: "#10b981", Inscripción: "#fbbf24", Clase: "#0c4a6e", "Pro shop": "#7c3aed", Reembolso: "#dc2626", Disputa: "#a1a1aa" };
const KIND_INIT_BG: Record<string, string> = { Reserva: "#10b981", Inscripción: "#fbbf24", Clase: "#0c4a6e", "Pro shop": "#7c3aed", Reembolso: "#dc2626" };
const HEAT_C = (v: number) => (v > 80 ? "var(--primary)" : v > 50 ? "#34d399" : v > 25 ? "#fde68a" : v > 5 ? "#fef3c7" : "#fafafa");

const PERIOD_LABEL: Record<string, string> = { hoy: "Hoy", sem: "Esta semana", mes: "Este mes", anio: "Este año" };

// Estados de payout → color visual (preserva el mapping del mock previo).
const PAYOUT_STATUS_COLOR: Record<"PROGRAMADO" | "PAGADO" | "ESTIMADO", string> = {
  PROGRAMADO: "var(--primary)",
  PAGADO: "#a1a1aa",
  ESTIMADO: "#0a0a0a",
};

export function ClubFinanzasView({ data }: { data: FinanzasData }) {
  const toast = useToast();
  // Period selector aún visual-only: Fase 3 lo cablea a refetch con searchParams.
  const [period, setPeriod] = useState(data.period);
  const soon = (title: string) => toast({ icon: "sparkles", title });

  // ── Waterfall derivado del próximo payout (o ceros si no hay) ──
  const np = data.nextPayout;
  const heroNet = fmtMoney(np?.netCents ?? 0);
  const heroDelta = np ? `${np.deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(np.deltaPct)}% vs sem ant` : "";
  // Pagos a staff: aún sin fuente (no hay payroll). Queda en $0 hasta que
  // exista club_payroll / staff_payments.
  const staffPayCents = 0;
  const refundsForPayout = np?.refundsCents ?? 0;
  const waterfall = [
    { l: "Revenue bruto", v: fmtMoney(np?.grossCents ?? 0), sign: "+", color: "#fff", sub: undefined as string | undefined, bold: false },
    { l: "Comisión MATCHPOINT · 10%", v: fmtMoney(np?.commissionCents ?? 0, "-"), sign: "–", color: "#dc2626", sub: "sobre revenue bruto", bold: false },
    { l: "Pagos a staff", v: fmtMoney(staffPayCents, "-"), sign: "–", color: "#fbbf24", sub: "sin payroll · próximamente", bold: false },
    { l: `Reembolsos${data.refundCount ? ` · ${data.refundCount} txns` : ""}`, v: fmtMoney(refundsForPayout, "-"), sign: "–", color: "#a1a1aa", sub: refundsForPayout === 0 ? "absorbidos por MP" : undefined, bold: false },
    { l: "Neto al banco", v: heroNet, sign: "=", color: "var(--primary)", sub: undefined, bold: true },
  ];

  // ── KPIs 2×2 derivados ──
  const ticketDeltaCents = data.ticketAvgCents - data.ticketPrevCents;
  const ticketDeltaSign = ticketDeltaCents >= 0 ? "↑" : "↓";
  const revenueDeltaPct = data.revenuePrevCents > 0
    ? Math.round(((data.revenueGrossCents - data.revenuePrevCents) / data.revenuePrevCents) * 100)
    : 0;
  const kpis = [
    { l: "Revenue bruto · mes", v: fmtMoney(data.revenueGrossCents), sub: `${fmtDeltaPct(revenueDeltaPct)} vs mes pasado`, color: "var(--primary)", icon: "trending-up" },
    { l: "Ticket promedio", v: fmtMoney(data.ticketAvgCents), sub: `${ticketDeltaSign} ${fmtMoney(Math.abs(ticketDeltaCents))} vs mes pasado`, color: "#0a0a0a", icon: "receipt" },
    { l: "ARPU socio", v: fmtMoney(data.arpuMemberCents), sub: `${data.activeMembersCount} socios · /mes`, color: "#0a0a0a", icon: "users" },
    { l: "Refund rate", v: `${data.refundRatePct}%`, sub: `${data.refundCount} de ${data.txnCount} txns`, color: "#dc2626", icon: "undo-2" },
  ];

  // ── 30-day stacked ──
  const stack30 = data.stack30.map((d) => [d.reservations, d.events, d.classes, d.proshop]);
  const max30 = Math.max(1, ...stack30.map((s) => s.reduce((a, b) => a + b, 0)));
  const dDeltaPrefix = data.totalDeltaCents >= 0 ? "↑" : "↓";
  const dDeltaLabel = `${dDeltaPrefix} ${fmtMoney(data.totalDeltaCents)} vs mes pasado`;

  // ── Sources cards (4 fuentes reales) ──
  function srcSub(b: { count: number; cents: number }, unit: "reservas" | "torneos" | "clases" | "órdenes"): string {
    if (b.count === 0) return "Sin movimientos este mes";
    const avg = Math.round(b.cents / b.count / 100);
    return `${b.count} ${unit} · $${avg} prom`;
  }
  const sources = [
    { k: "Reservas de canchas", v: fmtMoney(data.sources.reservations.cents), p: data.sources.reservations.pct, delta: fmtDeltaPct(data.sources.reservations.deltaPct), good: data.sources.reservations.deltaPct >= 0, icon: "land-plot", color: "#10b981", sub: srcSub(data.sources.reservations, "reservas") },
    { k: "Eventos & torneos", v: fmtMoney(data.sources.events.cents), p: data.sources.events.pct, delta: fmtDeltaPct(data.sources.events.deltaPct), good: data.sources.events.deltaPct >= 0, icon: "trophy", color: "#0a0a0a", sub: srcSub(data.sources.events, "torneos") },
    { k: "Clases con coach", v: fmtMoney(data.sources.classes.cents), p: data.sources.classes.pct, delta: fmtDeltaPct(data.sources.classes.deltaPct), good: data.sources.classes.deltaPct >= 0, icon: "graduation-cap", color: "#0c4a6e", sub: srcSub(data.sources.classes, "clases") },
    { k: "Pro shop", v: fmtMoney(data.sources.proshop.cents), p: data.sources.proshop.pct, delta: fmtDeltaPct(data.sources.proshop.deltaPct), good: data.sources.proshop.deltaPct >= 0, icon: "shopping-bag", color: "#7c3aed", sub: srcSub(data.sources.proshop, "órdenes") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolHero
        tone="dark"
        wm="$$$$"
        accent="#10b981"
        label={"Club · Finanzas · " + PERIOD_LABEL[period]}
        title="Las cuentas claras"
        sub="Tu revenue, tus payouts, y dónde está cada dólar. De la pelota a tu banco, sin sorpresas."
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", padding: 3, borderRadius: 9999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
              {([["hoy", "Hoy"], ["sem", "Semana"], ["mes", "Mes"], ["anio", "Año"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setPeriod(k)} style={{ padding: "6px 12px", borderRadius: 9999, background: period === k ? "#fff" : "transparent", color: period === k ? "#0a0a0a" : "rgba(255,255,255,0.7)", border: 0, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
              ))}
            </div>
            <button className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }} onClick={() => soon("Estado de cuenta · próximamente")}>
              <Icon name="file-text" size={13} color="#fff" />Estado de cuenta
            </button>
            <button className="btn btn-primary" onClick={() => toast({ icon: "download", title: "CSV exportado (demo)" })}>
              <Icon name="download" size={13} color="#fff" />Exportar CSV
            </button>
          </div>
        }
      />

      {/* 2. Hero net payout + 2×2 KPIs */}
      <div className="mp-fin-hero" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 26, background: "linear-gradient(135deg, #0a0a0a 0%, #052e24 70%, #10b981 220%)", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -10, right: -10, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.35), transparent 70%)", filter: "blur(20px)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>● Próximo payout {np ? `· ${data.payouts.find((p) => p.status === "PROGRAMADO")?.label ?? ""}` : ""}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
                  <span className="font-heading tabular" style={{ fontSize: 76, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 0.85, color: "var(--primary)" }}>{heroNet}</span>
                  {heroDelta && (
                    <span style={{ fontSize: 14, color: "var(--primary)", fontWeight: 900, padding: "4px 10px", borderRadius: 9999, background: "rgba(16,185,129,0.18)" }}>{heroDelta}</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 10 }}>
                  {np?.scheduledFor ? (
                    <><b style={{ color: "#fff" }}>Llega {new Date(np.scheduledFor).toLocaleString("es-EC", { weekday: "long", hour: "2-digit", minute: "2-digit" })}</b> · cuenta destino sin configurar</>
                  ) : (
                    <>Sin payout programado · cuenta destino sin configurar</>
                  )}
                </div>
              </div>
              <button className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", fontSize: 10 }} onClick={() => soon("Cambiar cuenta · próximamente")}>Cambiar cuenta</button>
            </div>

            <div style={{ marginTop: 26, padding: 16, background: "rgba(0,0,0,0.3)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>De {fmtMoney(np?.grossCents ?? 0)} a tu cuenta — paso a paso</div>
              {waterfall.map((r, i) => (
                <div key={r.l} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i === 0 ? 0 : "1px dashed rgba(255,255,255,0.1)" }}>
                  <span className="font-heading" style={{ fontSize: 16, fontWeight: 900, color: r.sign === "+" ? "var(--primary)" : r.sign === "–" ? "#dc2626" : "#fff", textAlign: "center" }}>{r.sign}</span>
                  <div>
                    <div style={{ fontSize: r.bold ? 13 : 12, color: r.bold ? "#fff" : "rgba(255,255,255,0.85)", fontWeight: r.bold ? 900 : 700 }}>{r.l}</div>
                    {r.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{r.sub}</div>}
                  </div>
                  <span className="font-heading tabular" style={{ fontSize: r.bold ? 22 : 15, fontWeight: 900, letterSpacing: "-0.025em", color: r.color }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mp-fin-kpis" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, gridTemplateRows: "1fr 1fr" }}>
          {kpis.map((k) => (
            <div key={k.l} className="card" style={{ padding: 16, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, background: k.color === "var(--primary)" ? "rgba(16,185,129,0.1)" : "var(--muted)", color: k.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={k.icon} size={15} color={k.color} />
              </div>
              <div className="label-mp" style={{ paddingRight: 40 }}>{k.l}</div>
              <div className="font-heading tabular" style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.035em", marginTop: 10, color: k.color }}>{k.v}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700, marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Revenue 30 días stacked */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="label-mp">Revenue · últimos 30 días</div>
            <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", margin: "4px 0 0" }}>Cómo viene el mes<span className="dot">.</span></h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {([["Reservas", "#10b981"], ["Eventos", "#0a0a0a"], ["Clases", "#0c4a6e"], ["Shop", "#7c3aed"]] as const).map(([l, c]) => (
              <div key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: c }} /> {l}
              </div>
            ))}
            <span style={{ fontSize: 11, fontWeight: 900, color: "var(--primary)", padding: "4px 10px", borderRadius: 9999, background: "rgba(16,185,129,0.1)" }}>{dDeltaLabel}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 200, paddingTop: 8, borderBottom: "1px solid var(--border)" }}>
          {stack30.map((day, i) => {
            const total = day.reduce((a, b) => a + b, 0);
            const h = (total / max30) * 190;
            const isToday = i === 29;
            const colors = ["#10b981", "#0a0a0a", "#0c4a6e", "#7c3aed"];
            return (
              <div key={i} style={{ flex: 1, height: h, display: "flex", flexDirection: "column-reverse", position: "relative", outline: isToday ? "2px solid var(--primary)" : "none", outlineOffset: 2, borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                {total > 0 && day.map((v, si) => (
                  <div key={si} style={{ height: (v / total) * 100 + "%", background: colors[si], opacity: i < 5 ? 0.55 : 1 }} />
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em" }}>
          <span>23 ABR</span><span>30 ABR</span><span>7 MAY</span><span>14 MAY</span><span style={{ color: "var(--primary)" }}>HOY · 22 MAY</span>
        </div>
      </div>

      {/* 4. Revenue por fuente */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>De dónde sale la plata<span className="dot">.</span></h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>4 fuentes · este mes</span>
        </div>
        <div className="mp-fin-sources" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {sources.map((s) => (
            <div key={s.k} className="card" style={{ padding: 18, position: "relative", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: s.color === "#10b981" ? "rgba(16,185,129,0.12)" : s.color === "#0a0a0a" ? "var(--muted)" : s.color === "#7c3aed" ? "rgba(124,58,237,0.1)" : "rgba(12,74,110,0.1)", color: s.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={s.icon} size={18} color={s.color} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 900, color: s.good ? "var(--primary)" : "#dc2626" }}>{s.delta}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 14 }}>{s.k}</div>
              <div className="font-heading tabular" style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.035em", marginTop: 4 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{s.sub}</div>
              <div style={{ marginTop: 12, height: 5, background: "var(--muted)", borderRadius: 9999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: s.p + "%", background: s.color }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 800, marginTop: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>{s.p}% del total</div>
            </div>
          ))}
        </div>
      </div>

      {/* 5+6. Por cancha + Heatmap */}
      <div className="mp-fin-split" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="label-mp">Ranking · revenue por cancha</div>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 16px" }}>Tus 5 canchas<span className="dot">.</span></h2>
          {data.courtRanking.length === 0 && (
            <div style={{ padding: "12px 0", fontSize: 11.5, color: "var(--muted-fg)" }}>
              Sin reservas registradas este mes.
            </div>
          )}
          {data.courtRanking.map((c, i) => {
            const max = Math.max(1, ...data.courtRanking.map((x) => x.revenueCents));
            const w = (c.revenueCents / max) * 100;
            return (
              <div key={c.id} style={{ padding: "12px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div className="font-heading" style={{ width: 24, height: 24, borderRadius: 6, background: i === 0 ? "var(--primary)" : "var(--muted)", color: i === 0 ? "#fff" : "#0a0a0a", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>#{c.n}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{c.t}</div>
                    <div style={{ fontSize: 9, color: c.color, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>● {c.tag}</div>
                  </div>
                  <div className="font-heading tabular" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.025em", color: "var(--primary)" }}>{fmtMoney(c.revenueCents)}</div>
                </div>
                <div style={{ height: 6, background: "var(--muted)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: w + "%", background: c.color }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 700 }}>
                  <span>Ocupación {c.occ}%</span>
                  <span>{c.reservationsCount} reservas · prom {fmtMoney(c.avgTicketCents)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div className="label-mp">$ por hora · semana típica</div>
              <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Cuándo entra la plata<span className="dot">.</span></h2>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>Pico actual: <b style={{ color: "#0a0a0a" }}>sáb 18:00 · $98/h</b></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>$0</span>
              {[8, 30, 55, 80, 100].map((t) => (
                <div key={t} style={{ width: 20, height: 10, background: HEAT_C(t), border: "1px solid var(--border)" }} />
              ))}
              <span>$100+</span>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 460 }}>
              <div style={{ display: "grid", gridTemplateColumns: "32px repeat(24, 1fr)", gap: 2, marginBottom: 3 }}>
                <div />
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} style={{ fontSize: 8, textAlign: "center", color: "var(--muted-fg)", fontWeight: 700 }}>{i % 3 === 0 ? i : ""}</div>
                ))}
              </div>
              {HEATMAP.map((row, di) => (
                <div key={di} style={{ display: "grid", gridTemplateColumns: "32px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted-fg)", textAlign: "right", paddingRight: 4, display: "flex", alignItems: "center", justifyContent: "flex-end", letterSpacing: "0.08em" }}>{DAYS[di]}</div>
                  {row.map((v, hi) => (
                    <div key={hi} title={DAYS[di] + " " + hi + ":00 · $" + v + "/h"} style={{ height: 18, background: HEAT_C(v), borderRadius: 2 }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 7+8. Transacciones + Payouts */}
      <div className="mp-fin-split" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div className="label-mp">Movimientos · hoy</div>
              <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Últimas transacciones<span className="dot">.</span></h2>
            </div>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => soon("Ver todas las transacciones · próximamente")}>Ver todo<Icon name="arrow-right" size={11} /></button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 560 }}>
              {data.txns.length === 0 && (
                <div style={{ padding: "22px", fontSize: 11.5, color: "var(--muted-fg)", textAlign: "center" }}>
                  Sin movimientos hoy.
                </div>
              )}
              {data.txns.map((t, i) => {
                const amtStr = (t.amountCents >= 0 ? "+" : "−") + fmtMoney(Math.abs(t.amountCents));
                return (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "52px 1fr 90px 110px 80px", gap: 12, alignItems: "center", padding: "12px 22px", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                    <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.timeHM}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: KIND_INIT_BG[t.kind] ?? "#a1a1aa", color: "#fff", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{t.initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 9999, background: KIND_BG[t.kind] ?? "#a1a1aa", color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", justifySelf: "flex-start" }}>{t.kind}</span>
                    <span style={{ fontSize: 10, color: "var(--muted-fg)", whiteSpace: "nowrap" }}>{t.method}</span>
                    <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", textAlign: "right", color: t.status === "refund" ? "#dc2626" : t.status === "hold" ? "#a1a1aa" : "var(--primary)" }}>{amtStr}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="label-mp">Calendario · payouts</div>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Próximos depósitos<span className="dot">.</span></h2>
          {data.payouts.length === 0 && (
            <div style={{ padding: "16px 0", fontSize: 11.5, color: "var(--muted-fg)" }}>
              Sin payouts registrados todavía.
            </div>
          )}
          {data.payouts.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: i === 0 ? "var(--primary)" : p.status === "PAGADO" ? "var(--muted)" : "#0a0a0a", color: i === 0 || p.status !== "PAGADO" ? "#fff" : "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={i === 0 ? "arrow-up-right" : p.status === "PAGADO" ? "check" : "clock"} size={15} color={i === 0 || p.status !== "PAGADO" ? "#fff" : undefined} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{p.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{p.when}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="font-heading tabular" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em", color: i === 0 ? "var(--primary)" : "#0a0a0a" }}>{fmtMoney(p.netCents)}</div>
                <div style={{ fontSize: 8, color: PAYOUT_STATUS_COLOR[p.status], fontWeight: 900, letterSpacing: "0.12em", marginTop: 1 }}>{p.status}</div>
              </div>
            </div>
          ))}
          <button onClick={() => soon("Cambiar cuenta destino · próximamente")} style={{ marginTop: 14, padding: 12, background: "var(--muted)", borderRadius: 10, border: 0, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>Cuenta destino</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <div style={{ width: 32, height: 22, borderRadius: 4, background: "#0a0a0a", color: "#fff", fontSize: 8, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", letterSpacing: "0.1em" }}>BP</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800 }}>Banco Pichincha ····5421</div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>Cuenta ahorros · titular Club Norte Pickleball S.A.</div>
              </div>
              <Icon name="chevron-right" size={14} color="var(--muted-fg)" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
