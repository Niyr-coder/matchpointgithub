// Sparkline interactivo del MP Rating. Renderiza línea (opcional área) y
// permite hover: guía vertical + dot snap + tooltip con fecha y rating.
// Usado en /dashboard/user (MpRatingWidget) y en /ranking (Tu evolución).
"use client";
import { useMemo, useRef, useState } from "react";

type Point = { rating: number; snapshotAt: string };

type Props = {
  points: Point[];
  width?: number;
  height?: number;
  color?: string;
  withArea?: boolean;
  strokeWidth?: number;
};

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
}

function ratingDisplay(r: number): string {
  return (r / 1000).toFixed(2);
}

export function RatingSparkline({
  points,
  width = 360,
  height = 100,
  color = "#10b981",
  withArea = true,
  strokeWidth = 2.5,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const data = useMemo(() => {
    if (points.length < 2) return null;
    const markerRadius = 4;
    const padding = Math.max(7, strokeWidth + markerRadius + 1);
    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);
    const sorted = [...points].sort(
      (a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt),
    );
    const values = sorted.map((p) => p.rating);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const coords = sorted.map((p, i) => ({
      x: padding + (i / (sorted.length - 1)) * innerWidth,
      y: padding + (1 - (p.rating - min) / range) * innerHeight,
      rating: p.rating,
      snapshotAt: p.snapshotAt,
    }));
    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`)
      .join(" ");
    const baseline = height - padding;
    const first = coords[0];
    const last = coords[coords.length - 1];
    const area = `${line} L${last.x},${baseline} L${first.x},${baseline} Z`;
    return { coords, line, area, last, markerRadius };
  }, [points, width, height, strokeWidth]);

  if (!data) return null;

  const gradId = `rk-fill-${color.replace("#", "")}`;
  const hover = hoverIdx != null ? data.coords[hoverIdx] : null;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    // x normalizado al viewBox.
    const xVB = (relX / rect.width) * width;
    // índice más cercano.
    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < data.coords.length; i++) {
      const d = Math.abs(data.coords[i].x - xVB);
      if (d < bestDist) {
        bestDist = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height, cursor: "crosshair" }}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block", overflow: "visible" }}
      >
        {withArea && (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {withArea && <path d={data.area} fill={`url(#${gradId})`} />}
        <path
          d={data.line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Punto final destacado, dentro del viewBox para que no se corte. */}
        <circle
          cx={data.last.x}
          cy={data.last.y}
          r={hover ? 2.5 : data.markerRadius}
          fill={color}
          stroke="#fff"
          strokeWidth={1.75}
        />

        {/* Hover guide + dot snap */}
        {hover && (
          <>
            <line
              x1={hover.x}
              y1={0}
              x2={hover.x}
              y2={height}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <circle cx={hover.x} cy={hover.y} r={6} fill={color} stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>

      {/* Tooltip — posición relativa al hoverX, evitando overflow */}
      {hover && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${(hover.x / width) * 100}%`,
            transform: `translate(${hover.x > width * 0.5 ? "calc(-100% - 8px)" : "8px"}, -4px)`,
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            pointerEvents: "none",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            whiteSpace: "nowrap",
            fontFamily: "inherit",
            zIndex: 2,
          }}
        >
          <div
            className="font-heading tabular"
            style={{ fontSize: 14, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            {ratingDisplay(hover.rating)}
            <span style={{ color, marginLeft: 2 }}>.</span>
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
              marginTop: 3,
            }}
          >
            {fmtDate(hover.snapshotAt)}
          </div>
        </div>
      )}
    </div>
  );
}
