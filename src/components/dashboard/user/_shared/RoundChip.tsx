"use client";

import type { PlayerTone } from "./playerTones";

export function RoundChip({ tone, children }: { tone: PlayerTone; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 9999,
        background: tone.nextChipBg,
        color: tone.nextChipFg,
      }}
    >
      ★ {children}
    </span>
  );
}
