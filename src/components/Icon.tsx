"use client";
import * as LucideIcons from "lucide-react";
import type { CSSProperties } from "react";

// Adaptador del prototipo: en el HTML original se usa `<i data-lucide="kebab-name" />`.
// Acá convertimos "kebab-case" → "PascalCase" y resolvemos contra los exports de lucide-react,
// que ya trae aliases legacy (AlertTriangle, ShieldAlert, etc.) además de los nombres v1.
function toPascal(name: string): string {
  return name
    .split("-")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ""))
    .join("");
}

type Props = {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
};

export function Icon({ name, size = 16, color, className, style, strokeWidth }: Props) {
  const Comp = (LucideIcons as unknown as Record<string, React.ComponentType<{
    size?: number;
    color?: string;
    className?: string;
    style?: CSSProperties;
    strokeWidth?: number;
  }>>)[toPascal(name)];
  if (!Comp) return null;
  return <Comp size={size} color={color} className={className} style={style} strokeWidth={strokeWidth} />;
}
