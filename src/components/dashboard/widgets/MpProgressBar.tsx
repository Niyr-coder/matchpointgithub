"use client";
// MpProgressBar — barra horizontal con fill animado al montar.
//
// El "fill" arranca en 0% y crece hasta `pct` con curva ease-out MP. Esto
// reemplaza el patrón actual donde se ponía `width: X%` directo y la barra
// aparecía instant. Pequeño detalle, mucho más vivo.
import { useEffect, useState } from "react";

type Props = {
  /** Porcentaje 0-100. Valores fuera del rango se clampan. */
  pct: number;
  /** Altura en px. Default 6. */
  height?: number;
  /** Color del fill. Default verde MP. */
  color?: string;
  /** Color del track de fondo. Default --muted. */
  trackColor?: string;
  /** Radio de borde. Default 9999 (pill). */
  radius?: number;
  /** Duración de la animación en ms. */
  durationMs?: number;
  /** Delay para stagger en listas. */
  delayMs?: number;
};

export function MpProgressBar({
  pct,
  height = 6,
  color = "var(--primary)",
  trackColor = "var(--muted)",
  radius = 9999,
  durationMs = 700,
  delayMs = 0,
}: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const [target, setTarget] = useState(0);
  useEffect(() => {
    // RAF para que el browser renderice 0% primero y luego anime al pct real.
    const t = setTimeout(() => setTarget(clamped), 16);
    return () => clearTimeout(t);
  }, [clamped]);
  return (
    <div
      style={{
        height,
        background: trackColor,
        borderRadius: radius,
        overflow: "hidden",
        width: "100%",
      }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          height: "100%",
          width: `${target}%`,
          background: color,
          borderRadius: radius,
          transition: `width ${durationMs}ms cubic-bezier(0.23, 1, 0.32, 1) ${delayMs}ms`,
        }}
      />
    </div>
  );
}
