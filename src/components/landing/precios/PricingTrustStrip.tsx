import type { ReactNode } from "react";

type Stat = {
  value: string;
  label: string;
};

type Props = {
  /** When set, renders the 3-column stats. Otherwise falls back to honest copy. */
  stats?: Stat[];
  /** Override the fallback line entirely. */
  fallback?: ReactNode;
};

/**
 * Pre-toggle trust banner. UX spec §4.2: if real numbers aren't available
 * yet, fall back to a non-quantitative line — never invent counts.
 */
export function PricingTrustStrip({ stats, fallback }: Props) {
  if (!stats || stats.length === 0) {
    return (
      <div
        style={{
          background: "var(--muted)",
          borderRadius: 14,
          padding: "16px 22px",
          marginBottom: 28,
          fontSize: 12.5,
          color: "var(--muted-fg)",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        {fallback ?? (
          <>
            La comunidad de pickleball #1 de Ecuador · Quito · Cumbayá · Guayaquil
          </>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--muted)",
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 28,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "10px 36px",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            fontSize: 12,
            color: "var(--muted-fg)",
            fontWeight: 600,
          }}
        >
          <span
            className="font-heading"
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: "var(--fg)",
              letterSpacing: "-0.01em",
            }}
          >
            {s.value}
          </span>
          <span>{s.label}</span>
          {i < stats.length - 1 && (
            <span aria-hidden="true" style={{ marginLeft: 28, color: "var(--border)" }}>
              ·
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
