"use client";
// Admin · Métricas v2 — analytics editorial. Migrada 1:1 del prototipo
// (ui_kits/dashboard/AdminMetricsScreen.jsx): KPIs con sparkline + selector de
// periodo + toggle comparar + GMV line + funnel + heatmap día×hora + cohortes
// de retención + breakdowns. data-lucide → <Icon>, botones → useToast.
//
// ✅ MERGEADO: el server `AdminMetricsScreen` calcula métricas REALES (MAU/DAU
// activos, GMV captured + delta vs periodo anterior, take rate de
// platform_config, funnel signup→MP+, heatmap de reservas, cohortes de
// retención reales, top deportes/ciudades/clubes) y las pasa como prop `data`.
// Se conservó TODO el diseño: el selector de periodo y el toggle comparar
// re-indexan datos reales por periodo; "Exportar" baja un CSV real de la vista.
// Ver docs/product/02-payments.md y docs/guides/04-placeholders.md.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import type { MetricsData, PeriodKey } from "./AdminMetricsScreenView";

const W = 800;
const H = 220;

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  ytd: "YTD",
};

const DOW_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function fmtCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
function fmtUSD(cents: number): string {
  const d = cents / 100;
  if (d >= 1000) return `$${(d / 1000).toFixed(0)}k`;
  return `$${Math.round(d).toLocaleString("en-US")}`;
}
function fmtDelta(delta: number | null, suffix = "%"): string {
  if (delta == null) return "—";
  return `${delta >= 0 ? "+" : ""}${delta}${suffix}`;
}
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function AdminMetricsScreenView({ data }: { data: MetricsData }) {
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [comparing, setComparing] = useState(true);

  // Sin realtime: el server cachea métricas ~10 min (AdminMetricsScreen).
  // Escuchar transactions/reservations/profiles aquí re-ejecutaba el barrido
  // completo en cada evento de la plataforma.

  const pd = data.periods[period];
  // "Última sincronización" se calcula en cliente (Date.now no es puro en
  // render) y se refresca cada minuto mientras la pantalla está montada.
  const [since, setSince] = useState("hace instantes");
  useEffect(() => {
    const compute = () => {
      const diff = Date.now() - new Date(data.generatedAt).getTime();
      const mins = Math.max(0, Math.round(diff / 60000));
      if (mins < 1) setSince("hace instantes");
      else if (mins === 1) setSince("hace 1 min");
      else if (mins < 60) setSince(`hace ${mins} min`);
      else {
        const hrs = Math.round(mins / 60);
        setSince(hrs === 1 ? "hace 1 h" : `hace ${hrs} h`);
      }
    };
    compute();
    const id = setInterval(compute, 60000);
    return () => clearInterval(id);
  }, [data.generatedAt]);

  // KPIs derivados del periodo activo.
  const KPIS = useMemo(
    () => [
      {
        k: "mau",
        l: period === "24h" ? "Activos · 24 h" : "Usuarios activos",
        v: fmtCompact(pd.kpis.mau.value),
        delta: fmtDelta(pd.kpis.mau.delta),
        up: pd.kpis.mau.up,
        sub: period === "24h" ? "organizadores · 24 h" : `organizadores · ${PERIOD_LABEL[period]}`,
        spark: pd.gmvSeries,
        color: "var(--primary)" as string,
      },
      {
        k: "dau",
        l: "DAU",
        v: fmtCompact(pd.kpis.dau.value),
        delta: fmtDelta(pd.kpis.dau.delta),
        up: pd.kpis.dau.up,
        sub: "activos · 24 h",
        spark: pd.gmvSeries,
        color: "#0a0a0a",
      },
      {
        k: "gmv",
        l: "GMV",
        v: fmtUSD(pd.kpis.gmvCents.value),
        delta: fmtDelta(pd.kpis.gmvCents.delta),
        up: pd.kpis.gmvCents.up,
        sub: `transacciones · ${PERIOD_LABEL[period]}`,
        spark: pd.gmvSeries,
        color: "#fbbf24",
      },
      {
        k: "take",
        l: "Take rate",
        v: `${pd.kpis.takeRatePct.toFixed(1)}%`,
        delta: "comisión fija",
        up: true,
        sub: "comisión efectiva",
        spark: pd.gmvSeries.map(() => 1),
        color: "#7c3aed",
      },
    ],
    [pd, period],
  );

  // Serie GMV del periodo activo (actual + anterior) para la línea grande.
  const gmvSeries = useMemo(
    () => pd.gmvSeries.map((cur, i) => ({ cur, prev: pd.gmvSeriesPrev[i] ?? 0 })),
    [pd],
  );
  const gmvMax = Math.max(1, ...gmvSeries.flatMap((p) => [p.cur, p.prev])) * 1.05;
  const gmvPath = (key: "cur" | "prev") =>
    gmvSeries.length <= 1
      ? `M0,${H} L${W},${H}`
      : gmvSeries
          .map((p, i) => `${i === 0 ? "M" : "L"}${(i / (gmvSeries.length - 1)) * W},${H - (p[key] / gmvMax) * H}`)
          .join(" ");

  const maxHeat = Math.max(1, ...data.heatmap.flat());
  const peakLabel = `${DOW_LABEL[data.heatPeak.dow]} ${data.heatPeak.hour.toString().padStart(2, "0")}:00`;

  // Funnel pct relativo al paso anterior, para el ancho de barra.
  const funnel = data.funnel;

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push(`MATCHPOINT · Métricas (${PERIOD_LABEL[period]})`);
    lines.push(`Generado,${new Date(data.generatedAt).toISOString()}`);
    lines.push("");
    lines.push("Sección,Métrica,Valor,Delta");
    lines.push(`KPI,Usuarios activos,${pd.kpis.mau.value},${fmtDelta(pd.kpis.mau.delta)}`);
    lines.push(`KPI,DAU,${pd.kpis.dau.value},${fmtDelta(pd.kpis.dau.delta)}`);
    lines.push(`KPI,GMV (USD),${(pd.kpis.gmvCents.value / 100).toFixed(2)},${fmtDelta(pd.kpis.gmvCents.delta)}`);
    lines.push(`KPI,Take rate,${pd.kpis.takeRatePct}%,fija`);
    lines.push(`KPI,Usuarios totales,${pd.kpis.totalUsers},`);
    lines.push("");
    lines.push("Funnel,Paso,Usuarios,% del signup");
    for (const f of funnel) lines.push(`Funnel,${csvCell(f.label)},${f.value},${f.pct}%`);
    lines.push("");
    lines.push("Top deportes,Deporte,Participación");
    for (const s of data.topSports) lines.push(`Deporte,${csvCell(s.label)},${s.value}`);
    lines.push("");
    lines.push("Top ciudades,Ciudad,Usuarios");
    for (const c of data.topCities) lines.push(`Ciudad,${csvCell(c.label)},${c.value}`);
    lines.push("");
    lines.push("Top clubes,Club,GMV");
    for (const c of data.topClubs) lines.push(`Club,${csvCell(c.label)},${c.value}`);
    lines.push("");
    lines.push(`GMV serie (${PERIOD_LABEL[period]}),bucket,USD actual,USD anterior`);
    gmvSeries.forEach((p, i) => lines.push(`GMV,${i},${p.cur.toFixed(2)},${p.prev.toFixed(2)}`));

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matchpoint-metricas-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ icon: "download", title: "Reporte CSV exportado" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Toda la plataforma · vista ejecutiva</div>
            <h1 className="font-heading" style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1, margin: "8px 0 0" }}>
              Métricas<span className="dot">.</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
              Datos agregados de la plataforma · {pd.kpis.totalUsers.toLocaleString("en-US")} usuarios · última sincronización <b style={{ color: "#0a0a0a" }}>{since}</b>
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setComparing(!comparing)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9999, background: comparing ? "#0a0a0a" : "#fff", color: comparing ? "#fff" : "#0a0a0a", border: "1px solid " + (comparing ? "#0a0a0a" : "var(--border)"), fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              <Icon name="git-compare" size={12} color={comparing ? "#fff" : undefined} />Comparar
            </button>
            <PeriodSeg value={period} onChange={setPeriod} />
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={exportCsv}>
              <Icon name="download" size={13} />Exportar
            </button>
          </div>
        </div>
      </div>

      {/* KPI ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        {KPIS.map((k) => (
          <KpiCard key={k.k} kpi={k} comparing={comparing} />
        ))}
      </div>

      {/* GMV + Funnel */}
      <div className="mp-metrics-split" style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16, alignItems: "stretch" }}>
        <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
            <div>
              <div className="label-mp">Evolución</div>
              <h3 className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>
                GMV · {PERIOD_LABEL[period]}<span className="dot">.</span>
              </h3>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 2, background: "var(--primary)" }} />Periodo actual
              </span>
              {comparing && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted-fg)" }}>
                  <span style={{ width: 10, height: 2, background: "#a3a3a3" }} />Periodo anterior
                </span>
              )}
            </div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 240, display: "block" }}>
            <defs>
              <linearGradient id="gmv-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((p) => (
              <line key={p} x1="0" x2={W} y1={H * p} y2={H * p} stroke="#e5e5e5" strokeDasharray="3 4" />
            ))}
            {comparing && <path d={gmvPath("prev")} fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />}
            <path d={`${gmvPath("cur")} L${W},${H} L0,${H} Z`} fill="url(#gmv-fill)" />
            <path d={gmvPath("cur")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {gmvSeries.length > 0 && (
              <circle cx={W} cy={H - (gmvSeries[gmvSeries.length - 1].cur / gmvMax) * H} r="5" fill="#10b981" stroke="#fff" strokeWidth="2.5" />
            )}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted-fg)", marginTop: 4, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <span>{period === "24h" ? "Hace 24 h" : period === "ytd" ? "Ene" : `Hace ${PERIOD_LABEL[period]}`}</span>
            <span>{period === "ytd" ? "Mitad de año" : "Mitad"}</span>
            <span>{period === "ytd" ? "Hoy" : "Ahora"}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="label-mp">Funnel de adquisición</div>
          <h3 className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>
            Signup → MP+<span className="dot">.</span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#0a0a0a" : "#404040" }}>{f.label}</span>
                  <span className="tabular" style={{ fontSize: 12, fontWeight: 800 }}>
                    {f.value.toLocaleString("en-US")} <span style={{ color: "var(--muted-fg)", fontSize: 10.5, marginLeft: 2 }}>{f.pct}%</span>
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--muted)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.min(100, f.pct) + "%", background: i === funnel.length - 1 ? "var(--primary)" : "#0a0a0a", transition: "width 320ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap + retention */}
      <div className="mp-metrics-split" style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
            <div>
              <div className="label-mp">Actividad · 90 días</div>
              <h3 className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>
                Día × hora<span className="dot">.</span>
              </h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--muted-fg)" }}>
              <span>Bajo</span>
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((o) => (
                <span key={o} style={{ width: 14, height: 14, borderRadius: 3, background: `rgba(16,185,129,${o})` }} />
              ))}
              <span>Alto</span>
            </div>
          </div>
          <div className="mp-metrics-heatmap-scroll">
          <div className="mp-metrics-heatmap-inner">
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 4 }}>
              <div />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
                {[0, 4, 8, 12, 16, 20].map((h) => (
                  <div key={h} style={{ gridColumn: `${h + 1} / span 4`, fontSize: 9, color: "var(--muted-fg)", textAlign: "left", fontWeight: 700, letterSpacing: "0.08em" }}>
                    {h.toString().padStart(2, "0")}h
                  </div>
                ))}
              </div>
              {DOW_LABEL.map((d, di) => (
                <div key={d} style={{ display: "contents" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", alignSelf: "center" }}>{d}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
                    {data.heatmap[di].map((v, hi) => {
                      const o = v === 0 ? 0.04 : Math.max(0.1, v / maxHeat);
                      return <div key={hi} title={`${d} ${hi}:00 · ${v} reservas`} style={{ aspectRatio: "1", borderRadius: 3, background: `rgba(16,185,129,${o})` }} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
          <div style={{ marginTop: 14, padding: 11, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 9, fontSize: 11.5, color: "#065f46", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="lightbulb" size={13} color="#065f46" />
            {maxHeat > 1 ? (
              <span>
                Pico de actividad: <b>{peakLabel}</b>. Considera campañas push en las horas previas.
              </span>
            ) : (
              <span>Aún no hay suficiente actividad para detectar un patrón día×hora.</span>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="label-mp">Retención</div>
          <h3 className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 12px" }}>
            Cohortes<span className="dot">.</span>
          </h3>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 320, display: "grid", gridTemplateColumns: `60px repeat(${data.cohortWeeks.length}, 1fr)`, gap: 3, fontSize: 9.5, fontFamily: "ui-monospace, monospace" }}>
              <div style={{ color: "var(--muted-fg)" }}>Cohorte</div>
              {data.cohortWeeks.map((w) => (
                <div key={w} style={{ color: "var(--muted-fg)", textAlign: "center", fontWeight: 700 }}>W{w}</div>
              ))}
              {data.cohorts.map((c) => (
                <div key={c.label} style={{ display: "contents" }}>
                  <div style={{ color: "#0a0a0a", fontWeight: 700, alignSelf: "center" }}>{c.label}</div>
                  {c.data.map((v, i) =>
                    v !== null ? (
                      <div key={i} style={{ aspectRatio: "1.6 / 1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: `rgba(16,185,129,${Math.max(0.08, v / 100)})`, color: v >= 50 ? "#fff" : "#065f46", fontSize: 10, fontWeight: 800 }}>{v}</div>
                    ) : (
                      <div key={i} style={{ aspectRatio: "1.6 / 1", background: "#fafafa", borderRadius: 4 }} />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted-fg)" }}>% de cada cohorte de signup con actividad N semanas después</div>
        </div>
      </div>

      {/* Breakdowns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <BreakdownCard label="Top deportes · 30 días" rows={data.topSports} />
        <BreakdownCard label="Top ciudades · usuarios" rows={data.topCities} />
        <BreakdownCard label="Top clubes · GMV" rows={data.topClubs} />
      </div>
    </div>
  );
}

type KpiVm = { k: string; l: string; v: string; delta: string; up: boolean; sub: string; spark: number[]; color: string };

function KpiCard({ kpi, comparing }: { kpi: KpiVm; comparing: boolean }) {
  const w = 100;
  const h = 32;
  const spark = kpi.spark.length > 1 ? kpi.spark : [0, 0];
  const max = Math.max(...spark);
  const min = Math.min(...spark);
  const range = max - min || 1;
  const linePath = spark.map((x, i) => `${i === 0 ? "M" : "L"}${(i / (spark.length - 1)) * w},${h - ((x - min) / range) * h}`).join(" ");
  const showDelta = comparing && kpi.delta !== "—" && kpi.delta !== "comisión fija";
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span className="label-mp">{kpi.l}</span>
        {showDelta && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 9999, background: kpi.up ? "rgba(16,185,129,0.1)" : "#fee2e2", color: kpi.up ? "var(--primary)" : "#dc2626", fontSize: 9.5, fontWeight: 900 }}>
            <Icon name={kpi.up ? "arrow-up" : "arrow-down"} size={9} color={kpi.up ? "var(--primary)" : "#dc2626"} />
            {kpi.delta}
          </span>
        )}
      </div>
      <div className="font-heading tabular" style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, color: kpi.color }}>{kpi.v}</div>
      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 5 }}>{kpi.sub}</div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 36, marginTop: 10, display: "block" }}>
        <path d={linePath} fill="none" stroke={kpi.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      </svg>
    </div>
  );
}

function PeriodSeg({ value, onChange }: { value: PeriodKey; onChange: (v: PeriodKey) => void }) {
  const opts: PeriodKey[] = ["24h", "7d", "30d", "90d", "ytd"];
  return (
    <div style={{ display: "inline-flex", background: "#f5f5f5", borderRadius: 9999, padding: 3 }}>
      {opts.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{ border: 0, background: value === o ? "#0a0a0a" : "transparent", color: value === o ? "#fff" : "#737373", padding: "7px 13px", borderRadius: 9999, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", fontFamily: "inherit" }}>
          {PERIOD_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

type BreakdownRow = { label: string; value: string; pct: number; delta?: string; color?: string };
function BreakdownCard({ label, rows }: { label: string; rows: BreakdownRow[] }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="label-mp" style={{ marginBottom: 12 }}>{label}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted-fg)", padding: "16px 0" }}>Sin datos en este rango.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {rows.map((r, i) => (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, minWidth: 0 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--muted-fg)", fontSize: 10.5, width: 14, flexShrink: 0 }}>#{i + 1}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {r.delta && <span style={{ fontSize: 10, fontWeight: 800, color: r.delta.startsWith("+") ? "var(--primary)" : "#dc2626" }}>{r.delta}</span>}
                  <span className="tabular" style={{ fontSize: 12, fontWeight: 800 }}>{r.value}</span>
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.min(100, r.pct) + "%", background: r.color || "#0a0a0a" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
