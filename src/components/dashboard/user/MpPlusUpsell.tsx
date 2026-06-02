"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { MP_PLUS_PLAN, type MpPlusBenefit } from "@/lib/marketing/mp-plus";
import { trackPricingEvent } from "@/lib/telemetry/pricing";

type MpPlusUpsellProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  href?: string;
  icon?: string;
  features?: MpPlusBenefit[];
  onPrimaryClick?: () => void;
  onDismiss?: () => void;
  closing?: boolean;
  trackingSource?: string;
  style?: CSSProperties;
};

export function MpPlusUpsell({
  title,
  description,
  ctaLabel = MP_PLUS_PLAN.requestCta,
  href = "/dashboard/user/mi-plan?upgrade=premium",
  icon = "crown",
  features,
  onPrimaryClick,
  onDismiss,
  closing = false,
  trackingSource,
  style,
}: MpPlusUpsellProps) {
  const trackClick = () => {
    if (!trackingSource) return;
    trackPricingEvent({
      name: "pricing_tier_cta_clicked",
      props: {
        tier_key: MP_PLUS_PLAN.tierKey,
        audience: `dashboard_${trackingSource}`,
        billing_period: "monthly",
      },
    });
  };

  const handlePrimaryClick = () => {
    trackClick();
    onPrimaryClick?.();
  };

  const cta = onPrimaryClick ? (
    <button
      type="button"
      onClick={handlePrimaryClick}
      className="mp-upgrade-cta"
      style={ctaStyle}
    >
      {ctaLabel} →
    </button>
  ) : (
    <Link
      href={href}
      onClick={trackClick}
      className="mp-upgrade-cta"
      style={{ ...ctaStyle, textDecoration: "none", display: "inline-flex" }}
    >
      {ctaLabel}
      <Icon name="arrow-right" size={12} />
    </Link>
  );

  return (
    <div
      className="mp-upgrade-banner"
      data-closing={closing ? "true" : "false"}
      style={{
        background:
          "linear-gradient(135deg, #071510 0%, #0b1f18 52%, #0a1712 100%)",
        color: "#f8fffc",
        borderRadius: 18,
        padding: "16px 18px",
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 92% 18%, rgba(16,185,129,0.24), transparent 44%), radial-gradient(ellipse at 14% 108%, rgba(250,204,21,0.14), transparent 48%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
            <div
              className="mp-upgrade-crown"
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: "linear-gradient(135deg, #0a0a0a 0%, #123128 100%)",
                color: "#facc15",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(16,185,129,0.28)",
                boxShadow: "0 12px 26px rgba(10,10,10,0.18)",
                flexShrink: 0,
              }}
            >
              <Icon name={icon} size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                className="font-heading"
                style={{
                  fontWeight: 900,
                  fontSize: 16,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.72)",
                  marginTop: 4,
                  lineHeight: 1.45,
                  maxWidth: 620,
                }}
              >
                {description}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {cta}
            {onDismiss && (
              <button
                type="button"
                className="mp-upgrade-close"
                onClick={onDismiss}
                aria-label="Cerrar"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.72)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {features && features.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 8,
            }}
          >
            {features.map((feature) => (
              <div
                key={feature.title}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name={feature.icon} size={13} color="#34d399" />
                  <span style={{ fontSize: 11, fontWeight: 900 }}>{feature.title}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.68)", marginTop: 4, lineHeight: 1.4 }}>
                  {feature.description}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ctaStyle: CSSProperties = {
  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  padding: "11px 16px",
  borderRadius: 999,
  border: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  alignItems: "center",
  gap: 6,
};
