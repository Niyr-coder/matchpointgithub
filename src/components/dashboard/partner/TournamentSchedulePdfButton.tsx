"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";

export function TournamentSchedulePdfButton({
  slug,
  disabled,
}: {
  slug: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/tournaments/${slug}/schedule.pdf`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error ?? "Error al generar el PDF. Intenta de nuevo.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `calendario-${slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="btn"
      onClick={handleClick}
      disabled={disabled || loading}
      title={
        disabled
          ? "Genera el cronograma o el bracket primero para exportar el PDF"
          : "Descargar el calendario de partidos en PDF"
      }
      style={{
        background: disabled ? "var(--muted)" : "#fff",
        border: `1px solid ${disabled ? "var(--border)" : "var(--border)"}`,
        color: disabled ? "var(--muted-fg)" : "inherit",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Icon name={loading ? "loader" : "file-text"} size={12} color={disabled ? "var(--muted-fg)" : "currentColor"} />
      {loading ? "Generando…" : "GENERAR PDF"}
    </button>
  );
}
