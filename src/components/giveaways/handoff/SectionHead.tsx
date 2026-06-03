type Props = {
  kicker: string;
  title: string;
  sub?: string;
};

export function SectionHead({ kicker, title, sub }: Props) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
        {kicker}
      </div>
      <h2
        className="font-heading"
        style={{
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          margin: "6px 0 6px",
          lineHeight: 1,
        }}
      >
        {title}
        <span style={{ color: "var(--primary)" }}>.</span>
      </h2>
      {sub ? (
        <div style={{ fontSize: 12.5, color: "var(--muted-fg)", maxWidth: 580, lineHeight: 1.55 }}>{sub}</div>
      ) : null}
    </div>
  );
}
