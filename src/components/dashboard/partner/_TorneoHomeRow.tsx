import Link from "next/link";
import type { ReactNode } from "react";

export function TorneoHomeRow({
  accent,
  placeholder,
  info,
  stats,
  href,
  onClick,
}: {
  accent: string;
  placeholder?: boolean;
  info: ReactNode;
  stats: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const clickable = !placeholder && (!!href || !!onClick);
  const className = `mp-partner-torneo-row${placeholder ? " mp-partner-torneo-row--ph" : ""}${clickable ? " is-clickable" : ""}`;
  const style = {
    border: placeholder ? "1px dashed var(--border)" : "1px solid var(--border)",
    background: placeholder ? "#fafafa" : "#fff",
    opacity: placeholder ? 0.6 : 1,
  } as const;

  const inner = (
    <>
      <div className="mp-partner-torneo-main">
        <div className="mp-partner-torneo-accent" style={{ background: accent }} />
        <div className="mp-partner-torneo-info">{info}</div>
      </div>
      <div className="mp-partner-torneo-stats">{stats}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <div
      className={className}
      style={style}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable && onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {inner}
    </div>
  );
}

export function TorneoStat({ label, value, color = "#0a0a0a" }: { label: string; value: string; color?: string }) {
  return (
    <div className="mp-partner-torneo-stat">
      <div className="mp-partner-torneo-stat-label">{label}</div>
      <div className="font-heading mp-partner-torneo-stat-value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
