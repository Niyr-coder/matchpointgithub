import { Icon } from "@/components/Icon";

type Props = {
  days: number;
  hours: number;
  /** Cuando queda poco tiempo (p. ej. cierra hoy). */
  urgent?: boolean;
  /** En filas estrechas: oculta el sufijo "CIERRA HOY". */
  compact?: boolean;
  className?: string;
};

export function Countdown({ days, hours, urgent = false, compact = false, className }: Props) {
  const label = days > 0 ? `${days}d ${hours}h` : `${hours}h`;

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: urgent ? "var(--destructive-bg)" : "#fff",
        border: `1px solid ${urgent ? "var(--destructive-border)" : "var(--border)"}`,
        color: urgent ? "var(--destructive-fg)" : "var(--fg)",
        padding: "3px 9px",
        borderRadius: 9999,
        fontSize: 10.5,
        fontWeight: 900,
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      <Icon name="clock" size={10} />
      <span className="tabular">{label}</span>
      {urgent && !compact ? (
        <span style={{ fontSize: 8.5, letterSpacing: "0.12em" }}>· CIERRA HOY</span>
      ) : null}
    </div>
  );
}
