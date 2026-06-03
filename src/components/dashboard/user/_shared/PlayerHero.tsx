"use client";

import { Icon } from "@/components/Icon";
import { Skeleton as SkBar } from "@/components/ui/Skeleton";
import type { PlayerTone } from "./playerTones";

export type PlayerHeroMeta = { icon: string; label: string };

type Props = {
  tone: PlayerTone;
  statusLabel: string;
  title: string;
  meta: PlayerHeroMeta[];
  loading?: boolean;
};

function PlayerStatusChip({ tone, label }: { tone: PlayerTone; label: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 12px",
        borderRadius: 9999,
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.18)",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: tone.chipDot }} />
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#fff",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function PlayerHero({ tone, statusLabel, title, meta, loading }: Props) {
  return (
    <div
      className="pv-hero pv-rise px-4 py-3.5 md:px-[22px] md:py-5"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 14.4,
        color: "#fff",
        ...tone.headerStyle,
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
          fontSize: 150,
          color: "rgba(255,255,255,0.06)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          transform: "rotate(-6deg) translate(15%, -22%)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {tone.wordmark}
      </div>
      <div style={{ position: "relative" }}>
        <PlayerStatusChip tone={tone} label={statusLabel} />
        {loading ? (
          <div style={{ marginTop: 12 }}>
            <SkBar w={260} h={30} r={8} dark />
          </div>
        ) : (
          <>
            <h2
              className="font-heading text-[22px] md:text-[26px]"
              style={{
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "10px 0 0",
                lineHeight: 1.05,
              }}
            >
              {title}
              <span style={{ color: tone.accentDot }}>.</span>
            </h2>
            {meta.length > 0 ? (
              <div
                className="hidden md:flex"
                style={{
                  gap: 14,
                  flexWrap: "wrap",
                  marginTop: 10,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 600,
                }}
              >
                {meta.map((m, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name={m.icon} size={11} />
                    {m.label}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
