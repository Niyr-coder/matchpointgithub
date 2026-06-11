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
    <button type="button" onClick={handlePrimaryClick} className="mp-upgrade-cta">
      {ctaLabel} →
    </button>
  ) : (
    <Link href={href} onClick={trackClick} className="mp-upgrade-cta mp-upgrade-cta-link">
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
        className="mp-upgrade-banner-glow"
        aria-hidden
      />
      {onDismiss && (
        <button
          type="button"
          className="mp-upgrade-close mp-upgrade-banner-dismiss"
          onClick={onDismiss}
          aria-label="Cerrar"
        >
          ×
        </button>
      )}
      <div className="mp-upgrade-banner-body">
        <div className="mp-upgrade-banner-main">
          <div className="mp-upgrade-crown mp-upgrade-banner-icon">
            <Icon name={icon} size={18} />
          </div>
          <div className="mp-upgrade-banner-copy">
            <div className="mp-upgrade-banner-title font-heading">{title}</div>
            <p className="mp-upgrade-banner-desc">{description}</p>
          </div>
        </div>
        <div className="mp-upgrade-banner-actions">{cta}</div>

        {features && features.length > 0 && (
          <div className="mp-upgrade-banner-features">
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
