import { notFound } from "next/navigation";
import { getClubSocial } from "@/server/actions/clubs";
import { listClubFeedPosts, listActiveClubGiveaways } from "@/server/actions/giveaways";
import { ClubProfileView } from "@/components/dashboard/clubes/ClubProfileView";
import { ClubMembershipBuySection } from "@/components/dashboard/clubes/ClubMembershipBuySection";

export default async function DashboardClubSocialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const socialRes = await getClubSocial({ slug });
  if (!socialRes.ok) {
    if (socialRes.error.code === "CLUBS.NOT_FOUND") notFound();
    throw new Error(socialRes.error.message);
  }

  const clubId = socialRes.data.club.id;
  const [feedRes, gwRes] = await Promise.all([
    listClubFeedPosts({ clubId }),
    listActiveClubGiveaways({ clubId }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ClubProfileView
        social={socialRes.data}
        feedPosts={feedRes.ok ? feedRes.data : []}
        activeGiveaways={gwRes.ok ? gwRes.data : []}
      />
      <ClubMembershipBuySection clubId={clubId} />
    </div>
  );
}
