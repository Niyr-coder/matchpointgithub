"use client";

import type { CSSProperties } from "react";
import { Icon } from "@/components/Icon";

export type MpBadgeVariant = "solid" | "soft" | "icon-only" | "dot";
export type MpBadgeSize = "sm" | "md";

export type MpBadgeProps = {
  label: string;
  title?: string;
  icon?: string | null;
  variant?: MpBadgeVariant;
  size?: MpBadgeSize;
  color?: string;
  background?: string;
  borderColor?: string;
  iconColor?: string;
  className?: string;
  style?: CSSProperties;
};

const SIZE_STYLE: Record<MpBadgeSize, { fontSize: number; icon: number; padX: number; padY: number; dot: number }> = {
  sm: { fontSize: 9, icon: 9, padX: 7, padY: 2, dot: 5 },
  md: { fontSize: 10.5, icon: 12, padX: 10, padY: 4, dot: 6 },
};

export function MpBadge({
  label,
  title,
  icon,
  variant = "soft",
  size = "sm",
  color = "#0a0a0a",
  background = "var(--muted)",
  borderColor = "var(--border)",
  iconColor,
  className,
  style,
}: MpBadgeProps) {
  const s = SIZE_STYLE[size];
  const isIconOnly = variant === "icon-only";
  const isSolid = variant === "solid";
  const fg = isSolid ? "#fff" : color;
  const bg = variant === "dot" ? "transparent" : isSolid ? color : background;
  const border = variant === "dot" ? "transparent" : isSolid ? color : borderColor;
  const resolvedIconColor = iconColor ?? fg;

  return (
    <span
      className={className}
      title={title ?? label}
      aria-label={isIconOnly ? title ?? label : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: variant === "dot" ? 5 : 4,
        width: isIconOnly ? (size === "sm" ? 14 : 22) : undefined,
        height: isIconOnly ? (size === "sm" ? 14 : 22) : undefined,
        padding: isIconOnly ? 0 : `${s.padY}px ${s.padX}px`,
        borderRadius: 9999,
        background: bg,
        border: variant === "dot" ? 0 : `1px solid ${border}`,
        color: fg,
        fontSize: s.fontSize,
        fontWeight: 900,
        letterSpacing: "0.08em",
        lineHeight: 1,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
        ...style,
      }}
    >
      {variant === "dot" ? (
        <span
          aria-hidden
          style={{
            width: s.dot,
            height: s.dot,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
      ) : icon ? (
        <Icon name={icon} size={s.icon} color={resolvedIconColor} />
      ) : null}
      {!isIconOnly && label}
    </span>
  );
}
