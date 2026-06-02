"use client";

import React from "react";

export function MPMark({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: "#0a0a0a",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontFamily: "var(--font-heading)",
        fontSize: size * 0.42,
        letterSpacing: "-0.05em",
      }}
    >
      M<span style={{ color: "var(--primary)" }}>.</span>
    </div>
  );
}

export function AvatarBlob({
  size = 96,
  tone = "linear-gradient(135deg,#10b981,#047857)",
  label = "CR",
  ring = "#fff",
  ringWidth = 4,
  square = false,
}: {
  size?: number;
  tone?: string;
  label?: string;
  ring?: string;
  ringWidth?: number;
  square?: boolean;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: square ? size * 0.16 : "50%",
        background: tone,
        border: `${ringWidth}px solid ${ring}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "var(--font-heading)",
        fontWeight: 900,
        fontSize: size * 0.34,
        letterSpacing: "-0.04em",
        flexShrink: 0,
      }}
    >
      {label}
    </div>
  );
}

export function Sparkline({
  data,
  w = 220,
  h = 60,
  stroke = "var(--primary)",
  fill = "rgba(16,185,129,0.12)",
}: {
  data: number[];
  w?: number;
  h?: number;
  stroke?: string;
  fill?: string;
}) {
  if (!data?.length) return null;
  const series = data.length < 2 ? [data[0], data[data.length - 1]] : data;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  const pad = span || 0.08;
  const baseMin = span ? min : min - pad / 2;
  const range = span || pad;
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => [i * step, h - ((v - baseMin) / range) * (h - 8) - 4]);
  const line = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) =>
        i === pts.length - 1 ? (
          <circle key={i} cx={x} cy={y} r="3.5" fill={stroke} stroke="#fff" strokeWidth="2" />
        ) : null,
      )}
    </svg>
  );
}

export function ViewLabel({ kind }: { kind: "mine" | "public" }) {
  const isMine = kind === "mine";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 9999,
        background: isMine ? "#0a0a0a" : "rgba(16,185,129,0.12)",
        color: isMine ? "#fff" : "var(--primary)",
        fontFamily: "var(--font-sans)",
        fontWeight: 900,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      {isMine ? "Vista propia" : "Vista pública · cómo te ven"}
    </div>
  );
}
