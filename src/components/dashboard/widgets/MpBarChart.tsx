"use client";
// MpBarChart — gráfico de barras verticales reutilizable, on-brand MATCHPOINT.
//
// Características:
// - Stagger animation al montar: cada barra "crece" desde y=0% con un retraso
//   en cascada (~30ms entre cada) usando la curva ease-out MP. Se ve vivo.
// - Hover tooltip pulido (mismo lenguaje visual que RatingSparkline): negro,
//   Plus Jakarta para el valor, Inter para el subtítulo, sombra suave.
// - Barras sin librería externa, SVG nativo (consistente con el resto del
//   repo: no agregamos recharts/victory/visx, mantenemos bundle chico).
//
// Uso típico:
//   <MpBarChart
//     data={[{label: "1", value: 12000}, ...]}
//     height={200}
//     fmtValue={(v) => `$${(v / 100).toLocaleString()}`}
//   />
import { useEffect, useRef, useState } from "react";

export type MpBarDatum = {
  /** Texto mostrado en el tooltip arriba (ej. "Vie 12 Jul"). */
  label: string;
  /** Valor numérico que define la altura de la barra. */
  value: number;
  /** Color override opcional. Si no se pasa, usa accent o el patrón week. */
  color?: string;
};

type Props = {
  data: MpBarDatum[];
  /** Altura del SVG en px. Default 180. */
  height?: number;
  /** Color principal de la mayoría de las barras (default verde MP). */
  accent?: string;
  /** Color para destacar la última barra (default = accent). */
  highlightLast?: string;
  /** Formatea el valor numérico en el tooltip. */
  fmtValue?: (v: number) => string;
  /** Si true, alterna ciertas barras en amarillo (patrón week — útil para
   * series de 30 días donde queremos marcar fines de semana). */
  weekendPattern?: boolean;
  /** Padding inferior para que el tooltip no quede recortado arriba. */
  topPadding?: number;
  /** Aria label del gráfico (accesibilidad). */
  ariaLabel?: string;
};

const ANIM_BASE_MS = 220; // duración de cada barra
const ANIM_STEP_MS = 28; // stagger entre barras

export function MpBarChart({
  data,
  height = 180,
  accent = "#0a0a0a",
  highlightLast = "var(--primary)",
  fmtValue = (v) => v.toLocaleString("en-US"),
  weekendPattern = false,
  topPadding = 8,
  ariaLabel = "Gráfico de barras",
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 16);
    return () => clearTimeout(t);
  }, []);

  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);

  const colorFor = (i: number, override?: string): string => {
    if (override) return override;
    if (i === data.length - 1 && highlightLast) return highlightLast;
    if (weekendPattern && i % 7 < 2) return "#fbbf24";
    return accent;
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", paddingTop: topPadding }}
      role="img"
      aria-label={ariaLabel}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          height,
        }}
      >
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          const fill = colorFor(i, d.color);
          const isHover = hoverIdx === i;
          // Opacidad sutil progresiva (más fuerte hacia el final).
          const baseOpacity = 0.55 + (i / data.length) * 0.45;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${d.label}: ${fmtValue(d.value)}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
              style={{
                flex: 1,
                height: mounted ? `${pct}%` : "0%",
                background: fill,
                borderRadius: "3px 3px 0 0",
                opacity: isHover ? 1 : baseOpacity,
                border: 0,
                padding: 0,
                cursor: "pointer",
                transition: `height ${ANIM_BASE_MS}ms cubic-bezier(0.23, 1, 0.32, 1) ${i * ANIM_STEP_MS}ms, opacity 140ms cubic-bezier(0.23, 1, 0.32, 1)`,
                position: "relative",
              }}
            />
          );
        })}
      </div>

      {/* Tooltip */}
      {hoverIdx !== null && (
        <MpBarTooltip
          containerRef={containerRef}
          index={hoverIdx}
          total={data.length}
          datum={data[hoverIdx]}
          fmtValue={fmtValue}
        />
      )}
    </div>
  );
}

function MpBarTooltip({
  containerRef,
  index,
  total,
  datum,
  fmtValue,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  index: number;
  total: number;
  datum: MpBarDatum;
  fmtValue: (v: number) => string;
}) {
  // Posición horizontal aproximada: index / total → % del width.
  const leftPct = ((index + 0.5) / total) * 100;
  const containerWidth = containerRef.current?.offsetWidth ?? 0;
  // Cuando el tooltip va al borde, lo desplazamos a la izquierda para no clip.
  const TOOLTIP_W = 140;
  const halfW = TOOLTIP_W / 2;
  const leftPx = (leftPct / 100) * containerWidth;
  const clampedLeft = Math.max(halfW, Math.min(containerWidth - halfW, leftPx));
  return (
    <div
      style={{
        position: "absolute",
        left: clampedLeft,
        top: -4,
        transform: "translateX(-50%)",
        background: "#0a0a0a",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: 8,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        pointerEvents: "none",
        minWidth: TOOLTIP_W,
        textAlign: "center",
        zIndex: 10,
        animation: "mpBarTooltipIn 140ms cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {datum.label}
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          color: "var(--primary)",
          marginTop: 2,
        }}
      >
        {fmtValue(datum.value)}
      </div>
      <style jsx>{`
        @keyframes mpBarTooltipIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
