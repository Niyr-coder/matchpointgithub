"use client";

import { useMemo, useState } from "react";
import { RatingSparkline } from "../../widgets/RatingSparkline";
import { usePerfilV3Data } from "./PerfilV3Context";
import { v2tk } from "./PerfilV2Shared";
import {
  RATING_RANGES,
  RATING_RANGE_META,
  type RatingRange,
  buildRatingChartPoints,
  chartAxisLabels,
  filterSnapshotsByRange,
  ratingDisplay,
} from "./ratingChartUtils";

export function V3RatingChart() {
  const me = usePerfilV3Data();
  const [range, setRange] = useState<RatingRange>("1A");
  const { days, chartLabel } = RATING_RANGE_META[range];
  const current = me.currentRatingRaw;

  const chartPoints = useMemo(
    () => buildRatingChartPoints(me.ratingSnapshots, current, days),
    [me.ratingSnapshots, current, days],
  );

  const monthLabels = useMemo(() => chartAxisLabels(chartPoints), [chartPoints]);

  const sorted = useMemo(
    () => [...chartPoints].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt)),
    [chartPoints],
  );

  const realInRange = useMemo(
    () => filterSnapshotsByRange(me.ratingSnapshots, days),
    [me.ratingSnapshots, days],
  );

  const periodStartRating = sorted[0]?.rating ?? current;
  const diff = current - periodStartRating;
  const deltaLabel =
    diff === 0 ? "= 0.00" : `${diff >= 0 ? "↑" : "↓"} ${(Math.abs(diff) / 1000).toFixed(2)}`;

  const values = sorted.map((p) => p.rating);
  const minR = values.length ? Math.min(...values) : current;
  const maxR = values.length ? Math.max(...values) : current;
  const rangeHint =
    realInRange.length >= 2
      ? `· max ${ratingDisplay(maxR)} · min ${ratingDisplay(minR)}`
      : null;

  const subText =
    realInRange.length >= 2
      ? "Pasa el mouse para ver fecha y rating"
      : "Tu nivel inicial · juega para subir";

  return (
    <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: "20px 24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 10,
          borderBottom: `1px solid ${v2tk.border}`,
        }}
      >
        <span className="label-mp" style={{ color: v2tk.muted, paddingBottom: 10 }}>
          EVOLUCIÓN RATING MPR
        </span>
        <RatingRangeTabs range={range} onChange={setRange} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="tabular profile-v3-stat-value-lg">
            {ratingDisplay(current)}
          </span>
          <span
            className="profile-v3-body-sm"
            style={{
              fontWeight: 800,
              fontSize: 11.5,
              color: diff > 0 ? v2tk.accent : diff < 0 ? v2tk.hot : v2tk.muted,
            }}
          >
            {deltaLabel}
          </span>
          {rangeHint ? (
            <span className="profile-v3-mono profile-v3-body-sm" style={{ letterSpacing: "0.06em" }}>
              {rangeHint}
            </span>
          ) : null}
          <span className="profile-v3-mono profile-v3-body-sm" style={{ letterSpacing: "0.08em", color: v2tk.mutedSoft }}>
            · {chartLabel}
          </span>
        </div>
        <div className="profile-v3-body-sm" style={{ marginTop: 4 }}>{subText}</div>
      </div>

      <div id="v3-rating-chart-panel" role="tabpanel" aria-label={`Gráfico de rating · ${chartLabel}`}>
        <RatingSparkline key={range} points={chartPoints} width={640} height={150} />
      </div>

      <div
        className="profile-v3-mono"
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9.5,
          color: v2tk.mutedSoft,
          letterSpacing: "0.08em",
        }}
      >
        {monthLabels.length > 0 ? (
          monthLabels.map((m, i) => <span key={`${range}-${i}-${m}`}>{m}</span>)
        ) : (
          <>
            <span>INICIO</span>
            <span>HOY</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Tabs de rango — mismo patrón que V2Tabs (subrayado verde, sin pill). */
function RatingRangeTabs({
  range,
  onChange,
}: {
  range: RatingRange;
  onChange: (next: RatingRange) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }} role="tablist" aria-label="Rango del gráfico de rating">
      {RATING_RANGES.map((t) => {
        const on = range === t;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="v3-rating-chart-panel"
            onClick={() => onChange(t)}
            className="profile-v3-tab"
            style={{
              border: 0,
              background: "transparent",
              padding: "10px 14px",
              borderBottom: on ? `2px solid ${v2tk.accent}` : "2px solid transparent",
              color: on ? v2tk.ink : v2tk.muted,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
