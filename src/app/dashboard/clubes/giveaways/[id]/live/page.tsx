import { GiveawayLiveViewClient } from "@/components/dashboard/giveaways/GiveawayLiveViewClient";

export default async function GiveawayLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GiveawayLiveViewClient giveawayId={id} />;
}
