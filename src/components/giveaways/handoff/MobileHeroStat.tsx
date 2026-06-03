type Props = {
  label: string;
  value: string | number;
  accent?: boolean;
};

/** Stat compacto del hero mobile — JoinDetail / JoinConfirmation */
export function MobileHeroStat({ label, value, accent }: Props) {
  return (
    <div>
      <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)", fontSize: 8.5 }}>
        {label}
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          marginTop: 3,
          color: accent ? "var(--gw-accent)" : "#fff",
        }}
      >
        {value}
      </div>
    </div>
  );
}
