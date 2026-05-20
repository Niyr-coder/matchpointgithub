"use client";

// Distintivo "Tú": marca la fila/avatar del usuario actual en listings
// (ranking, descubrir, roster) para que no se confunda buscándose.
// Uso:
//   import { SelfChip, selfRingStyle } from "@/components/dashboard/widgets/SelfBadge";
//   <div style={{ ...avatarStyle, ...(isMe ? selfRingStyle : {}) }} />
//   {isMe && <SelfChip />}
import type { CSSProperties } from "react";

// Anillo alrededor del avatar (doble: blanco + primary) para que resalte sobre
// avatares de cualquier color.
export const selfRingStyle: CSSProperties = {
  boxShadow: "0 0 0 2px #fff, 0 0 0 4px var(--primary)",
};

export function SelfChip({ label = "Tú" }: { label?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 7px",
        borderRadius: 9999,
        background: "var(--primary)",
        color: "#fff",
        fontSize: 8.5,
        fontWeight: 900,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
