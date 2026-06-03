"use client";
// Helpers compartidos entre las 7 secciones del Club Config v2.
// Mantener acá los componentes presentacionales sin estado propio.
import { Icon } from "@/components/Icon";

export function Field({
  l,
  v,
  hint,
  type = "text",
  icon,
  onChange,
  name,
  disabled,
}: {
  l: string;
  v: string;
  hint?: string;
  type?: string;
  icon?: string;
  onChange?: (v: string) => void;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 800, color: disabled ? "var(--muted-fg)" : "#0a0a0a", letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>{l}</label>
      <div style={{ position: "relative" }}>
        {icon && <Icon name={icon} size={14} color="var(--muted-fg)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />}
        <input
          name={name}
          defaultValue={onChange ? undefined : v}
          value={onChange ? v : undefined}
          onChange={onChange && !disabled ? (e) => onChange(e.target.value) : undefined}
          type={type}
          disabled={disabled}
          readOnly={disabled}
          style={{
            width: "100%",
            padding: "9px 12px",
            paddingLeft: icon ? 34 : 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "inherit",
            background: disabled ? "var(--muted)" : "#fff",
            color: disabled ? "var(--muted-fg)" : "#0a0a0a",
            cursor: disabled ? "not-allowed" : "text",
            boxSizing: "border-box",
          }}
        />
      </div>
      {hint && <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function VisualToggle({
  on,
  w = 36,
  h = 20,
  onClick,
}: {
  on: boolean;
  w?: number;
  h?: number;
  onClick?: () => void;
}) {
  const k = h - 4;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={on}
      style={{
        width: w,
        height: h,
        borderRadius: 9999,
        background: on ? "var(--primary)" : "var(--muted)",
        position: "relative",
        flexShrink: 0,
        border: 0,
        padding: 0,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ position: "absolute", top: 2, left: on ? w - k - 2 : 2, width: k, height: k, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 120ms" }} />
    </button>
  );
}

// Tipo común que todas las secciones reciben (el subset que les corresponde).
// Cada section define su propia shape en su archivo.
export type SectionToast = (title: string) => void;
