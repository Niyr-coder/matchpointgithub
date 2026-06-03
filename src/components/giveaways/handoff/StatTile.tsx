type Props = {
  label: string;
  value: string;
  sub?: string;
  color?: string;
};

export function StatTile({ label, value, sub, color }: Props) {
  return (
    <div className="card" style={{ padding: "11px 13px" }}>
      <div className="label-mp">{label}</div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          marginTop: 4,
          color: color ?? "var(--fg)",
        }}
      >
        {value}
      </div>
      {sub ? <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
