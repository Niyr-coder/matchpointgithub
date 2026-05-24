import Link from "next/link";
import { Icon } from "@/components/Icon";
import { COSMETICS_CALLOUT } from "@/lib/pricing/tiers";

export function CosmeticsCallout() {
  return (
    <div
      style={{
        marginTop: 22,
        padding: "18px 22px",
        background:
          "linear-gradient(135deg, var(--muted) 0%, rgba(16,185,129,0.06) 100%)",
        borderRadius: 14,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 320px" }}>
        <div
          className="label-mp"
          style={{ color: "var(--primary-active)", marginBottom: 4 }}
        >
          {COSMETICS_CALLOUT.eyebrow}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "var(--fg)",
            marginBottom: 4,
            letterSpacing: "-0.01em",
          }}
        >
          {COSMETICS_CALLOUT.heading}
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted-fg)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {COSMETICS_CALLOUT.body}
        </p>
      </div>
      <Link
        href={COSMETICS_CALLOUT.href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          color: "var(--primary-active)",
          textDecoration: "none",
          minHeight: 44,
          padding: "0 4px",
        }}
      >
        {COSMETICS_CALLOUT.ctaLabel} <Icon name="arrow-right" size={14} />
      </Link>
    </div>
  );
}
