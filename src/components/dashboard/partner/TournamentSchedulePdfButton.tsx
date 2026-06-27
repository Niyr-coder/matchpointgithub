"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";

export function TournamentSchedulePdfButton({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
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
      disabled={loading}
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      <Icon name={loading ? "loader" : "file-text"} size={12} />
      {loading ? "Generando…" : "GENERAR PDF"}
    </button>
  );
}
