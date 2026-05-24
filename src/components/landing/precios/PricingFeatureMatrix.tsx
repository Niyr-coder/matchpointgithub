"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/Icon";
import type { AudienceConfig, MatrixCell, Tier } from "@/lib/pricing/tiers";

type Props = {
  audience: AudienceConfig;
  tiers: Tier[];
};

/**
 * Comparative feature matrix per audience. Rendered as a semantic `<table>`
 * inside a `<details>` so we get accessible expand/collapse for free.
 * Desktop: `open` by default; mobile keeps it collapsed.
 */
export function PricingFeatureMatrix({ audience, tiers }: Props) {
  const id = useId();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const tableTiers = tiers.filter((t) => t.audience === audience.audience);

  // Default-open on desktop only. Honors user toggles afterwards.
  useEffect(() => {
    if (typeof window === "undefined" || !detailsRef.current) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      detailsRef.current.open = true;
    }
  }, []);

  return (
    <details
      ref={detailsRef}
      className="pricing-feature-matrix"
      style={{
        marginTop: 22,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "14px 18px",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--fg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          minHeight: 44,
        }}
        aria-controls={id}
      >
        <span>Ver todo lo incluido</span>
        <Icon name="chevron-down" size={16} color="var(--muted-fg)" />
      </summary>

      <div
        id={id}
        style={{ padding: "8px 14px 18px", overflowX: "auto" }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 480,
          }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                Feature
              </th>
              {tableTiers.map((t) => (
                <th
                  key={t.key}
                  scope="col"
                  style={{
                    textAlign: "center",
                    padding: "10px 12px",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--muted-fg)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {audience.matrixRows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontWeight: 600,
                    color: "var(--fg)",
                    borderBottom: "1px solid var(--border-subtle, #f0f0f0)",
                    verticalAlign: "top",
                  }}
                >
                  {row.label}
                </th>
                {tableTiers.map((t) => (
                  <td
                    key={t.key + row.key}
                    style={{
                      textAlign: "center",
                      padding: "10px 12px",
                      color: "var(--fg)",
                      borderBottom: "1px solid var(--border-subtle, #f0f0f0)",
                      fontSize: 12.5,
                      verticalAlign: "top",
                    }}
                  >
                    <Cell value={t.matrix[row.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Cell({ value }: { value: MatrixCell | undefined }) {
  if (value === true) {
    return (
      <span role="img" aria-label="Incluido" title="Incluido" style={{ color: "var(--primary)" }}>
        <Icon name="check" size={16} />
      </span>
    );
  }
  if (value === false || value === undefined) {
    return (
      <span role="img" aria-label="No incluido" title="No incluido" style={{ color: "var(--muted-fg)" }}>
        —
      </span>
    );
  }
  return <span>{value}</span>;
}
