"use client";

import type { BillingPeriod } from "@/lib/pricing/tiers";
import { ANNUAL_DISCOUNT_LABEL } from "@/lib/pricing/tiers";

type Props = {
  value: BillingPeriod;
  onChange: (next: BillingPeriod) => void;
};

export function BillingToggle({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Periodo de facturación"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 4,
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 999,
        margin: "0 auto",
      }}
    >
      <ToggleButton
        label="Mensual"
        active={value === "mensual"}
        onClick={() => onChange("mensual")}
      />
      <ToggleButton
        label="Anual"
        active={value === "anual"}
        onClick={() => onChange("anual")}
        badge={ANNUAL_DISCOUNT_LABEL}
      />
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        minHeight: 36,
        padding: "8px 16px",
        borderRadius: 999,
        border: "none",
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--fg)" : "var(--muted-fg)",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: active ? 800 : 600,
        cursor: "pointer",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background 140ms ease, color 140ms ease, box-shadow 140ms ease",
      }}
    >
      {label}
      {badge && (
        <span
          style={{
            background: "var(--primary)",
            color: "#0a0a0a",
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.12em",
            padding: "2px 6px",
            borderRadius: 5,
            textTransform: "uppercase",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
