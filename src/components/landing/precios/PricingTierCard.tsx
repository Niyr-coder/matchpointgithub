"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  type BillingPeriod,
  type SalesPreset,
  type Tier,
  annualSavings,
  effectiveMonthlyPrice,
} from "@/lib/pricing/tiers";

type Props = {
  tier: Tier;
  billing: BillingPeriod;
  /** Invoked when the CTA is "contact" (opens sales form). */
  onContact?: (preset: SalesPreset) => void;
  /** Telemetry hook fired on CTA click. */
  onCtaClick?: (tier: Tier) => void;
};

const HIGHLIGHT_BADGES: Record<NonNullable<Tier["highlight"]>, string> = {
  recommended: "Recomendado",
  "most-popular": "Más popular",
  enterprise: "Personalizado",
};

export function PricingTierCard({ tier, billing, onContact, onCtaClick }: Props) {
  const highlighted = tier.highlight !== null;
  const monthly = effectiveMonthlyPrice(tier, billing);
  const savings = billing === "anual" ? annualSavings(tier) : 0;
  const isAnnualBillable =
    billing === "anual" && tier.annual !== null && tier.annual > 0 && tier.monthly !== null && tier.monthly > 0;

  return (
    <div
      className="card"
      style={{
        padding: 26,
        border: highlighted ? "2px solid var(--primary)" : "1px solid var(--border)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {highlighted && tier.highlight && (
        <span
          style={{
            position: "absolute",
            top: -12,
            left: 26,
            background: "var(--primary)",
            color: "#0a0a0a",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.14em",
            padding: "4px 9px",
            borderRadius: 6,
            textTransform: "uppercase",
          }}
        >
          {HIGHLIGHT_BADGES[tier.highlight]}
        </span>
      )}
      {tier.subBadge && (
        <span
          style={{
            position: "absolute",
            top: -12,
            right: 26,
            background: "var(--card)",
            color: "var(--muted-fg)",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.14em",
            padding: "4px 9px",
            borderRadius: 6,
            textTransform: "uppercase",
            border: "1px solid var(--border)",
          }}
        >
          {tier.subBadge}
        </span>
      )}

      <div className="label-mp" style={{ color: "var(--muted-fg)" }}>
        {tier.name}
      </div>

      <PriceBlock
        monthly={monthly}
        billing={billing}
        isAnnualBillable={isAnnualBillable}
        annualTotal={tier.annual}
        savings={savings}
        custom={tier.monthly === null}
      />

      <p
        style={{
          fontSize: 12.5,
          color: "var(--muted-fg)",
          lineHeight: 1.5,
          margin: "0 0 18px",
        }}
      >
        {tier.description}
      </p>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 22px",
          display: "flex",
          flexDirection: "column",
          gap: 9,
          flexGrow: 1,
        }}
      >
        {tier.bullets.map((b) => (
          <li
            key={b}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <span style={{ marginTop: 2, flexShrink: 0 }}>
              <Icon name="check-circle-2" size={14} color="var(--primary)" />
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <TierCtaButton tier={tier} onContact={onContact} onCtaClick={onCtaClick} />
    </div>
  );
}

function PriceBlock({
  monthly,
  billing,
  isAnnualBillable,
  annualTotal,
  savings,
  custom,
}: {
  monthly: number | null;
  billing: BillingPeriod;
  isAnnualBillable: boolean;
  annualTotal: number | null;
  savings: number;
  custom: boolean;
}) {
  if (custom) {
    return (
      <div
        className="font-heading"
        style={{
          fontSize: 38,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          margin: "6px 0 8px",
        }}
      >
        A medida
      </div>
    );
  }

  // Fixed-height block so cards don't jump when the annual sub-line appears.
  return (
    <div style={{ minHeight: 76, margin: "6px 0 8px" }}>
      <div
        className="font-heading"
        style={{
          fontSize: 38,
          fontWeight: 900,
          letterSpacing: "-0.03em",
        }}
      >
        ${monthly}
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted-fg)" }}>
          {monthly === 0 ? " /siempre" : " /mes"}
        </span>
      </div>
      <div
        aria-live="polite"
        style={{
          fontSize: 11,
          color: "var(--muted-fg)",
          marginTop: 4,
          minHeight: 16,
          transition: "opacity 120ms ease-out",
        }}
      >
        {isAnnualBillable && annualTotal !== null && (
          <span>
            facturado anualmente ${annualTotal}
            {savings > 0 ? ` (ahorra $${savings})` : ""}
            <span className="sr-only">
              {` Equivale a $${monthly} dólares por mes, facturado anualmente $${annualTotal}.`}
            </span>
          </span>
        )}
        {!isAnnualBillable && billing === "anual" && monthly === 0 && <span>&nbsp;</span>}
      </div>
    </div>
  );
}

function TierCtaButton({
  tier,
  onContact,
  onCtaClick,
}: {
  tier: Tier;
  onContact?: (preset: SalesPreset) => void;
  onCtaClick?: (tier: Tier) => void;
}) {
  const isPrimary = tier.cta.variant === "primary";
  const baseStyle = {
    width: "100%",
    justifyContent: "center" as const,
    minHeight: 44,
  };
  const className = isPrimary ? "btn btn-primary" : "btn";
  const outlineStyle = isPrimary
    ? baseStyle
    : { ...baseStyle, background: "#fff", border: "1px solid var(--border)" };

  if (tier.cta.kind === "contact") {
    return (
      <button
        type="button"
        className={className}
        style={outlineStyle}
        onClick={() => {
          onCtaClick?.(tier);
          onContact?.(tier.cta.kind === "contact" ? tier.cta.preset : { leadType: "other", message: "" });
        }}
      >
        {tier.cta.label}
      </button>
    );
  }

  return (
    <Link
      href={tier.cta.href}
      className={className}
      style={outlineStyle}
      onClick={() => onCtaClick?.(tier)}
    >
      {tier.cta.label}
    </Link>
  );
}
