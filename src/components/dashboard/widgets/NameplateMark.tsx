import type { CSSProperties } from "react";
import {
  DEFAULT_NAMEPLATE_KEY,
  getNameplate,
  type NameplateDefinition,
  type NameplateKey,
} from "@/lib/profile/nameplates";

type NameplateMarkSize = "sm" | "md" | "lg";

const SIZE_STYLE: Record<NameplateMarkSize, CSSProperties> = {
  sm: { fontSize: "1em", marginInlineStart: 2 },
  md: { fontSize: "1.06em", marginInlineStart: 3 },
  lg: { fontSize: "0.72em", marginInlineStart: 5 },
};

export function NameplateMark({
  nameplateKey = DEFAULT_NAMEPLATE_KEY,
  nameplate,
  size = "md",
  style,
}: {
  nameplateKey?: NameplateKey | null;
  nameplate?: NameplateDefinition;
  size?: NameplateMarkSize;
  style?: CSSProperties;
}) {
  const resolved = nameplate ?? getNameplate(nameplateKey);

  return (
    <span
      aria-hidden="true"
      title={resolved.label}
      style={{
        ...SIZE_STYLE[size],
        color: resolved.color,
        display: "inline-flex",
        alignItems: "baseline",
        flexShrink: 0,
        font: "inherit",
        fontWeight: 900,
        lineHeight: 1,
        verticalAlign: "baseline",
        ...style,
      }}
    >
      {resolved.mark}
    </span>
  );
}
