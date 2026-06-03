import type { ReactNode } from "react";

type Props = {
  title: string;
  cta?: string;
  onCta?: () => void;
  children: ReactNode;
};

export function RailCard({ title, cta, onCta, children }: Props) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div
          className="font-heading"
          style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em" }}
        >
          {title}
          <span style={{ color: "var(--primary)" }}>.</span>
        </div>
        {cta ? (
          <button
            type="button"
            onClick={onCta}
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: ".08em",
              color: "var(--primary-dark)",
              background: "none",
              border: 0,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {cta} →
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
