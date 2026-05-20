// Skeleton reutilizable (shimmer). Usa el keyframe global `mpSkeleton`
// (background-position) ya definido en globals.css, igual que el skeleton de
// navegación del dashboard. `dark` = sobre fondos oscuros (headers con gradiente).
//
// Reemplaza los placeholders de texto "Cargando…" por bloques que imitan el
// contenido real. Para listas, usar <SkeletonRows />.
import type { CSSProperties } from "react";

export function Skeleton({
  w = "100%",
  h,
  r = 8,
  dark = false,
  style,
}: {
  w?: number | string;
  h: number | string;
  r?: number;
  dark?: boolean;
  style?: CSSProperties;
}) {
  const base = dark ? "rgba(255,255,255,0.12)" : "var(--muted)";
  const hi = dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.05)";
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: w,
        height: h,
        borderRadius: r,
        background: `linear-gradient(90deg, ${base} 0%, ${hi} 50%, ${base} 100%)`,
        backgroundSize: "200% 100%",
        animation: "mpSkeleton 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// Filas para listas que están cargando (cada fila = una tarjeta tenue).
export function SkeletonRows({
  rows = 3,
  height = 44,
  gap = 8,
}: {
  rows?: number;
  height?: number;
  gap?: number;
}) {
  return (
    <div role="status" aria-label="Cargando" style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={height} r={10} />
      ))}
    </div>
  );
}
