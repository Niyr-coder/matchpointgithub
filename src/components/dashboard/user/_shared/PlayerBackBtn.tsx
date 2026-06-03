"use client";

import { Icon } from "@/components/Icon";

type Props = {
  label?: string;
  onClick: () => void;
};

export function PlayerBackBtn({ label = "Volver a tus juegos", onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        color: "var(--muted-fg)",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0,
      }}
    >
      <Icon name="arrow-left" size={12} color="var(--muted-fg)" />
      {label}
    </button>
  );
}
