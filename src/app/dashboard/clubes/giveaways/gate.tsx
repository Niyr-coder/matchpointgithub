import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { isClubGiveawaysEnabled } from "@/lib/flags/club-giveaways";
import { FeatureOffScreen } from "@/components/dashboard/FeatureOffScreen";
import type { ReactNode } from "react";

export async function gateClubGiveawaysPage(): Promise<ReactNode | null> {
  const flagsRes = await getMyEffectiveFlags();
  if (flagsRes.ok && !isClubGiveawaysEnabled(flagsRes.data)) {
    return <FeatureOffScreen section="mis-sorteos" />;
  }
  return null;
}
