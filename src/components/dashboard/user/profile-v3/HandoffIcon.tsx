"use client";

import { Icon } from "@/components/Icon";

export function HandoffIcon({
  name,
  size = 14,
  color,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return <Icon name={name} size={size} color={color} style={style} />;
}
