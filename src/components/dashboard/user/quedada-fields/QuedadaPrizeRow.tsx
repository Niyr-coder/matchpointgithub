"use client";

import { Icon } from "@/components/Icon";
import type { Prize } from "@/lib/schemas/quedadas";

export function formatPrizeMoney(cents: number): string {
  const v = cents / 100;
  return v % 1 === 0 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
}

/** Colores por puesto (1ro oro, 2do plata, 3ro bronce). */
export function quedadaPlaceStyle(place: string): { label: string; icon: string } {
  const n = place.trim().toLowerCase();
  if (/^1|primero|1ro|1°|1º/.test(n)) return { label: "#a16207", icon: "#eab308" };
  if (/^2|segundo|2do|2°|2º/.test(n)) return { label: "#52525b", icon: "#9ca3af" };
  if (/^3|tercero|3ro|3°|3º/.test(n)) return { label: "#c2410c", icon: "#d97706" };
  return { label: "var(--fg)", icon: "#f59e0b" };
}

type Props = {
  prize: Prize;
  /** Variante compacta para cards y modales de resumen. */
  compact?: boolean;
};

export function QuedadaPrizeRow({ prize, compact = false }: Props) {
  const colors = quedadaPlaceStyle(prize.place);
  const cash = prize.valueCents != null && prize.valueCents > 0 ? formatPrizeMoney(prize.valueCents) : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 8 : 10,
        fontSize: compact ? 12 : 12.5,
        minWidth: 0,
      }}
    >
      <Icon name="trophy" size={compact ? 12 : 13} color={colors.icon} />
      <span
        className="font-heading"
        style={{
          fontWeight: 900,
          minWidth: compact ? 32 : 40,
          color: colors.label,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {prize.place}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 700,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {prize.prize}
      </span>
      {cash && (
        <span
          className="tabular font-heading"
          style={{
            flexShrink: 0,
            fontSize: compact ? 11.5 : 12,
            fontWeight: 900,
            color: "#059669",
            whiteSpace: "nowrap",
          }}
          title="Premio en efectivo"
        >
          {cash}
        </span>
      )}
    </div>
  );
}
