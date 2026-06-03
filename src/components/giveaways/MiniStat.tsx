type Props = {
  label: string;
  value: string | number;
  hint?: string;
  color?: string;
  className?: string;
};

export function MiniStat({ label, value, hint, color, className }: Props) {
  return (
    <div className={className} style={{ flex: 1, minWidth: 0 }}>
      <div className="label-mp">{label}</div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          marginTop: 4,
          color: color ?? "var(--fg)",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{hint}</div>
      ) : null}
    </div>
  );
}
