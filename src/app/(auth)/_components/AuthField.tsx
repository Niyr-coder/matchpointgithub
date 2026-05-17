import type { ReactNode } from "react";

export function AuthField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#0a0a0a",
        }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{hint}</span>
      ) : null}
    </div>
  );
}
