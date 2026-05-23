"use client";
// Club Owner · Finanzas v2 — command center financiero. Migrado del prototipo
// (ui_kits/dashboard/ClubOwnerFinanzasScreen.jsx): PolHero + payout neto con
// waterfall + KPIs 2×2 + revenue 30 días stacked + revenue por fuente + ranking
// por cancha + heatmap $/h + transacciones + calendario de payouts.
// data-lucide → <Icon>, botones → toast.
//
// ⚠️ DEMO: datos mock. Reemplaza la pantalla real ClubFinanzasScreen +
// ClubFinanzasScreenView (KPIs reales del club: revenue, breakdown por kind,
// barras 30 días, empleados), preservada y des-importada. Sin mutaciones (era
// read-only) → sin regresión operativa, pero muestra mock en vez de datos reales.
// Ajustes de honestidad: métodos de pago al modelo real (Transferencia/DeUna/
// Saldo MP/Efectivo, sin tarjeta/Apple Pay porque no hay PSP) y marca MATCHPOINT.
// Ver 04-placeholders.md y docs/product/02-payments.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";

const HERO_NET = "$9,536";
const WATERFALL = [
  { l: "Revenue bruto", v: "$14,840", sign: "+", color: "#fff", sub: undefined as string | undefined, bold: false },
  { l: "Comisión MATCHPOINT · 10%", v: "$1,484", sign: "–", color: "#dc2626", sub: "sobre revenue bruto", bold: false },
  { l: "Pagos a staff · 6 empleados", v: "$3,820", sign: "–", color: "#fbbf24", sub: "4 coaches + 2 admin", bold: false },
  { l: "Reembolsos · 4 txns", v: "$0", sign: "–", color: "#a1a1aa", sub: "absorbidos por MP", bold: false },
  { l: "Neto al banco", v: HERO_NET, sign: "=", color: "var(--primary)", sub: undefined, bold: true },
];
const SOURCES = [
  { k: "Reservas de canchas", v: "$9,840", p: 66, delta: "+14%", good: true, icon: "land-plot", color: "#10b981", sub: "412 reservas · $24 prom" },
  { k: "Eventos & torneos", v: "$2,800", p: 19, delta: "+28%", good: true, icon: "trophy", color: "#0a0a0a", sub: "3 torneos · 88 inscritos" },
  { k: "Clases con coach", v: "$1,420", p: 10, delta: "+4%", good: true, icon: "graduation-cap", color: "#0c4a6e", sub: "64 clases · $22 prom" },
  { k: "Pro shop", v: "$780", p: 5, delta: "−8%", good: false, icon: "shopping-bag", color: "#7c3aed", sub: "38 órdenes · pelotas + grips" },
];
const COURTS = [
  { n: 1, t: "Cancha Centro", tag: "INDOOR", v: "$4,820", occ: 87, color: "#0a0a0a" },
  { n: 2, t: "Cancha Sky", tag: "ROOFTOP · VIP", v: "$3,540", occ: 78, color: "#fbbf24" },
  { n: 3, t: "Cancha Norte", tag: "OUTDOOR", v: "$3,640", occ: 72, color: "#10b981" },
  { n: 4, t: "Cancha Sur", tag: "OUTDOOR", v: "$2,840", occ: 61, color: "#0c4a6e" },
  { n: 5, t: "Cancha Coach", tag: "CLASES", v: "$1,420", occ: 55, color: "#7c3aed" },
];
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
const TXNS = [
  { t: "14:38", who: "Carolina Vega", init: "CV", bg: "#10b981", kind: "Reserva", sub: "Cancha Centro · 90 min", amt: "+$28", meth: "Transferencia", st: "ok" },
  { t: "14:22", who: "Mateo Silva", init: "MS", bg: "#0a0a0a", kind: "Reserva", sub: "Cancha Sky · 60 min", amt: "+$24", meth: "DeUna", st: "ok" },
  { t: "13:55", who: "Open Verano", init: "EV", bg: "#fbbf24", kind: "Inscripción", sub: "Open MP Verano · 1 pareja", amt: "+$56", meth: "Transferencia", st: "ok" },
  { t: "13:40", who: "Joaquín Carrasco", init: "JC", bg: "#0c4a6e", kind: "Clase", sub: "Coach Pedro Salas · 60 min", amt: "+$22", meth: "Saldo MP", st: "ok" },
  { t: "13:08", who: "Sofía Pino", init: "SP", bg: "#dc2626", kind: "Reembolso", sub: "Reserva cancelada · cancha 2", amt: "−$24", meth: "A cuenta", st: "refund" },
  { t: "12:42", who: "Andrea Donoso", init: "AD", bg: "#7c3aed", kind: "Pro shop", sub: "2× pelotas · 1× grip", amt: "+$18", meth: "Efectivo · caja", st: "ok" },
  { t: "12:20", who: "David Reyes", init: "DR", bg: "#10b981", kind: "Reserva", sub: "Cancha Norte · 90 min", amt: "+$28", meth: "Transferencia", st: "ok" },
  { t: "11:58", who: "Felipe Núñez", init: "FN", bg: "#a1a1aa", kind: "Disputa", sub: "Cargo en revisión · txn TX-48201", amt: "$24", meth: "Pendiente", st: "hold" },
];
const PAYOUTS = [
  { d: "mañana 09:00", l: "Mayo · semana 19", v: "$9,536", st: "PROGRAMADO", stColor: "var(--primary)" },
  { d: "lun 26 may", l: "Mayo · semana 20", v: "$2,400", st: "ESTIMADO", stColor: "#0a0a0a" },
  { d: "lun 2 jun", l: "Mayo · cierre", v: "$1,200", st: "ESTIMADO", stColor: "#0a0a0a" },
  { d: "mar 15 may", l: "Mayo · semana 18", v: "$7,696", st: "PAGADO", stColor: "#a1a1aa" },
];
const KIND_BG: Record<string, string> = { Reserva: "#10b981", Inscripción: "#fbbf24", Clase: "#0c4a6e", "Pro shop": "#7c3aed", Reembolso: "#dc2626", Disputa: "#a1a1aa" };
const HEAT_C = (v: number) => (v > 80 ? "var(--primary)" : v > 50 ? "#34d399" : v > 25 ? "#fde68a" : v > 5 ? "#fef3c7" : "#fafafa");

// 30 días stacked [reservas, eventos, clases, shop] — determinista (SSR-safe).
const STACK30 = Array.from({ length: 30 }, (_, i) => {
  const base = 280 + Math.abs(Math.sin(i * 0.7) * 220);
  const isWk = i % 7 === 5 || i % 7 === 6;
  const boost = isWk ? 220 : 0;
  return [base + boost, 60 + (i > 22 ? 80 : 0) + (i % 7 === 6 ? 90 : 0), 40 + (i % 3 === 0 ? 35 : 0), 18 + (i % 4 === 0 ? 12 : 0)];
});
const MAX30 = Math.max(...STACK30.map((s) => s.reduce((a, b) => a + b, 0)));

const PERIOD_LABEL: Record<string, string> = { hoy: "Hoy", sem: "Esta semana", mes: "Este mes", anio: "Este año" };

export function ClubFinanzasView() {
  const toast = useToast();
  const [period, setPeriod] = useState("mes");
  const soon = (title: string) => toast({ icon: "sparkles", title });

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
                <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>● Próximo payout · Mayo sem 19</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
                  <span className="font-heading tabular" style={{ fontSize: 76, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 0.85, color: "var(--primary)" }}>{HERO_NET}</span>
                  <span style={{ fontSize: 14, color: "var(--primary)", fontWeight: 900, padding: "4px 10px", borderRadius: 9999, background: "rgba(16,185,129,0.18)" }}>↑ 24% vs sem ant</span>
                </div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 10 }}>
                  <b style={{ color: "#fff" }}>Llega mañana · 09:00</b> · Banco Pichincha · cuenta ahorros ····5421
                </div>
              </div>
              <button className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", fontSize: 10 }} onClick={() => soon("Cambiar cuenta · próximamente")}>Cambiar cuenta</button>
            </div>

            <div style={{ marginTop: 26, padding: 16, background: "rgba(0,0,0,0.3)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>De $14,840 a tu cuenta — paso a paso</div>
              {WATERFALL.map((r, i) => (
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
          {[
            { l: "Revenue bruto · mes", v: "$14,840", sub: "↑ 18% vs abril", color: "var(--primary)", icon: "trending-up" },
            { l: "Ticket promedio", v: "$24", sub: "↑ $3 vs abril", color: "#0a0a0a", icon: "receipt" },
            { l: "ARPU socio", v: "$32", sub: "142 socios · /mes", color: "#0a0a0a", icon: "users" },
            { l: "Refund rate", v: "1.8%", sub: "4 de 224 txns", color: "#dc2626", icon: "undo-2" },
          ].map((k) => (
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
            <span style={{ fontSize: 11, fontWeight: 900, color: "var(--primary)", padding: "4px 10px", borderRadius: 9999, background: "rgba(16,185,129,0.1)" }}>↑ $2,840 vs mes pasado</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 200, paddingTop: 8, borderBottom: "1px solid var(--border)" }}>
          {STACK30.map((day, i) => {
            const total = day.reduce((a, b) => a + b, 0);
            const h = (total / MAX30) * 190;
            const isToday = i === 29;
            const colors = ["#10b981", "#0a0a0a", "#0c4a6e", "#7c3aed"];
            return (
              <div key={i} style={{ flex: 1, height: h, display: "flex", flexDirection: "column-reverse", position: "relative", outline: isToday ? "2px solid var(--primary)" : "none", outlineOffset: 2, borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                {day.map((v, si) => (
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
          {SOURCES.map((s) => (
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
          {COURTS.map((c, i) => {
            const max = Math.max(...COURTS.map((x) => parseFloat(x.v.replace(/[$,]/g, ""))));
            const w = (parseFloat(c.v.replace(/[$,]/g, "")) / max) * 100;
            return (
              <div key={c.n} style={{ padding: "12px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div className="font-heading" style={{ width: 24, height: 24, borderRadius: 6, background: i === 0 ? "var(--primary)" : "var(--muted)", color: i === 0 ? "#fff" : "#0a0a0a", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>#{c.n}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{c.t}</div>
                    <div style={{ fontSize: 9, color: c.color, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>● {c.tag}</div>
                  </div>
                  <div className="font-heading tabular" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.025em", color: "var(--primary)" }}>{c.v}</div>
                </div>
                <div style={{ height: 6, background: "var(--muted)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: w + "%", background: c.color }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 700 }}>
                  <span>Ocupación {c.occ}%</span>
                  <span>{Math.round(parseFloat(c.v.replace(/[$,]/g, "")) / 24)} reservas · prom $24</span>
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
              {TXNS.map((t, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "52px 1fr 90px 110px 80px", gap: 12, alignItems: "center", padding: "12px 22px", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                  <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.t}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: t.bg, color: "#fff", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{t.init}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 9999, background: KIND_BG[t.kind], color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", justifySelf: "flex-start" }}>{t.kind}</span>
                  <span style={{ fontSize: 10, color: "var(--muted-fg)", whiteSpace: "nowrap" }}>{t.meth}</span>
                  <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", textAlign: "right", color: t.st === "refund" ? "#dc2626" : t.st === "hold" ? "#a1a1aa" : "var(--primary)" }}>{t.amt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="label-mp">Calendario · payouts</div>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Próximos depósitos<span className="dot">.</span></h2>
          {PAYOUTS.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: i === 0 ? "var(--primary)" : p.st === "PAGADO" ? "var(--muted)" : "#0a0a0a", color: i === 0 || p.st !== "PAGADO" ? "#fff" : "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={i === 0 ? "arrow-up-right" : p.st === "PAGADO" ? "check" : "clock"} size={15} color={i === 0 || p.st !== "PAGADO" ? "#fff" : undefined} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{p.l}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{p.d}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="font-heading tabular" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em", color: i === 0 ? "var(--primary)" : "#0a0a0a" }}>{p.v}</div>
                <div style={{ fontSize: 8, color: p.stColor, fontWeight: 900, letterSpacing: "0.12em", marginTop: 1 }}>{p.st}</div>
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
