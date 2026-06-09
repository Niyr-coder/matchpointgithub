import { Icon } from "@/components/Icon";

type Props = {
  day: string;
  month: string;
  name: string;
  meta: string;
  taken?: number;
  capacity?: number;
  kind: "torneo" | "quedada";
  onClick?: () => void;
};

export function UpcomingRow({ day, month, name, meta, taken, capacity, kind, onClick }: Props) {
  const cap = capacity ?? 20;
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr auto",
        gap: 10,
        padding: "10px 0",
        borderTop: "1px dashed var(--border)",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "4px 0",
          borderRadius: 8,
          background: kind === "torneo" ? "var(--warn-bg)" : "var(--primary-light)",
          color: kind === "torneo" ? "var(--warn-fg)" : "var(--primary-light-fg)",
          border: `1px solid ${kind === "torneo" ? "var(--warn-border)" : "transparent"}`,
        }}
      >
        <div className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, lineHeight: 1 }}>
          {day}
        </div>
        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: ".1em", marginTop: 1 }}>{month}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 600 }}>
          {meta}
          {taken != null ? ` · ${taken}/${cap} tomados` : ""}
        </div>
      </div>
      <span className={`chip ${kind === "torneo" ? "chip-warn" : "chip-emerald"}`}>
        {kind === "torneo" ? "Torneo" : "Quedada"}
      </span>
    </div>
  );
}
