import { notFound } from "next/navigation";
import { getGiveawayDetail } from "@/server/actions/giveaways";
import { GiveawayDetailViewClient } from "@/components/dashboard/giveaways/GiveawayDetailViewClient";
import { gateClubGiveawaysPage } from "../gate";

export default async function ClubGiveawayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const blocked = await gateClubGiveawaysPage();
  if (blocked) return blocked;

  const { id } = await params;
  const { result } = await searchParams;
  const res = await getGiveawayDetail({ giveawayId: id });
  if (!res.ok) {
    if (res.error.code === "GIVEAWAY.NOT_FOUND") notFound();
    throw new Error(res.error.message);
  }
  const resultVariant = result === "won" || result === "lost" ? result : undefined;
  return <GiveawayDetailViewClient initial={res.data} resultVariant={resultVariant} />;
}
