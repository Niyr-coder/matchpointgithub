"use client";

// Distintivo "Tú": marca la fila del usuario actual en listings (ranking,
// roster) con un chip, para que no se confunda buscándose. Decisión de
// producto: solo chip, sin anillos/bordes (los contornos no calzaban bien
// con las cards). Uso:
//   import { SelfChip } from "@/components/dashboard/widgets/SelfBadge";
//   {isMe && <SelfChip />}

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
