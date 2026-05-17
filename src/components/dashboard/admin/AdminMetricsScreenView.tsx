// Client view de AdminMetricsScreen — layout 1:1 (RoleScreens2.jsx 59-92).
"use client";
import { RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type MetricsData = {
  kpis: {
    mau: number;
    dau: number;
    gmvCents: number;
    gmvDeltaPct: number | null;
    takeRatePct: number;
  };
  bars30: number[];
  topSports: { label: string; pct: number; color: string }[];
};

function fmtCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
function fmtCompactUSD(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(0)}k`;
  return `$${Math.round(dollars)}`;
}

export function AdminMetricsScreenView({ data }: { data: MetricsData }) {
  useRealtimeRefresh([{ table: "transactions" }, { table: "reservations" }, { table: "profiles" }]);

  const deltaLabel = (n: number | null): string => (n == null ? "—" : `${n >= 0 ? "↑" : "↓"} ${Math.abs(n)}%`);
  const KPIS: [string, string, string, string][] = [
    ["MAU", fmtCompact(data.kpis.mau), "—", "var(--primary)"],
    ["DAU", fmtCompact(data.kpis.dau), "—", "var(--primary)"],
    ["GMV", fmtCompactUSD(data.kpis.gmvCents), deltaLabel(data.kpis.gmvDeltaPct), "#fbbf24"],
    ["Take rate", `${data.kpis.takeRatePct.toFixed(1)}%`, "fija", "#0a0a0a"],
  ];

  const maxBar = Math.max(...data.bars30, 1);
  const BARS = data.bars30.map((v) => 60 + (v / maxBar) * 140);

  return (
    <>
      <RSHeader
        label="Plataforma · Métricas"
        title="Analytics"
        action={
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Últimos 30 días
          </button>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {KPIS.map(([l, v, d, c]) => (
          <div key={l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 24,
                fontWeight: 900,
                marginTop: 6,
                letterSpacing: "-0.03em",
                color: c,
              }}
            >
              {v}
            </div>
            <div
              style={{
                fontSize: 11,
                color: d === "—" ? "var(--muted-fg)" : "var(--primary)",
                fontWeight: 800,
                marginTop: 4,
              }}
            >
              {d}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              margin: "0 0 14px",
            }}
          >
            GMV · 30 días<span className="dot">.</span>
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 3,
              height: 200,
              paddingTop: 10,
            }}
          >
            {BARS.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: h,
                  background:
                    i === 29 ? "var(--primary)" : i % 7 < 2 ? "#fbbf24" : "#0a0a0a",
                  borderRadius: "3px 3px 0 0",
                  opacity: 0.6 + (i / 30) * 0.4,
                }}
              />
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              textTransform: "uppercase",
              margin: "0 0 12px",
            }}
          >
            Top deportes<span className="dot">.</span>
          </h2>
          {data.topSports.length > 0 ? (
            data.topSports.map((s) => (
              <div key={s.label} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    marginBottom: 4,
                  }}
                >
                  <b>{s.label}</b>
                  <span style={{ color: "var(--muted-fg)" }}>{s.pct}%</span>
                </div>
                <div
                  style={{
                    height: 5,
                    background: "var(--muted)",
                    borderRadius: 9999,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ height: "100%", width: `${s.pct}%`, background: s.color }} />
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted-fg)", padding: "20px 0" }}>
              Sin reservas en los últimos 30 días.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
