"use client";

import { Icon } from "@/components/Icon";
import type { FaqGroup } from "@/lib/pricing/tiers";
import { trackPricingEvent } from "@/lib/telemetry/pricing";

type Props = {
  groups: FaqGroup[];
};

export function PricingFAQ({ groups }: Props) {
  return (
    <section
      aria-labelledby="precios-faq-heading"
      style={{
        marginTop: 56,
        padding: "32px 28px",
        background: "var(--muted)",
        borderRadius: 18,
      }}
    >
      <div className="label-mp" style={{ color: "var(--primary)", marginBottom: 8 }}>
        FAQ
      </div>
      <h2
        id="precios-faq-heading"
        className="font-heading"
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          margin: "0 0 22px",
        }}
      >
        Preguntas frecuentes<span style={{ color: "var(--primary)" }}>.</span>
      </h2>

      {groups.map((group) => (
        <div key={group.title} style={{ marginBottom: 26 }}>
          <h3
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
              margin: "0 0 10px",
            }}
          >
            {group.title}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {group.items.map((item) => (
              <details
                key={item.key}
                onToggle={(ev) => {
                  if ((ev.currentTarget as HTMLDetailsElement).open) {
                    trackPricingEvent({
                      name: "pricing_faq_expanded",
                      props: { faq_key: item.key },
                    });
                  }
                }}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <summary
                  style={{
                    listStyle: "none",
                    cursor: "pointer",
                    padding: "14px 18px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--fg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    minHeight: 44,
                  }}
                >
                  <span>{item.question}</span>
                  <Icon name="chevron-down" size={16} color="var(--muted-fg)" />
                </summary>
                <div
                  style={{
                    padding: "0 18px 16px",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: "var(--muted-fg)",
                  }}
                >
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
