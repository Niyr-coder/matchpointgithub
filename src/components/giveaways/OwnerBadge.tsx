import { Icon } from "@/components/Icon";
import type { GiveawayOwner } from "./types";

type Props = {
  owner: GiveawayOwner;
  name: string;
  className?: string;
};

const OWNER_CONFIG: Record<
  GiveawayOwner,
  { chipClass: string; icon: string; prefix: string }
> = {
  partner: { chipClass: "chip-partner", icon: "sparkles", prefix: "PARTNER" },
  matchpoint: { chipClass: "chip-mp", icon: "shield-check", prefix: "MATCHPOINT" },
  club: { chipClass: "chip-emerald", icon: "home", prefix: "CLUB" },
};

export function OwnerBadge({ owner, name, className }: Props) {
  const cfg = OWNER_CONFIG[owner];

  return (
    <span className={`chip ${cfg.chipClass}${className ? ` ${className}` : ""}`}>
      <Icon name={cfg.icon} size={10} />
      {cfg.prefix} · {name}
    </span>
  );
}
