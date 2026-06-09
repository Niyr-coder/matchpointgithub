import { GiveawayLiveViewClient } from "@/components/dashboard/giveaways/GiveawayLiveViewClient";
import { gateClubGiveawaysPage } from "../../gate";

export default async function GiveawayLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const blocked = await gateClubGiveawaysPage();
  if (blocked) return blocked;

  const { id } = await params;
  return <GiveawayLiveViewClient giveawayId={id} />;
}
