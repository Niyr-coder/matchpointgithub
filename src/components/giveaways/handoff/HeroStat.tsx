type Props = {
  label: string;
  value: string | number;
  urgent?: boolean;
  accent?: boolean;
};

export function HeroStat({ label, value, urgent, accent }: Props) {
  return (
    <div>
      <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          marginTop: 4,
          color: urgent ? "#fecaca" : accent ? "var(--gw-accent)" : "#fff",
        }}
      >
        {value}
      </div>
    </div>
  );
}
