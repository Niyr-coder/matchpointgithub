import { redirect, notFound } from "next/navigation";
import { getGiveawayDetail, getGiveawayOrgManage, getGiveawayOrgWinner, getClubGiveawaysOrgOverview } from "@/server/actions/giveaways";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { OrgGiveawayManageView } from "./giveaways/OrgGiveawayManageView";
import { OrgGiveawayPublishedView } from "./giveaways/OrgGiveawayPublishedView";
import { OrgGiveawayDrawingView } from "./giveaways/OrgGiveawayDrawingView";
import { OrgGiveawayWinnerView } from "./giveaways/OrgGiveawayWinnerView";

export async function ClubGiveawayOrgScreen({
  roleSegment,
  giveawayId,
  subview,
}: {
  roleSegment: "owner" | "manager";
  giveawayId: string;
  subview?: "publicado" | "sortear" | "ganador";
}) {
  const clubId = await resolveActiveClubId();
  if (!clubId) notFound();

  if (subview === "publicado") {
    const [detailRes, overviewRes] = await Promise.all([
      getGiveawayDetail({ giveawayId }),
      getClubGiveawaysOrgOverview({ clubId }),
    ]);
    if (!detailRes.ok || detailRes.data.clubId !== clubId) notFound();
    return (
      <OrgGiveawayPublishedView
        role={roleSegment}
        giveaway={detailRes.data}
        followerCount={overviewRes.ok ? overviewRes.data.followerCount : 0}
      />
    );
  }

  if (subview === "sortear") {
    const detailRes = await getGiveawayDetail({ giveawayId });
    if (!detailRes.ok || detailRes.data.clubId !== clubId) notFound();
    if (detailRes.data.status === "drawn") {
      redirect(`/dashboard/${roleSegment}/club-sorteos/${giveawayId}/ganador`);
    }
    return <OrgGiveawayDrawingView role={roleSegment} giveaway={detailRes.data} />;
  }

  if (subview === "ganador") {
    const res = await getGiveawayOrgWinner({ giveawayId });
    if (!res.ok) notFound();
    if (res.data.giveaway.clubId !== clubId) notFound();
    return <OrgGiveawayWinnerView role={roleSegment} data={res.data} />;
  }

  const res = await getGiveawayOrgManage({ giveawayId });
  if (!res.ok) notFound();
  if (res.data.giveaway.clubId !== clubId) notFound();
  return <OrgGiveawayManageView role={roleSegment} data={res.data} />;
}
