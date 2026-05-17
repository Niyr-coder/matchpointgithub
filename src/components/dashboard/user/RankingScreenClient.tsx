// Client child de RankingScreen — recibe data ya fetcheada del server.
"use client";
import { useMemo, useState } from "react";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import type { RankingEntry, RankingSnapshot } from "@/lib/schemas/ranking";

type Props = {
  entries: RankingEntry[];
  meUserId: string | null;
  history: RankingSnapshot[];
  isPremium: boolean;
};

const W = 360;
const H = 100;
const MIN_PODIUM = 3;
const MIN_ROWS = 7;

type SlotEntry = (RankingEntry & { placeholder?: false }) | { placeholder: true; rank: number };

function padPodium(arr: RankingEntry[]): SlotEntry[] {
  const out: SlotEntry[] = arr.slice(0, 3).map((e) => ({ ...e, placeholder: false }));
  while (out.length < MIN_PODIUM) {
    out.push({ placeholder: true, rank: out.length + 1 });
  }
  return out;
}

function padRows(arr: RankingEntry[]): SlotEntry[] {
  const real: SlotEntry[] = arr.slice(3).map((e) => ({ ...e, placeholder: false }));
  const need = Math.max(0, MIN_ROWS - real.length);
  const startRank = real.length > 0 ? real[real.length - 1].rank + 1 : 4;
  for (let i = 0; i < need; i++) {
    real.push({ placeholder: true, rank: startRank + i });
  }
  return real;
}

function ratingDisplay(r: number): string {
  return (r / 1000).toFixed(2);
}

function buildChartPaths(history: RankingSnapshot[]): { line: string; area: string; lastY: number } | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt));
  const values = sorted.map((s) => s.rating);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const lastY = H - ((values[values.length - 1] - min) / range) * H;
  return { line, area, lastY };
}

// ELO → MP Rating bands (ELO/1000).
const CATEGORY_RANGES: Record<string, [number, number]> = {
  "Open": [0, 99999],
  "3.0-3.5": [3000, 3500],
  "3.5-4.0": [3500, 4000],
  "4.0+": [4000, 99999],
};

const PERIOD_DAYS: Record<string, number> = {
  "30d": 30,
  "90d": 90,
  "Año": 365,
};

const STARTING_RATING = 2500; // MP Rating 2.5 — punto de partida estándar.

// Si la API no devolvió suficientes snapshots, sintetizamos una linea baseline
// para que el chart siempre tenga forma (no sirve de nada un placeholder vacío
// cuando ya sabemos el punto de partida del producto).
function ensureChartHistory(
  history: RankingSnapshot[],
  currentRating: number | null,
  periodDays: number,
): RankingSnapshot[] {
  if (history.length >= 2) return history;
  const now = new Date();
  const past = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const end = currentRating ?? STARTING_RATING;
  return [
    { rating: STARTING_RATING, rankPosition: null, snapshotAt: past.toISOString() },
    { rating: end, rankPosition: null, snapshotAt: now.toISOString() },
  ];
}

export function RankingScreenClient({ entries, meUserId, history, isPremium }: Props) {
  // Realtime: leaderboard cambia cuando alguien sube rating; tu history al confirmar match.
  useRealtimeRefresh(
    [
      { table: "player_stats" },
      ...(meUserId ? [{ table: "ranking_snapshots", filter: `user_id=eq.${meUserId}` }] : []),
    ],
    { debounceMs: 1500 },
  );

  const me = meUserId ? entries.find((e) => e.userId === meUserId) ?? null : null;
  const meCity = me?.city ?? null;

  const [scope, setScope] = useState("Nacional");
  const [category, setCategory] = useState("Open");
  const [period, setPeriod] = useState("30d");

  // Filter pipeline: scope → category → re-rank.
  const filtered = entries.filter((e) => {
    if (scope === "Ciudad" && meCity && e.city !== meCity) return false;
    if (scope === "Club") return false; // requires clubId in ranking schema
    const [min, max] = CATEGORY_RANGES[category];
    if (e.currentRating < min || e.currentRating >= max) return false;
    return true;
  });
  // Re-rank within the filtered slice so the podium shows #1/#2/#3 sin huecos.
  const reranked = filtered.map((e, i) => ({ ...e, rank: i + 1 }));

  const podium = padPodium(reranked);
  const rows = padRows(reranked);

  // Period applies only to the chart. Date.now() encapsulado en useMemo para
  // que el render sea puro (re-evalúa sólo cuando cambia el período).
  const periodDays = PERIOD_DAYS[period];
  const cutoff = useMemo(
    // Date.now() dentro de useMemo con dep explícita: solo re-evalúa cuando cambia
    // el período. El linter no distingue este patrón legítimo.
    // eslint-disable-next-line react-hooks/purity
    () => Date.now() - periodDays * 24 * 60 * 60 * 1000,
    [periodDays],
  );
  const realInRange = history.filter((s) => +new Date(s.snapshotAt) >= cutoff);
  const currentRating = me?.currentRating ?? null;
  const chartHistory = ensureChartHistory(realInRange, currentRating, periodDays);
  const chart = buildChartPaths(chartHistory);

  // Delta = current vs first point in range (sintético o real).
  const displayRating = currentRating ?? STARTING_RATING;
  const sortedHistory = [...chartHistory].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt));
  const diff = displayRating - sortedHistory[0].rating;
  const deltaLabel = diff === 0
    ? "= 0.00"
    : `${diff >= 0 ? "↑" : "↓"} ${(Math.abs(diff) / 1000).toFixed(2)}`;

  const scopeDisabled = (opt: string) => {
    if (opt === "Ciudad" && !meCity) return true;
    if (opt === "Club") return true;
    return false;
  };

  const emptyLabel = (() => {
    if (scope === "Ciudad" && !meCity) return "Aún no tienes ciudad asignada a tu perfil";
    if (scope === "Club") return "Ranking por club: próximamente";
    if (filtered.length === 0 && entries.length > 0) return `Sin jugadores en categoría ${category}`;
    return null;
  })();

  return (
    <>
      <div className="card" style={{ padding: "20px 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div className="label-mp">Leaderboard</div>
            <div
              className="font-heading"
              style={{
                fontWeight: 900,
                fontSize: 36,
                textTransform: "uppercase",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                marginTop: 6,
              }}
            >
              Ranking<span className="dot">.</span>
            </div>
            <div style={{ color: "var(--muted-fg)", fontSize: 13, marginTop: 6 }}>
              {filtered.length > 0
                ? `${filtered.length} ${filtered.length === 1 ? "jugador" : "jugadores"} · ${scope}${scope !== "Nacional" && meCity ? " (" + meCity + ")" : ""} · ${category}`
                : "Aún sin partidos oficiales"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <FilterGroup
              label="Ámbito"
              options={["Nacional", "Ciudad", "Club"]}
              value={scope}
              onChange={setScope}
              isDisabled={scopeDisabled}
            />
            <FilterGroup
              label="Categoría"
              options={["Open", "3.0-3.5", "3.5-4.0", "4.0+"]}
              value={category}
              onChange={setCategory}
            />
            <FilterGroup label="Periodo" options={["30d", "90d", "Año"]} value={period} onChange={setPeriod} />
          </div>
        </div>
      </div>

      {emptyLabel && (
        <div
          style={{
            padding: "12px 18px",
            background: "var(--muted)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12.5,
            color: "var(--muted-fg)",
          }}
        >
          {emptyLabel}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <div
          className="card"
          style={{
            padding: 24,
            background: "#0a0a0a",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
            border: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.22), transparent 60%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div className="label-mp" style={{ color: "#34d399" }}>
              Top 3 · {scope}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.15fr 1fr",
                gap: 12,
                marginTop: 24,
                alignItems: "end",
              }}
            >
              {[podium[1], podium[0], podium[2]].map((p, i) => (
                <PodiumSpot key={p.placeholder ? `ph-${p.rank}` : p.userId} entry={p} center={i === 1} />
              ))}
            </div>
          </div>
        </div>

        {isPremium ? (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="label-mp">Tu evolución · {period}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                <div
                  className="font-heading tabular"
                  style={{
                    fontWeight: 900,
                    fontSize: 44,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {ratingDisplay(displayRating)}
                </div>
                <div
                  style={{
                    color: diff > 0 ? "var(--primary)" : diff < 0 ? "#dc2626" : "var(--muted-fg)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {deltaLabel}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4 }}>
                {realInRange.length >= 2
                  ? "MP Rating oficial"
                  : currentRating != null
                    ? "Reporta más partidos para ver tu historial"
                    : "MP Rating inicial · juega tu primer partido"}
              </div>
            </div>
            <span className="chip-green">
              <span className="chip-dot" />
              {diff > 0 ? "Subiendo" : diff < 0 ? "Bajando" : "Estable"}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: 110, marginTop: 18, display: "block" }}
          >
            <defs>
              <linearGradient id="rk-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            {chart && (
              <>
                <path d={chart.area} fill="url(#rk-fill)" />
                <path
                  d={chart.line}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={W} cy={chart.lastY} r="5" fill="#10b981" stroke="#fff" strokeWidth="2" />
              </>
            )}
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--muted-fg)",
              marginTop: 4,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            <span>Hace {period}</span>
            <span>Hoy</span>
          </div>
        </div>
        ) : (
          <PremiumEvolutionTeaser currentRating={displayRating} />
        )}
      </div>

      <div className="card">
        <div
          style={{
            padding: "14px 24px",
            borderBottom: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "60px 1.5fr 1fr 90px 90px",
            gap: 16,
            alignItems: "center",
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          <div>Pos</div>
          <div>Jugador</div>
          <div>Ciudad</div>
          <div style={{ textAlign: "right" }}>Rating</div>
          <div style={{ textAlign: "right" }}>Wins</div>
        </div>
        {rows.map((p) => {
          const isMe = !p.placeholder && p.userId === meUserId;
          return (
            <div
              key={p.placeholder ? `ph-${p.rank}` : p.userId}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1.5fr 1fr 90px 90px",
                gap: 16,
                alignItems: "center",
                padding: "14px 24px",
                borderTop: "1px solid var(--border)",
                background: isMe ? "rgba(16,185,129,0.06)" : "#fff",
                opacity: p.placeholder ? 0.45 : 1,
              }}
            >
              <div
                className="font-heading tabular"
                style={{
                  fontWeight: 900,
                  fontSize: 17,
                  color: isMe ? "var(--primary)" : "#0a0a0a",
                }}
              >
                #{p.rank}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: p.placeholder
                      ? "linear-gradient(135deg, #e5e5e5, #d4d4d4)"
                      : `linear-gradient(135deg, hsl(${(p.rank * 47) % 360}, 55%, 45%), hsl(${(p.rank * 47 + 60) % 360}, 60%, 35%))`,
                    flexShrink: 0,
                    border: p.placeholder ? "1px dashed var(--border)" : "0",
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: p.placeholder ? "var(--muted-fg)" : "inherit" }}>
                    {p.placeholder ? "—" : p.displayName}
                    {isMe && (
                      <span className="chip-green" style={{ marginLeft: 8, fontSize: 9 }}>
                        Tú
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                {p.placeholder ? "—" : p.city ?? "—"}
              </div>
              <div
                className="font-heading tabular"
                style={{
                  fontWeight: 900,
                  fontSize: 16,
                  textAlign: "right",
                  color: p.placeholder ? "var(--muted-fg)" : "inherit",
                }}
              >
                {p.placeholder ? "—" : ratingDisplay(p.currentRating)}
              </div>
              <div
                className="tabular"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: "right",
                  color: p.placeholder ? "var(--muted-fg)" : "var(--primary)",
                }}
              >
                {p.placeholder ? "—" : `${p.wins}/${p.matchesTotal}`}
              </div>
            </div>
          );
        })}
        <div style={{ padding: 16, borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <button className="btn btn-outline">Ver top 100</button>
        </div>
      </div>
    </>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  isDisabled?: (opt: string) => boolean;
}) {
  return (
    <div>
      <div className="label-mp" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "inline-flex", background: "#f5f5f5", borderRadius: 9999, padding: 3 }}>
        {options.map((o) => {
          const dis = isDisabled?.(o) ?? false;
          return (
            <button
              key={o}
              onClick={() => !dis && onChange(o)}
              disabled={dis}
              title={dis ? "No disponible" : undefined}
              style={{
                border: 0,
                background: value === o ? "#0a0a0a" : "transparent",
                color: value === o ? "#fff" : dis ? "#bfbfbf" : "#737373",
                padding: "6px 14px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: dis ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: dis ? 0.5 : 1,
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PodiumSpot({ entry, center }: { entry: SlotEntry; center: boolean }) {
  const heights = center ? 140 : 110;
  const colors: Record<number, string> = { 1: "#fbbf24", 2: "#a1a1aa", 3: "#d97706" };
  const c = colors[entry.rank] ?? "#a1a1aa";
  return (
    <div style={{ textAlign: "center", position: "relative", opacity: entry.placeholder ? 0.55 : 1 }}>
      <div
        style={{
          width: center ? 72 : 56,
          height: center ? 72 : 56,
          borderRadius: "50%",
          margin: "0 auto",
          background: entry.placeholder
            ? "linear-gradient(135deg, #3a3a3e, #2a2a2e)"
            : `linear-gradient(135deg, hsl(${entry.rank * 70}, 55%, 45%), hsl(${entry.rank * 70 + 60}, 60%, 35%))`,
          border: `3px solid ${c}`,
        }}
      />
      <div style={{ marginTop: 10, fontSize: center ? 14 : 12, fontWeight: 700 }}>
        {entry.placeholder ? "Vacante" : entry.displayName}
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
        {entry.placeholder ? "—" : entry.city ?? "—"}
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontWeight: 900,
          fontSize: center ? 26 : 20,
          color: "#34d399",
          marginTop: 6,
          lineHeight: 1,
        }}
      >
        {entry.placeholder ? "—" : ratingDisplay(entry.currentRating)}
      </div>
      <div
        style={{
          marginTop: 12,
          height: heights,
          background: `linear-gradient(180deg, ${c} 0%, transparent 100%)`,
          borderRadius: "8px 8px 0 0",
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 14,
        }}
      >
        <div
          className="font-heading"
          style={{
            fontWeight: 900,
            fontSize: center ? 56 : 40,
            color: "#000",
            letterSpacing: "-0.05em",
            lineHeight: 1,
          }}
        >
          {entry.rank}
        </div>
      </div>
    </div>
  );
}

// Teaser que reemplaza el card "Tu evolución" cuando el user es Free.
// Muestra rating actual + lista de features Premium gateadas + CTA a /dashboard/user/mi-plan.
function PremiumEvolutionTeaser({ currentRating }: { currentRating: number }) {
  return (
    <div
      className="card"
      style={{
        padding: 24,
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
        color: "#fff",
        border: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 90% 10%, rgba(251,191,36,0.18), transparent 60%)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="label-mp" style={{ color: "#fbbf24" }}>Tu evolución</div>
            <div
              className="font-heading tabular"
              style={{ fontWeight: 900, fontSize: 36, lineHeight: 1, letterSpacing: "-0.03em", marginTop: 8 }}
            >
              {ratingDisplay(currentRating)}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
              MP Rating actual
            </div>
          </div>
          <span
            style={{
              background: "rgba(251,191,36,0.15)",
              color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.4)",
              padding: "4px 10px",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Premium
          </span>
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "18px 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 12.5,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {[
            "Evolución mensual de tu MP Rating",
            "Tendencia 30d / 90d / Año",
            "Head-to-head con tus rivales",
          ].map((t) => (
            <li key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#fbbf24" }}>•</span>
              {t}
            </li>
          ))}
        </ul>
        <a
          href="/dashboard/user/mi-plan"
          className="btn"
          style={{
            marginTop: 18,
            background: "#fbbf24",
            color: "#0a0a0a",
            border: 0,
            fontWeight: 900,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Activar Premium →
        </a>
      </div>
    </div>
  );
}
