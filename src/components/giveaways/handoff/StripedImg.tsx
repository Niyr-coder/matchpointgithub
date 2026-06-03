import type { CSSProperties } from "react";

type Props = {
  label: string;
  height?: number;
  dark?: boolean;
  style?: CSSProperties;
  className?: string;
};

export function StripedImg({ label, height = 160, dark = false, style, className }: Props) {
  return (
    <div
      className={`img-slot${dark ? " dark" : ""}${className ? ` ${className}` : ""}`}
      style={{ height, borderRadius: 10, ...style }}
      role="img"
      aria-label={label}
    >
      {label}
    </div>
  );
}
