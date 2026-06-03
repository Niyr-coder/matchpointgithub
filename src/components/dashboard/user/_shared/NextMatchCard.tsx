"use client";

import { Icon } from "@/components/Icon";
import type { PlayerTone, PlayerToneKey } from "./playerTones";
import { RoundChip } from "./RoundChip";

type Props = {
  tone: PlayerTone;
  toneKey: PlayerToneKey;
  kicker: string;
  primary: string;
  primaryValue: string | number;
  secondary?: string;
  secondaryValue?: string | number;
  /** undefined = omit partner row; null/empty = singles */
  partner?: string | null;
  opponents?: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
};

function watermarkText(primary: string, primaryValue: string | number) {
  if (primary === "OCTAVOS" || primary === "GRUPO" || primary === "JORNADA") {
    return `${primary[0]}${primaryValue}`;
  }
  if (primary === "1/2" || primary === "RONDA") {
    return `R${primaryValue}`;
  }
  return `R${primaryValue}`;
}

export function NextMatchCard({
  tone,
  toneKey,
  kicker,
  primary,
  primaryValue,
  secondary,
  secondaryValue,
  partner,
  opponents,
  subtitle,
  ctaLabel,
  onCta,
}: Props) {
  return (
    <div
      className="pv-rise"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "18px 20px",
        borderRadius: 14.4,
        color: "#fff",
        ...tone.nextHeaderStyle,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 130,
          color: "rgba(255,255,255,0.06)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          transform: "rotate(-6deg) translate(15%, -25%)",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}
      >
        {watermarkText(primary, primaryValue)}
      </div>
      <div style={{ position: "relative" }}>
        <RoundChip tone={tone}>{kicker}</RoundChip>
        <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)" }}>
              {primary}
            </div>
            <div
              className="font-heading tabular"
              style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 2 }}
            >
              {primaryValue}
            </div>
          </div>
          {secondary && secondaryValue != null && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)" }}>
                {secondary}
              </div>
              <div
                className="font-heading tabular"
                style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 2 }}
              >
                {secondaryValue}
              </div>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 180 }}>
            {partner !== undefined && (
              <>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.55)",
                    textTransform: "uppercase",
                  }}
                >
                  {partner ? "Tu compañero" : "Modalidad"}
                </div>
                <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em", marginTop: 2 }}>
                  {partner || "Singles"}
                  <span style={{ color: tone.accentDot }}>.</span>
                </div>
              </>
            )}
            {opponents && (
              <>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.55)",
                    textTransform: "uppercase",
                    marginTop: 8,
                  }}
                >
                  vs.
                </div>
                <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", marginTop: 2 }}>
                  {opponents}
                  <span style={{ color: tone.accentDot }}>.</span>
                </div>
              </>
            )}
          </div>
        </div>
        {subtitle && (
          <div style={{ marginTop: 12, fontSize: 10.5, color: "rgba(255,255,255,0.6)", fontWeight: 600, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
        {ctaLabel && (
          <button
            type="button"
            className={toneKey === "torneo" ? "btn btn-amber" : "btn btn-primary"}
            style={{ marginTop: 12, fontSize: 10.5 }}
            onClick={onCta}
          >
            <Icon name="arrow-right" size={11} />
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
