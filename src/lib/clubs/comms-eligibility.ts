/** Elegibilidad de giveaways del club (mirror de fn_is_club_* en SQL). */

export type GiveawayEligibility = "followers" | "members" | "all";

export function isGiveawayEligible(args: {
  eligibility: GiveawayEligibility;
  isFollower: boolean;
  isVipActive: boolean;
}): boolean {
  if (args.eligibility === "all") {
    return args.isFollower || args.isVipActive;
  }
  if (args.eligibility === "members") return args.isVipActive;
  return args.isFollower || args.isVipActive;
}

export function giveawayEligibilityLabel(eligibility: GiveawayEligibility): string {
  switch (eligibility) {
    case "followers":
      return "Seguidores y socios VIP";
    case "members":
      return "Solo socios VIP";
    case "all":
      return "Seguidores o socios VIP";
  }
}
