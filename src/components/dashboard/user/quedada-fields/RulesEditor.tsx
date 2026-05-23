// Editor de "Reglas clave" de una Quedada. Lista con "Agregar regla".
// Cada regla tiene un texto y un tipo: informativa (✓) o advertencia (⚠).
// Controlado: el padre guarda RuleDraft[] y convierte a QuedadaRule[] al guardar.
// Compartido entre el wizard de crear y el panel de gestión.
"use client";

import { Icon } from "@/components/Icon";
import type { QuedadaRule } from "@/lib/schemas/quedadas";

export type RuleDraft = { text: string; warn: boolean };

export function ruleDraftsToRules(rows: RuleDraft[]): QuedadaRule[] {
  return rows
    .filter((r) => r.text.trim())
    .map((r) => ({ text: r.text.trim(), warn: !!r.warn }));
}

export function rulesToDrafts(rules: QuedadaRule[] | null | undefined): RuleDraft[] {
  if (!rules || rules.length === 0) return [];
  return rules.map((r) => ({ text: r.text ?? "", warn: !!r.warn }));
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
  color: "var(--fg)",
};

export function RulesEditor({
  value,
  onChange,
}: {
  value: RuleDraft[];
  onChange: (rows: RuleDraft[]) => void;
}) {
  const add = () => onChange([...value, { text: "", warn: false }]);
  const setRow = (i: number, patch: Partial<RuleDraft>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.length === 0 && (
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
          Sin reglas. Agrega las que quieras que vean los inscritos (acreditación, vestimenta, WO, reembolsos…).
        </div>
      )}
      {value.map((r, i) => {
        const warn = r.warn;
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setRow(i, { warn: !warn })}
              title={warn ? "Advertencia (⚠) — toca para cambiar a informativa" : "Informativa (✓) — toca para cambiar a advertencia"}
              aria-label={warn ? "Tipo: advertencia" : "Tipo: informativa"}
              className="btn"
              style={{
                padding: 0,
                width: 38,
                height: 38,
                flexShrink: 0,
                background: warn ? "rgba(245,158,11,0.12)" : "var(--color-mp-primary-light)",
                border: `1px solid ${warn ? "rgba(245,158,11,0.4)" : "var(--color-mp-primary-active)"}`,
              }}
            >
              <Icon name={warn ? "alert-triangle" : "check"} size={15} color={warn ? "#b45309" : "var(--color-mp-primary-active)"} />
            </button>
            <input
              value={r.text}
              onChange={(e) => setRow(i, { text: e.target.value })}
              placeholder="Ej. Acreditación 30 min antes del primer partido"
              maxLength={120}
              style={inp}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", padding: "0 11px" }}
              aria-label="Quitar regla"
            >
              <Icon name="trash-2" size={13} />
            </button>
          </div>
        );
      })}
      {value.length < 12 && (
        <button type="button" onClick={add} className="btn btn-outline" style={{ alignSelf: "flex-start" }}>
          <Icon name="plus" size={13} /> Agregar regla
        </button>
      )}
    </div>
  );
}
