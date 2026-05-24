"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MarketingShell } from "../MarketingShell";
import { ContactSalesForm } from "../forms/ContactSalesForm";
import { trackPricingEvent } from "@/lib/telemetry/pricing";
import {
  AUDIENCES,
  BILLING_TO_TELEMETRY,
  FAQ_GROUPS,
  audienceBySlug,
  tiersForAudience,
  type Audience,
  type AudienceConfig,
  type BillingPeriod,
  type SalesPreset,
  type Tier,
} from "@/lib/pricing/tiers";
import { BillingToggle } from "./BillingToggle";
import { AudienceTabs } from "./AudienceTabs";
import { PricingTierCard } from "./PricingTierCard";
import { PricingFeatureMatrix } from "./PricingFeatureMatrix";
import { PricingFAQ } from "./PricingFAQ";
import { PaymentExplainer } from "./PaymentExplainer";
import { PricingTrustStrip } from "./PricingTrustStrip";
import { CosmeticsCallout } from "./CosmeticsCallout";

const CONTACT_ANCHOR = "contacto-ventas";

function parseAudience(value: string | null): Audience | null {
  if (!value) return null;
  const cfg = audienceBySlug(value);
  return cfg?.audience ?? null;
}

function parseBilling(value: string | null): BillingPeriod | null {
  return value === "anual" || value === "mensual" ? value : null;
}

export function PreciosPageView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialAudience = parseAudience(searchParams.get("tab")) ?? "player";
  const initialBilling = parseBilling(searchParams.get("billing")) ?? "mensual";

  const [activeAudience, setActiveAudience] = useState<Audience>(initialAudience);
  const [billing, setBilling] = useState<BillingPeriod>(initialBilling);
  const [preset, setPreset] = useState<SalesPreset>({ leadType: "club", message: "" });
  const [presetKey, setPresetKey] = useState(0);

  // One-time mount telemetry — replaces MAT-27's now-removed hook.
  useEffect(() => {
    trackPricingEvent({ name: "pricing_page_viewed" });
  }, []);

  // Sync URL with state on change.
  const writeUrl = useCallback(
    (audience: Audience, billingPeriod: BillingPeriod) => {
      const cfg = AUDIENCES.find((a) => a.audience === audience);
      const next = new URLSearchParams(searchParams.toString());
      if (cfg) next.set("tab", cfg.slug);
      next.set("billing", billingPeriod);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // If we landed with `?tab=clubes`, scroll to the section once mounted.
  const hasInitialScrolledRef = useRef(false);
  useEffect(() => {
    if (hasInitialScrolledRef.current) return;
    const tabParam = searchParams.get("tab");
    if (!tabParam) {
      hasInitialScrolledRef.current = true;
      return;
    }
    const cfg = audienceBySlug(tabParam);
    if (!cfg) {
      hasInitialScrolledRef.current = true;
      return;
    }
    const el = document.getElementById(`audience-${cfg.slug}`);
    el?.scrollIntoView({ behavior: "auto", block: "start" });
    hasInitialScrolledRef.current = true;
  }, [searchParams]);

  const handleAudienceChange = useCallback(
    (audience: Audience) => {
      setActiveAudience(audience);
      writeUrl(audience, billing);
      trackPricingEvent({
        name: "pricing_tab_viewed",
        props: { audience },
      });
      const cfg = AUDIENCES.find((a) => a.audience === audience);
      if (cfg) {
        const el = document.getElementById(`audience-${cfg.slug}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [billing, writeUrl],
  );

  const handleBillingChange = useCallback(
    (next: BillingPeriod) => {
      setBilling(next);
      writeUrl(activeAudience, next);
      trackPricingEvent({
        name: "pricing_toggle_changed",
        props: { billing_period: BILLING_TO_TELEMETRY[next] },
      });
    },
    [activeAudience, writeUrl],
  );

  const handleContact = useCallback((nextPreset: SalesPreset) => {
    setPreset(nextPreset);
    // Bump key to force remount of ContactSalesForm so defaults re-init.
    setPresetKey((k) => k + 1);
    const el = document.getElementById(CONTACT_ANCHOR);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleCtaClick = useCallback(
    (tier: Tier) => {
      trackPricingEvent({
        name: "pricing_tier_cta_clicked",
        props: {
          tier_key: tier.key,
          audience: tier.audience,
          billing_period: BILLING_TO_TELEMETRY[billing],
        },
      });
    },
    [billing],
  );

  const sortedAudiences = useMemo(
    () => [...AUDIENCES].sort((a, b) => a.order - b.order),
    [],
  );

  return (
    <MarketingShell
      eyebrow="Precios"
      title={
        <>
          Precios honestos para cada lado de la cancha
          <span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead={
        <>
          Sin permanencia y sin comisión por reserva del club. Plan gratis para jugar y descubrir;
          planes pagos para quien lo usa todos los días o vive de pickleball.
        </>
      }
    >
      <PricingTrustStrip />

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <BillingToggle value={billing} onChange={handleBillingChange} />
      </div>

      <AudienceTabs
        tabs={sortedAudiences}
        active={activeAudience}
        onChange={handleAudienceChange}
      />

      {sortedAudiences.map((audience) => (
        <AudienceSection
          key={audience.audience}
          audience={audience}
          tiers={tiersForAudience(audience.audience)}
          billing={billing}
          onContact={handleContact}
          onCtaClick={handleCtaClick}
        />
      ))}

      <PaymentExplainer />

      <ContactAnchor preset={preset} presetKey={presetKey} />

      <PricingFAQ groups={FAQ_GROUPS} />
    </MarketingShell>
  );
}

function AudienceSection({
  audience,
  tiers,
  billing,
  onContact,
  onCtaClick,
}: {
  audience: AudienceConfig;
  tiers: Tier[];
  billing: BillingPeriod;
  onContact: (preset: SalesPreset) => void;
  onCtaClick: (tier: Tier) => void;
}) {
  return (
    <section
      id={`audience-${audience.slug}`}
      role="tabpanel"
      aria-labelledby={`audience-tab-${audience.slug}`}
      style={{ marginBottom: 64, scrollMarginTop: 140 }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {audience.heading}
          <span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <span style={{ fontSize: 12, color: "var(--muted-fg)", maxWidth: 420, textAlign: "right" }}>
          {audience.subCopy}
        </span>
      </header>

      <TierGrid
        cols={audience.cardCols}
        tiers={tiers}
        billing={billing}
        onContact={onContact}
        onCtaClick={onCtaClick}
      />

      {audience.audience === "player" && <CosmeticsCallout />}

      <PricingFeatureMatrix audience={audience} tiers={tiers} />
    </section>
  );
}

function TierGrid({
  cols,
  tiers,
  billing,
  onContact,
  onCtaClick,
}: {
  cols: 2 | 3;
  tiers: Tier[];
  billing: BillingPeriod;
  onContact: (preset: SalesPreset) => void;
  onCtaClick: (tier: Tier) => void;
}) {
  return (
    <div
      className="precios-tier-grid"
      style={{ display: "grid", gap: 16 }}
      data-cols={cols}
    >
      {tiers.map((t) => (
        <PricingTierCard
          key={t.key}
          tier={t}
          billing={billing}
          onContact={onContact}
          onCtaClick={onCtaClick}
        />
      ))}
    </div>
  );
}

function ContactAnchor({ preset, presetKey }: { preset: SalesPreset; presetKey: number }) {
  return (
    <section
      id={CONTACT_ANCHOR}
      style={{ marginTop: 48, scrollMarginTop: 80 }}
      aria-label="Hablar con ventas"
    >
      <ContactSalesForm
        key={presetKey}
        defaultLeadType={preset.leadType}
        defaultMessage={preset.message}
        heading={preset.message ? `Hablar con ventas · ${preset.message}` : "Hablar con ventas"}
      />
    </section>
  );
}
