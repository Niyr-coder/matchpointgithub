// PolHero — hero compartido para todos los screens "polish" (Reportes, Marketing, Recursos,
// Finanzas Partner, AdminConfig, ClubConfig). Migrado 1:1 desde ui_kits/dashboard/RoleScreensPolish.jsx (líneas 5-23).
import type { ReactNode } from "react";

type Props = {
  tone?: "dark" | "light";
  accent?: string;
  wm: string;
  label: string;
  title: string;
  sub?: string;
  right?: ReactNode;
};

export function PolHero({
  tone = "dark",
  accent = "#10b981",
  wm,
  label,
  title,
  sub,
  right,
}: Props) {
  const bg =
    tone === "dark"
      ? `linear-gradient(135deg, #0a0a0a 0%, #1f1f23 60%, ${accent} 160%)`
      : "linear-gradient(135deg, #fafafa 0%, #fff 100%)";

  return (
    <div
      className="mp-pol-hero"
      data-tone={tone}
      style={{
        position: "relative",
        padding: "32px 32px 28px",
        borderRadius: 14.4,
        overflow: "hidden",
        background: bg,
        color: tone === "dark" ? "#fff" : "#0a0a0a",
        border: tone === "light" ? "1px solid var(--border)" : 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          fontFamily: "Plus Jakarta Sans",
          fontWeight: 900,
          fontSize: 240,
          color: tone === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          transform: "rotate(-6deg) translate(15%, -20%)",
          textTransform: "uppercase",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        {wm}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              borderRadius: 9999,
              background: tone === "dark" ? "rgba(255,255,255,0.12)" : "var(--muted)",
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            ● {label}
          </div>
          <h1
            className="font-heading"
            style={{
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: "-0.035em",
              textTransform: "uppercase",
              margin: "12px 0 6px",
              lineHeight: 0.95,
            }}
          >
            {title}
            <span style={{ color: accent }}>.</span>
          </h1>
          {sub && (
            <div
              style={{
                fontSize: 13,
                color: tone === "dark" ? "rgba(255,255,255,0.75)" : "var(--muted-fg)",
                maxWidth: 540,
                lineHeight: 1.5,
              }}
            >
              {sub}
            </div>
          )}
        </div>
        {right ? <div className="mp-pol-hero__right">{right}</div> : null}
      </div>
    </div>
  );
}
