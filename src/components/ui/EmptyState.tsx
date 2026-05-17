// "No hay nada que mostrar" estado. Acepta un CTA opcional.
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

export function EmptyState({
  icon = "inbox",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "36px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={22} color="var(--muted-fg)" />
      </div>
      <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: 12.5, color: "var(--muted-fg)", maxWidth: 360 }}>{hint}</div>
      )}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
