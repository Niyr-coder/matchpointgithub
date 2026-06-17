"use client";

import { Icon } from "@/components/Icon";
import { PRESET_QUEDADA_RULES } from "@/lib/quedadas/preset-rules";
import type { RuleDraft } from "./RulesEditor";

const MAX_RULES = 12;

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

export function RulesPresetPicker({
  selectedIds,
  onChange,
  customRules,
  onCustomRulesChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  customRules: RuleDraft[];
  onCustomRulesChange: (rows: RuleDraft[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const filledCustom = customRules.filter((r) => r.text.trim()).length;
  const totalSelected = selectedIds.length + filledCustom;
  const atMax = totalSelected >= MAX_RULES;

  const addCustom = () => {
    if (atMax) return;
    onCustomRulesChange([...customRules, { text: "", warn: false }]);
  };

  const setCustom = (i: number, patch: Partial<RuleDraft>) => {
    onCustomRulesChange(customRules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const removeCustom = (i: number) => {
    onCustomRulesChange(customRules.filter((_, j) => j !== i));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
        Marca las que apliquen a tu quedada. Debes elegir al menos una (predefinida o propia).
      </div>

      <div className="mp-grid-form-2 gap-2">
        {PRESET_QUEDADA_RULES.map((r) => {
          const on = selectedIds.includes(r.id);
          const disablePick = !on && atMax;
          return (
            <label
              key={r.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 10,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "var(--color-mp-primary-light)" : "#fff",
                cursor: disablePick ? "not-allowed" : "pointer",
                opacity: disablePick ? 0.55 : 1,
                minHeight: "100%",
              }}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disablePick}
                onChange={() => toggle(r.id)}
                style={{ marginTop: 2, accentColor: "var(--primary)", flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: on ? "var(--color-mp-primary-active)" : "var(--fg)",
                  fontWeight: on ? 700 : 500,
                }}
              >
                {r.text}
              </span>
            </label>
          );
        })}
      </div>

      {customRules.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={r.text}
            onChange={(e) => setCustom(i, { text: e.target.value })}
            placeholder="Escribe tu regla…"
            maxLength={120}
            style={inp}
          />
          <button
            type="button"
            onClick={() => removeCustom(i)}
            className="btn"
            style={{
              flexShrink: 0,
              background: "#fff",
              border: "1px solid var(--destructive-border)",
              color: "var(--destructive-fg)",
              padding: "0 12px",
            }}
            aria-label="Quitar regla"
          >
            <Icon name="trash-2" size={13} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addCustom}
        disabled={atMax}
        className="btn btn-outline"
        style={{ alignSelf: "flex-start", opacity: atMax ? 0.5 : 1 }}
      >
        <Icon name="plus" size={13} /> Agregar regla
      </button>

      {totalSelected > 0 && (
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {totalSelected} {totalSelected === 1 ? "regla seleccionada" : "reglas seleccionadas"} (máx. {MAX_RULES})
        </div>
      )}
    </div>
  );
}
