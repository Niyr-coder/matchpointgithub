// Editor de premios por puesto (Quedadas). Lista con "Agregar premio".
// Controlado: el padre guarda PrizeDraft[] y convierte a Prize[] al guardar.
// Compartido entre el wizard de crear y el panel de gestión.
"use client";

import { Icon } from "@/components/Icon";
import type { Prize } from "@/lib/schemas/quedadas";

export type PrizeDraft = { place: string; prize: string; value: string };

// Sugerencias de puesto según la posición en la lista.
const PLACE_HINTS = ["1ro", "2do", "3ro", "4to", "5to"];

export function prizeDraftsToPrizes(rows: PrizeDraft[]): Prize[] {
  return rows
    .filter((r) => r.place.trim() && r.prize.trim())
    .map((r) => {
      const cents = r.value.trim() ? Math.round(parseFloat(r.value) * 100) : undefined;
      return {
        place: r.place.trim(),
        prize: r.prize.trim(),
        valueCents: cents != null && Number.isFinite(cents) && cents >= 0 ? cents : undefined,
      };
    });
}

export function prizesToDrafts(prizes: Prize[] | null | undefined): PrizeDraft[] {
  if (!prizes || prizes.length === 0) return [];
  return prizes.map((p) => ({
    place: p.place ?? "",
    prize: p.prize ?? "",
    value: p.valueCents != null ? (p.valueCents / 100).toString() : "",
  }));
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: 9,
  fontSize: 12.5,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  color: "#0a0a0a",
};

export function PrizesEditor({
  value,
  onChange,
}: {
  value: PrizeDraft[];
  onChange: (rows: PrizeDraft[]) => void;
}) {
  const add = () => {
    const i = value.length;
    onChange([...value, { place: PLACE_HINTS[i] ?? "", prize: "", value: "" }]);
  };
  const setRow = (i: number, patch: Partial<PrizeDraft>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.length === 0 && (
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
          Sin premios. Agrega los que quieras mostrar a los inscritos.
        </div>
      )}
      {value.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr 88px auto", gap: 6, alignItems: "center" }}>
          <input value={r.place} onChange={(e) => setRow(i, { place: e.target.value })} placeholder="Puesto" maxLength={40} style={{ ...inp, fontWeight: 800 }} />
          <input value={r.prize} onChange={(e) => setRow(i, { prize: e.target.value })} placeholder="Premio (ej. media docena de pelotas)" maxLength={120} style={inp} />
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: "var(--muted-fg)" }}>$</span>
            <input value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="0" type="number" min={0} step="0.5" style={{ ...inp, paddingLeft: 18 }} />
          </div>
          <button type="button" onClick={() => remove(i)} className="btn" style={{ background: "#fff", border: "1px solid #fecaca", color: "#dc2626", padding: "0 11px" }} aria-label="Quitar premio">
            <Icon name="trash-2" size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="btn btn-outline" style={{ alignSelf: "flex-start" }}>
        <Icon name="plus" size={13} /> Agregar premio
      </button>
    </div>
  );
}
