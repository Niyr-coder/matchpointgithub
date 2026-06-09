"use client";
// Admin · Audit Log v2 — stream de eventos forense, cableado al `audit_log` REAL.
// El server (AdminAuditScreen) lee audit_log, resuelve actores, deriva categoría
// y severidad, y pasa `events`. Aquí se conserva todo el diseño del prototipo
// (KPIs + búsqueda con filtros + pills por categoría/severidad + stream agrupado
// por día + drawer con diff/metadata/raw JSON + cards laterales) + export CSV/JSON
// real + refresh en vivo. La severidad/categoría se derivan de entity+action (no
// son columnas), el resto (actor, ip, ua, diff, timestamp) es real.
// Ver docs/security/03-audit-log.md y 04-placeholders.md.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { InfoTip, LabelWithTip } from "@/components/dashboard/widgets/InfoTip";
import { verifyAuditChain, rebackfillAuditChain, type ChainStatus } from "@/server/actions/audit";

type Sev = "info" | "warn" | "critical";
type Diff = { k: string; a: string; b: string };
type Ev = {
  t: string;
  who: string;
  av: string;
  avBg: string;
  actorType: string;
  action: string;
  /** Título legible para UI (no técnico). */
  actionLabel: string;
  cat: string;
  target: string;
  sev: Sev;
  ip: string | null;
  geo: string;
  ua: string;
  reqId: string;
  diff?: Diff[] | null;
};
// Tipo público que arma el server (AdminAuditScreen) desde audit_log real.
export type AuditEvent = Ev;

const CAT_PILLS = [
  { k: "all", l: "Todas", i: "list", c: "#0a0a0a" },
  { k: "auth", l: "Auth", i: "key", c: "#7c3aed" },
  { k: "mod", l: "Moderación", i: "shield-alert", c: "#0ea5e9" },
  { k: "pagos", l: "Pagos", i: "wallet", c: "#10b981" },
  { k: "config", l: "Config", i: "settings", c: "#f59e0b" },
  { k: "club", l: "Club", i: "building-2", c: "#0a0a0a" },
];

// Formato de miles determinista (mismo resultado en server y cliente → evita
// hydration mismatch que sí provoca number.toLocaleString(), dependiente de locale).
const nf = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const PAGE = 60; // eventos visibles por tanda en el stream

type RangeKey = "1h" | "24h" | "7d" | "30d" | "custom";

const RANGE_MS: Record<Exclude<RangeKey, "custom">, number> = {
  "1h": 3600000,
  "24h": 86400000,
  "7d": 7 * 86400000,
  "30d": 30 * 86400000,
};

const RANGE_SHORT: Record<RangeKey, string> = {
  "1h": "1h",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  custom: "custom",
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultCustomRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 86400000);
  return { from: isoDate(from), to: isoDate(to) };
}

function eventInRange(
  e: Ev,
  now: number,
  range: RangeKey,
  customFrom: string,
  customTo: string,
): boolean {
  const ts = new Date(e.t).getTime();
  if (range === "custom") {
    const from = new Date(`${customFrom}T00:00:00`).getTime();
    const to = new Date(`${customTo}T23:59:59.999`).getTime();
    if (Number.isNaN(from) || Number.isNaN(to)) return true;
    return ts >= from && ts <= to;
  }
  return now - ts < RANGE_MS[range];
}

function buildHourBuckets(
  rangeEvents: Ev[],
  now: number,
  range: RangeKey,
  customFrom: string,
  customTo: string,
): number[] {
  if (range === "1h") {
    const buckets = Array.from({ length: 12 }, () => 0);
    rangeEvents.forEach((e) => {
      const minsAgo = Math.floor((now - new Date(e.t).getTime()) / 60000);
      if (minsAgo >= 0 && minsAgo < 60) {
        const idx = 11 - Math.floor(minsAgo / 5);
        if (idx >= 0 && idx < 12) buckets[idx]++;
      }
    });
    return buckets;
  }
  if (range === "24h") {
    const buckets = Array.from({ length: 24 }, () => 0);
    rangeEvents.forEach((e) => {
      const hAgo = Math.floor((now - new Date(e.t).getTime()) / 3600000);
      if (hAgo >= 0 && hAgo < 24) buckets[23 - hAgo]++;
    });
    return buckets;
  }
  if (range === "7d") {
    const buckets = Array.from({ length: 7 }, () => 0);
    rangeEvents.forEach((e) => {
      const dAgo = Math.floor((now - new Date(e.t).getTime()) / 86400000);
      if (dAgo >= 0 && dAgo < 7) buckets[6 - dAgo]++;
    });
    return buckets;
  }
  if (range === "30d") {
    const buckets = Array.from({ length: 30 }, () => 0);
    rangeEvents.forEach((e) => {
      const dAgo = Math.floor((now - new Date(e.t).getTime()) / 86400000);
      if (dAgo >= 0 && dAgo < 30) buckets[29 - dAgo]++;
    });
    return buckets;
  }
  // custom: barras por día entre from y to (máx. 14 para legibilidad)
  const from = new Date(`${customFrom}T00:00:00`).getTime();
  const to = new Date(`${customTo}T23:59:59.999`).getTime();
  const msPerDay = 86400000;
  const spanDays = Math.max(1, Math.ceil((to - from) / msPerDay));
  const dayCount = Math.min(14, spanDays);
  const buckets = Array.from({ length: dayCount }, () => 0);
  rangeEvents.forEach((e) => {
    const ts = new Date(e.t).getTime();
    const dayIdx = Math.floor((ts - from) / msPerDay);
    if (dayIdx >= 0 && dayIdx < dayCount) buckets[dayIdx]++;
  });
  return buckets;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dateLabel = (d: string) => {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  if (d === todayKey) return "Hoy";
  if (d === yest) return "Ayer";
  const dt = new Date(d + "T00:00:00");
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
};

export function AdminAuditView({ events, now, chainedCount }: { events: AuditEvent[]; now: number; chainedCount: number }) {
  const toast = useToast();
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("24h");
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => defaultCustomRange().from);
  const [customTo, setCustomTo] = useState(() => defaultCustomRange().to);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [catF, setCatF] = useState("all");
  const [sevF, setSevF] = useState<"all" | Sev>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [liveTail, setLiveTail] = useState(true);
  const [visible, setVisible] = useState(PAGE);

  // Al cambiar filtros/búsqueda, vuelve a la primera tanda (reset por dependencia).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(PAGE);
  }, [search, catF, sevF, activeFilters, range, customFrom, customTo]);

  const rangeLabel = range === "custom" ? `${customFrom} → ${customTo}` : RANGE_SHORT[range];

  const rangeEvents = useMemo(
    () => events.filter((e) => eventInRange(e, now, range, customFrom, customTo)),
    [events, now, range, customFrom, customTo],
  );

  // Refresca datos reales del server cada 15s mientras live tail está on.
  useEffect(() => {
    if (!liveTail) return;
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [liveTail, router]);

  const filtered = rangeEvents.filter((e) => {
    if (catF !== "all" && e.cat !== catF) return false;
    if (sevF !== "all" && e.sev !== sevF) return false;
    if (search) {
      const blob = (e.who + " " + e.actionLabel + " " + e.action + " " + e.target + " " + (e.ip || "")).toLowerCase();
      if (!blob.includes(search.toLowerCase())) return false;
    }
    for (const f of activeFilters) {
      const blob = (e.who + " " + e.actionLabel + " " + e.action + " " + e.target).toLowerCase();
      if (!blob.includes(f.toLowerCase())) return false;
    }
    return true;
  });

  // Stream paginado: solo renderizamos `visible` eventos (el server ya capó a 200).
  // Así la página no crece sin límite aunque haya muchos eventos.
  const shown = filtered.slice(0, visible);
  const groups: Record<string, Ev[]> = {};
  shown.forEach((e) => {
    const d = e.t.slice(0, 10);
    (groups[d] ||= []).push(e);
  });

  const hourBuckets = useMemo(
    () => buildHourBuckets(rangeEvents, now, range, customFrom, customTo),
    [rangeEvents, now, range, customFrom, customTo],
  );
  const critical = rangeEvents.filter((e) => e.sev === "critical").length;
  const actors = new Set(rangeEvents.map((e) => e.who)).size;
  const actions = new Set(rangeEvents.map((e) => e.actionLabel)).size;

  const actorTally: Record<string, number> = {};
  rangeEvents.forEach((e) => (actorTally[e.who] = (actorTally[e.who] || 0) + 1));
  const topActors = Object.entries(actorTally).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const actionTally: Record<string, number> = {};
  rangeEvents.forEach((e) => (actionTally[e.actionLabel] = (actionTally[e.actionLabel] || 0) + 1));
  const topActions = Object.entries(actionTally).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const catTally: Record<string, number> = {};
  rangeEvents.forEach((e) => (catTally[e.cat] = (catTally[e.cat] || 0) + 1));

  // Export real de la vista filtrada (descarga client-side).
  const exportData = (fmt: "csv" | "json") => {
    if (filtered.length === 0) return toast({ icon: "alert-triangle", title: "Nada que exportar" });
    let content: string;
    let mime: string;
    let name: string;
    if (fmt === "json") {
      content = JSON.stringify(filtered, null, 2);
      mime = "application/json";
      name = "audit-log.json";
    } else {
      const head = "fecha,actor,rol,accion,categoria,severidad,target,ip\n";
      const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      content = head + filtered.map((e) => [e.t, e.who, e.actorType, e.actionLabel, e.cat, e.sev, e.target, e.ip ?? ""].map(esc).join(",")).join("\n");
      mime = "text/csv";
      name = "audit-log.csv";
    }
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast({ icon: "download", title: `Exportado · ${filtered.length} eventos` });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* HEADER */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 className="font-heading mp-admin-page-title" style={{ fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              Audit log<span className="dot">.</span>
              <InfoTip maxWidth={280} text="Si disputas cobros, suspensiones o grants admin, este log es la prueba. Exporta antes de cualquier investigación de integridad." />
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
              {events.length} eventos cargados · registro append-only con actor + timestamp
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setLiveTail(!liveTail)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9999, background: liveTail ? "#0a0a0a" : "#fff", color: liveTail ? "#fff" : "#0a0a0a", border: "1px solid " + (liveTail ? "#0a0a0a" : "var(--border)"), fontFamily: "inherit", fontSize: 11.5, fontWeight: 900, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: liveTail ? "var(--primary)" : "#a3a3a3", boxShadow: liveTail ? "0 0 0 4px rgba(16,185,129,0.2)" : "none", animation: liveTail ? "mp-pulse 1.6s infinite" : "none" }} />
              {liveTail ? "Live tail" : "Pausado"}
            </button>
            <ExportMenu onExport={exportData} />
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="mp-spon-kpis gap-3">
        <AuditHero count={rangeEvents.length} liveTail={liveTail} buckets={hourBuckets} range={range} />
        <AuditKpi icon="alert-octagon" label={`Críticos · ${rangeLabel}`} value={String(critical)} sub={critical > 0 ? "Revisar ahora" : "Sin alertas"} danger={critical > 0} tip="Eventos con severidad crítica en el rango (cancelaciones masivas, overrides sensibles, etc.). Prioriza revisarlos." />
        <AuditKpi icon="users" label="Actores únicos" value={String(actors)} sub="admins · staff · sistema" tip="Cuentas distintas que generaron eventos. Útil para detectar un actor con actividad anómala." />
        <AuditKpi icon="terminal" label="Acciones únicas" value={String(actions)} sub="tipos distintos" tip="Tipos distintos de acción en lenguaje legible (ej. «Rol asignado», «Perfil actualizado»)." />
        <AuditKpi icon="shield-check" label="Integridad" value={nf(chainedCount)} sub="encadenados · hash chain" emerald tip="Filas con hash encadenado. Usa la tarjeta lateral «Verificar cadena» para comprobar que nadie alteró el log." />
      </div>

      {/* SEARCH + RANGE */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 280 }}>
          <span style={{ position: "absolute", left: 12, top: 11, display: "inline-flex" }}>
            <Icon name="search" size={13} color="var(--muted-fg)" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar · actor, acción, target, IP…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) {
                setActiveFilters([...activeFilters, search.trim()]);
                setSearch("");
              }
            }}
            style={{ width: "100%", padding: "11px 36px 11px 34px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12.5, fontFamily: "ui-monospace, monospace", outline: "none", background: "#fff" }}
          />
          <span style={{ position: "absolute", right: 10, top: 9, padding: "3px 7px", borderRadius: 4, background: "var(--muted)", fontSize: 9.5, fontWeight: 900, color: "var(--muted-fg)", letterSpacing: "0.1em" }}>↵</span>
        </div>
        <div style={{ position: "relative" }}>
          <SegRange
            value={range}
            onChange={(v) => {
              setRange(v);
              if (v === "custom") setCustomOpen(true);
              else setCustomOpen(false);
            }}
          />
          {customOpen && range === "custom" && (
            <CustomRangePicker
              from={customFrom}
              to={customTo}
              onFrom={setCustomFrom}
              onTo={setCustomTo}
              onClose={() => setCustomOpen(false)}
            />
          )}
        </div>
      </div>

      {/* ACTIVE FILTERS */}
      {activeFilters.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="label-mp" style={{ marginRight: 4 }}>Filtros</span>
          {activeFilters.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 9999, background: "rgba(220,38,38,0.08)", color: "#dc2626", fontSize: 11, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
              {f}
              <button onClick={() => setActiveFilters(activeFilters.filter((_, j) => j !== i))} aria-label="Quitar filtro" style={{ background: "transparent", border: 0, color: "#dc2626", cursor: "pointer", display: "inline-flex", padding: 0 }}>
                <Icon name="x" size={11} color="#dc2626" />
              </button>
            </span>
          ))}
          <button onClick={() => setActiveFilters([])} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>
            Limpiar todo
          </button>
        </div>
      )}

      {/* MAIN GRID */}
      <div className="mp-audit-grid mp-grid-split-wide gap-4" style={{ alignItems: "start" }}>
        {/* STREAM */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {CAT_PILLS.map((c) => {
              const on = catF === c.k;
              const n = c.k === "all" ? filtered.length : rangeEvents.filter((e) => e.cat === c.k).length;
              return (
                <button key={c.k} onClick={() => setCatF(c.k)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9999, background: on ? c.c : "#fff", color: on ? "#fff" : "#0a0a0a", border: "1px solid " + (on ? c.c : "var(--border)"), fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                  <Icon name={c.i} size={11} color={on ? "#fff" : undefined} />
                  {c.l}
                  <span style={{ padding: "1px 5px", borderRadius: 9999, background: on ? "rgba(255,255,255,0.2)" : "var(--muted)", color: on ? "#fff" : "var(--muted-fg)", fontSize: 9.5, fontWeight: 900 }}>{n}</span>
                </button>
              );
            })}
            <span style={{ flex: 1 }} />
            <SegSev value={sevF} onChange={setSevF} />
          </div>

          {Object.entries(groups).map(([date, entries]) => (
            <div key={date} className="card" style={{ padding: 0, overflow: "hidden", background: "#0a0a0a", border: 0, color: "#fff" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <Icon name="calendar" size={13} color="#fbbf24" />
                  <span className="font-heading" style={{ fontWeight: 900, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em" }}>{dateLabel(date)}</span>
                </div>
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", fontFamily: "ui-monospace, monospace" }}>{entries.length} eventos</span>
              </div>
              <div className="mp-audit-stream-scroll">
              {entries.map((e) => (
                <EventRow key={e.reqId} e={e} live={liveTail && e.reqId === shown[0]?.reqId} onOpen={() => setOpenId(e.reqId)} />
              ))}
              </div>
            </div>
          ))}

          {filtered.length > visible && (
            <button onClick={() => setVisible((v) => v + PAGE)} className="btn" style={{ width: "100%", background: "#fff", border: "1px solid var(--border)", justifyContent: "center" }}>
              <Icon name="chevron-down" size={13} />Mostrar más · {nf(filtered.length - visible)} restantes
            </button>
          )}

          {filtered.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}>
              <Icon name="search-x" size={22} />
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0a0a0a", marginTop: 8 }}>Sin eventos para esos filtros</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Prueba ampliar el rango o limpiar filtros.</div>
            </div>
          )}
        </div>

        {/* SIDE */}
        <div className="mp-audit-side" style={{ position: "sticky", top: 88, display: "flex", flexDirection: "column", gap: 14 }}>
          <PulseCard title={`Top actores · ${rangeLabel}`} rows={topActors.map(([k, v]) => ({ k, v }))} total={rangeEvents.length} />
          <PulseCard title={`Top acciones · ${rangeLabel}`} rows={topActions.map(([k, v]) => ({ k, v }))} total={rangeEvents.length} />
          <CategoryCard tally={catTally} total={rangeEvents.length} rangeLabel={rangeLabel} />
          <IntegrityCard onExport={() => exportData("csv")} chainedCount={chainedCount} />
        </div>
      </div>

      {openId && <EventDrawer e={events.find((x) => x.reqId === openId)!} close={() => setOpenId(null)} />}
    </div>
  );
}

function heroRangeLabel(range: RangeKey): string {
  if (range === "1h") return "1h";
  if (range === "24h") return "24h";
  if (range === "7d") return "7d";
  if (range === "30d") return "30d";
  return "rango";
}

function heroBucketHint(range: RangeKey, count: number, max: number, bucketLen: number): string {
  if (count === 0) return "sin actividad en el rango";
  if (range === "1h") return `pico ${max}/5m · ${Math.round((count / bucketLen) * 10) / 10}/slot promedio`;
  if (range === "24h") return `pico ${max}/h · ${Math.round((count / 24) * 10) / 10}/h promedio`;
  if (range === "7d") return `pico ${max}/día · ${Math.round((count / 7) * 10) / 10}/día promedio`;
  if (range === "30d") return `pico ${max}/día · ${Math.round((count / 30) * 10) / 10}/día promedio`;
  return `pico ${max} · ${count} en el rango`;
}

function heroAxisLabels(range: RangeKey): [string, string, string] {
  if (range === "1h") return ["-60m", "-30m", "ahora"];
  if (range === "24h") return ["-24h", "-12h", "ahora"];
  if (range === "7d") return ["-7d", "-3d", "hoy"];
  if (range === "30d") return ["-30d", "-15d", "hoy"];
  return ["inicio", "mitad", "fin"];
}

function AuditHero({ count, liveTail, buckets, range }: { count: number; liveTail: boolean; buckets: number[]; range: RangeKey }) {
  const max = Math.max(1, ...buckets);
  const last = buckets.length - 1;
  const [a0, a1, a2] = heroAxisLabels(range);
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "#0a0a0a", color: "#fff", padding: 18, border: "1px solid rgba(255,255,255,0.06)" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 92% 18%, rgba(220,38,38,0.22), transparent 55%)" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span className="label-mp" style={{ color: "#fca5a5" }}>● Eventos · {heroRangeLabel(range)}</span>
          <div className="font-heading tabular" style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6 }}>
            {nf(count)}
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginLeft: 6 }}>eventos</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 6, fontFamily: "ui-monospace, monospace" }}>{heroBucketHint(range, count, max, buckets.length)}</div>
        </div>
        {liveTail && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.15)", color: "var(--primary)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", animation: "mp-pulse 1.4s infinite" }} />Live
          </span>
        )}
      </div>
      {/* Histograma real: cada barra = eventos en esa hora (últimas 24h). */}
      <div style={{ marginTop: 14, height: 42, display: "flex", gap: 2, alignItems: "flex-end" }}>
        {buckets.map((count, i) => {
          const isNow = i === last;
          const h = count === 0 ? 3 : Math.max(8, (count / max) * 100);
          return <div key={i} title={`hace ${23 - i}h · ${count} evento${count === 1 ? "" : "s"}`} style={{ flex: 1, height: h + "%", background: isNow ? "var(--primary)" : count === 0 ? "rgba(255,255,255,0.08)" : "rgba(220,38,38,0.55)", borderRadius: 1.5, boxShadow: isNow && count > 0 ? "0 0 8px rgba(16,185,129,0.55)" : "none", transition: "height 300ms ease-out" }} />;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em" }}>
        <span>{a0}</span>
        <span>{a1}</span>
        <span>{a2}</span>
      </div>
    </div>
  );
}

function AuditKpi({ icon, label, value, sub, danger, emerald, tip }: { icon: string; label: string; value: string; sub?: string; danger?: boolean; emerald?: boolean; tip?: string }) {
  const c = danger ? "#dc2626" : emerald ? "#047857" : "#0a0a0a";
  const bg = danger ? "#fee2e2" : emerald ? "rgba(16,185,129,0.12)" : "var(--muted)";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="label-mp" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {label}
          {tip ? <InfoTip text={tip} maxWidth={220} /> : null}
        </span>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: bg, color: c, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em", color: c }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function EventRow({ e, live, onOpen }: { e: Ev; live: boolean; onOpen: () => void }) {
  const sevDot = { info: "#52525b", warn: "#fbbf24", critical: "#ef4444" }[e.sev];
  const time = e.t.slice(11, 16);
  const isSystem = e.actorType === "system";
  return (
    <button
      onClick={onOpen}
      className="mp-audit-row"
      style={{ display: "grid", gridTemplateColumns: "56px 14px 200px 1fr auto 16px", gap: 14, alignItems: "center", padding: "11px 20px", borderTop: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", position: "relative", background: "transparent", border: 0, width: "100%", textAlign: "left", fontFamily: "inherit", color: "#fff" }}
    >
      {live && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--primary)" }} />}
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.02em" }}>{time}</span>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: sevDot, justifySelf: "center", boxShadow: e.sev === "critical" ? "0 0 0 3px rgba(239,68,68,0.18)" : "none" }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: isSystem ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.92)", fontStyle: isSystem ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.who}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{e.actionLabel}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{e.target}</span>
      </div>
      {e.diff ? <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#fbbf24", whiteSpace: "nowrap", opacity: 0.85 }}>+{e.diff.length} edit</span> : <span />}
      <Icon name="chevron-right" size={12} color="rgba(255,255,255,0.4)" />
    </button>
  );
}

function PulseCard({ title, rows, total }: { title: string; rows: { k: string; v: number }[]; total: number }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="label-mp" style={{ marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => {
          const pct = Math.round((r.v / Math.max(1, total)) * 100);
          return (
            <div key={r.k}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3, gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.k}</span>
                <span className="tabular" style={{ fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {r.v}
                  <span style={{ color: "var(--muted-fg)", marginLeft: 4 }}>· {pct}%</span>
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: pct + "%", background: "#0a0a0a" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryCard({ tally, total, rangeLabel }: { tally: Record<string, number>; total: number; rangeLabel: string }) {
  const items = [
    { k: "pagos", l: "Pagos", c: "#10b981", i: "wallet" },
    { k: "config", l: "Config", c: "#f59e0b", i: "settings" },
    { k: "auth", l: "Auth", c: "#7c3aed", i: "key" },
    { k: "mod", l: "Moderación", c: "#0ea5e9", i: "shield-alert" },
    { k: "club", l: "Club", c: "#0a0a0a", i: "building-2" },
  ];
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="label-mp" style={{ marginBottom: 10 }}>Por categoría · {rangeLabel}</div>
      <div style={{ height: 12, borderRadius: 9999, background: "var(--muted)", overflow: "hidden", display: "flex", marginBottom: 12 }}>
        {items.map((it) => {
          const n = tally[it.k] || 0;
          const pct = (n / Math.max(1, total)) * 100;
          return pct > 0 ? <div key={it.k} style={{ width: pct + "%", background: it.c }} title={`${it.l} · ${n}`} /> : null;
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => (
          <div key={it.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: it.c + "22", color: it.c, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={it.i} size={11} color={it.c} />
            </span>
            <span style={{ flex: 1, fontWeight: 700 }}>{it.l}</span>
            <span className="tabular" style={{ fontWeight: 800, color: "var(--muted-fg)" }}>{tally[it.k] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrityCard({ onExport, chainedCount }: { onExport: () => void; chainedCount: number }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const runVerify = (notify: boolean) =>
    startTransition(async () => {
      const res = await verifyAuditChain(undefined);
      if (res.ok) {
        setStatus(res.data);
        setCheckedAt(Date.now());
        if (notify) {
          toast(
            res.data.ok
              ? { icon: "shield-check", title: `Cadena íntegra · ${res.data.checked} registros` }
              : { icon: "alert-triangle", title: `⚠ Cadena rota en #${res.data.brokenId}` },
          );
        }
      } else if (notify) {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });

  const repair = () =>
    startTransition(async () => {
      const res = await rebackfillAuditChain(undefined);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
        return;
      }
      toast({ icon: "shield-check", title: `Cadena reparada · ${nf(res.data.rebuilt)} registros` });
      runVerify(false);
    });

  useEffect(() => {
    runVerify(false);
  }, []);

  const broken = status && !status.ok;
  return (
    <div className="card" style={{ padding: 16, background: broken ? "linear-gradient(135deg, #fff 0%, rgba(220,38,38,0.06) 100%)" : "linear-gradient(135deg, #fff 0%, rgba(16,185,129,0.05) 100%)" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 9px", borderRadius: 9999, background: broken ? "#fee2e2" : "rgba(16,185,129,0.12)", color: broken ? "#dc2626" : "#047857", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        <Icon name={broken ? "shield-alert" : "shield-check"} size={10} color={broken ? "#dc2626" : "#047857"} />
        <LabelWithTip tip="Cada fila guarda sha256(prev_hash + contenido). Alterar o borrar una fila rompe todos los hashes siguientes.">Integridad · hash chain</LabelWithTip>
      </div>
      <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase", margin: "10px 0 6px" }}>
        Registro encadenado<span style={{ color: "var(--primary)" }}>.</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Append-only vía triggers. Cada registro guarda un <b>hash</b> de su contenido + el del anterior, así una alteración o borrado se detecta. <b style={{ color: "#0a0a0a" }}>{nf(chainedCount)}</b> registros encadenados.
      </div>

      {status && (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: broken ? "#fee2e2" : "rgba(16,185,129,0.1)", color: broken ? "#7f1d1d" : "#065f46", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name={broken ? "shield-alert" : "shield-check"} size={13} color={broken ? "#dc2626" : "#047857"} />
          <span>
            {broken ? `Cadena rota en el registro #${status.brokenId}` : `Cadena íntegra · ${nf(status.checked)} registros verificados`}
            {checkedAt ? (
              <span style={{ display: "block", marginTop: 2, fontWeight: 600, opacity: 0.85, fontSize: 10 }}>
                Verificado {new Date(checkedAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </span>
        </div>
      )}

      {broken && status?.brokenId != null && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", fontSize: 11, color: "#7f1d1d", lineHeight: 1.55 }}>
          <div style={{ fontWeight: 900, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>Qué hacer ahora</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>Exporta</b> el log (botón abajo) — conserva evidencia antes de tocar nada.</li>
            <li><b>No edites ni borres</b> filas en <code style={{ fontFamily: "ui-monospace, monospace" }}>audit_log</code>; la tabla es append-only.</li>
            <li>Busca en el stream eventos alrededor del registro <b>#{status.brokenId}</b> y quién actuó.</li>
            <li><b>Escala a ingeniería</b> — trátalo como incidente de seguridad hasta descartar manipulación.</li>
            <li>Si coincidió con un deploy o migración (hash chain 154/155), usa <b>Reparar cadena</b> abajo o aplica la migración de re-backfill.</li>
          </ol>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary" style={{ flex: 1, minWidth: 120, fontSize: 10.5, padding: "7px 12px" }} onClick={() => runVerify(true)} disabled={pending} title="Recorre toda la cadena y detecta la primera fila inconsistente">
          <Icon name="shield-check" size={11} color="#fff" />{pending ? "Verificando…" : "Verificar cadena"}
        </button>
        {broken ? (
          <button className="btn" style={{ flex: 1, minWidth: 120, fontSize: 10.5, padding: "7px 12px", background: "#0a0a0a", color: "#fff", border: "1px solid #0a0a0a" }} onClick={repair} disabled={pending} title="Recomputa hashes en orden de id (solo admin)">
            <Icon name="rotate-cw" size={11} color="#fff" />Reparar cadena
          </button>
        ) : null}
        <button className="btn" style={{ fontSize: 10.5, padding: "7px 12px" }} onClick={onExport} title="Descarga CSV con los eventos filtrados actuales">
          <Icon name="file-down" size={11} />Exportar
        </button>
      </div>
    </div>
  );
}

function SegRange({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const opts: { k: RangeKey; l: string; i?: string }[] = [
    { k: "1h", l: "1h" },
    { k: "24h", l: "24h" },
    { k: "7d", l: "7d" },
    { k: "30d", l: "30d" },
    { k: "custom", l: "Custom", i: "calendar" },
  ];
  return (
    <div style={{ display: "inline-flex", background: "#f5f5f5", borderRadius: 9999, padding: 3 }}>
      {opts.map((o) => (
        <button
          key={o.k}
          type="button"
          aria-pressed={value === o.k}
          onClick={() => onChange(o.k)}
          style={{ border: 0, background: value === o.k ? "#0a0a0a" : "transparent", color: value === o.k ? "#fff" : "#737373", padding: "7px 14px", borderRadius: 9999, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {o.i && <Icon name={o.i} size={11} color={value === o.k ? "#fff" : "#737373"} />}
          {o.l}
        </button>
      ))}
    </div>
  );
}

function CustomRangePicker({
  from,
  to,
  onFrom,
  onTo,
  onClose,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onClose: () => void;
}) {
  const invalid = from > to;
  return (
    <>
      <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div
        className="card"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          zIndex: 41,
          padding: 14,
          minWidth: 260,
          boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
        }}
      >
        <div className="label-mp" style={{ marginBottom: 10 }}>Rango personalizado</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
            Desde
            <input type="date" value={from} max={to} onChange={(e) => onFrom(e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 12 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
            Hasta
            <input type="date" value={to} min={from} onChange={(e) => onTo(e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 12 }} />
          </label>
        </div>
        {invalid && (
          <div style={{ fontSize: 10.5, color: "#dc2626", marginTop: 8, fontWeight: 700 }}>La fecha inicial debe ser anterior a la final.</div>
        )}
        <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 12, fontSize: 11 }} disabled={invalid} onClick={onClose}>
          Aplicar
        </button>
      </div>
    </>
  );
}

function SegSev({ value, onChange }: { value: string; onChange: (v: "all" | Sev) => void }) {
  const opts: { k: "all" | Sev; l: string; c: string }[] = [
    { k: "all", l: "Toda severidad", c: "#737373" },
    { k: "info", l: "Info", c: "#52525b" },
    { k: "warn", l: "Warn", c: "#fbbf24" },
    { k: "critical", l: "Critical", c: "#dc2626" },
  ];
  return (
    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {opts.map((o) => {
        const on = value === o.k;
        return (
          <button key={o.k} onClick={() => onChange(o.k)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 9999, background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: o.c }} />
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

function ExportMenu({ onExport }: { onExport: (fmt: "csv" | "json") => void }) {
  const [open, setOpen] = useState(false);
  const opts: { fmt: "csv" | "json"; i: string; l: string; s: string }[] = [
    { fmt: "csv", i: "file-text", l: "CSV · vista actual", s: "Con los filtros aplicados" },
    { fmt: "json", i: "braces", l: "JSON · raw events", s: "Eventos estructurados" },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
        <Icon name="download" size={13} />Exportar<Icon name="chevron-down" size={11} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 51, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.12)", padding: 6, minWidth: 220 }}>
            {opts.map((o) => (
              <button key={o.fmt} onClick={() => { setOpen(false); onExport(o.fmt); }} className="mp-export-opt" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <Icon name={o.i} size={14} color="var(--primary)" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{o.l}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{o.s}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EventDrawer({ e, close }: { e: Ev; close: () => void }) {
  const toast = useToast();
  const sevMeta = { info: { c: "#52525b", l: "Info", bg: "var(--muted)" }, warn: { c: "#92400e", l: "Warn", bg: "#fef3c7" }, critical: { c: "#dc2626", l: "Critical", bg: "#fee2e2" } }[e.sev];
  const rawJson = {
    request_id: e.reqId,
    ts: e.t + "Z",
    actor: { email: e.who, type: e.actorType, ip: e.ip, geo: e.geo, user_agent: e.ua },
    action: e.action,
    target: e.target,
    severity: e.sev,
    diff: e.diff || null,
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ icon: "copy", title: label + " copiado" });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar" });
    }
  };
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.55)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(evt) => evt.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "#fff", height: "100%", overflow: "auto", boxShadow: "-12px 0 32px rgba(0,0,0,0.18)", animation: "mpSlideIn 220ms cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ background: "#0a0a0a", color: "#fff", padding: 22, position: "relative", overflow: "hidden" }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse at 85% 20%, rgba(220,38,38,0.18), transparent 60%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", paddingRight: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span className="label-mp" style={{ color: "#fca5a5" }}>● Evento de auditoría</span>
              <span style={{ padding: "3px 9px", borderRadius: 9999, background: sevMeta.bg, color: sevMeta.c, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>{sevMeta.l}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25 }}>{e.actionLabel}</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginTop: 6, wordBreak: "break-all" }}>{e.action}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{e.target}</div>
            <div style={{ display: "flex", gap: 18, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", fontSize: 11 }}>
              <DStat l="Cuándo" v={e.t.replace("T", " ") + " UTC"} />
              <DStat l="Request" v={e.reqId} />
            </div>
          </div>
          <button
            type="button"
            onClick={(evt) => {
              evt.stopPropagation();
              close();
            }}
            aria-label="Cerrar"
            className="mp-press mp-focus-ring-circle"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 3,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              lineHeight: 1,
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
        </div>

        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ marginBottom: 10 }}>Actor</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: e.avBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>{e.av}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.who}</div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 1, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{e.actorType}</div>
            </div>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5, padding: "6px 11px" }} onClick={() => toast({ icon: "external-link", title: "Ver perfil · próximamente" })}>
              <Icon name="external-link" size={11} />Ver perfil
            </button>
          </div>
        </div>

        {e.diff && (
          <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div className="label-mp">Cambios aplicados</div>
              <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>{e.diff.length} campo{e.diff.length === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {e.diff.map((d, i) => (
                <div key={i} style={{ padding: 10, borderRadius: 8, background: "#fafafa", border: "1px solid var(--border)" }}>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--muted-fg)", marginBottom: 6 }}>{d.k}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    <span style={{ flex: 1, padding: "4px 8px", borderRadius: 5, background: "rgba(220,38,38,0.08)", color: "#b91c1c", textDecoration: "line-through" }}>{d.a}</span>
                    <Icon name="arrow-right" size={12} color="var(--muted-fg)" />
                    <span style={{ flex: 1, padding: "4px 8px", borderRadius: 5, background: "rgba(16,185,129,0.1)", color: "#047857", fontWeight: 800 }}>{d.b}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ marginBottom: 10 }}>Request metadata</div>
          <KV k="IP" v={e.ip || "—"} mono />
          <KV k="Ubicación" v={e.geo} />
          <KV k="User-Agent" v={e.ua} mono />
          <KV k="Request ID" v={e.reqId} mono onCopy={() => copy(e.reqId, "Request ID")} />
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="label-mp">Raw event</div>
            <button onClick={() => copy(JSON.stringify(rawJson, null, 2), "JSON")} style={{ background: "transparent", border: 0, color: "var(--primary)", fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="copy" size={11} color="var(--primary)" />Copiar JSON
            </button>
          </div>
          <pre style={{ margin: 0, padding: 14, borderRadius: 8, background: "#0a0a0a", color: "#34d399", fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.6, overflow: "auto", maxHeight: 260 }}>{JSON.stringify(rawJson, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function DStat({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>{l}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginTop: 3, fontFamily: "ui-monospace, monospace" }}>{v}</div>
    </div>
  );
}

function KV({ k, v, mono, onCopy }: { k: string; v: string; mono?: boolean; onCopy?: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px dashed var(--border)", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700, flexShrink: 0 }}>{k}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: mono ? "ui-monospace, monospace" : "inherit", wordBreak: "break-all" }}>{v}</span>
        {onCopy && (
          <button onClick={onCopy} aria-label="Copiar" style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", padding: 0, display: "inline-flex", flexShrink: 0 }}>
            <Icon name="copy" size={10} />
          </button>
        )}
      </span>
    </div>
  );
}
