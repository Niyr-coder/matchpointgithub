import { notFound } from "next/navigation";
import { getClubSocial } from "@/server/actions/clubs";
import { ClubSocialView } from "@/components/dashboard/clubes/ClubSocialView";
import { ClubMembershipBuySection } from "@/components/dashboard/clubes/ClubMembershipBuySection";

export default async function DashboardClubSocialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await getClubSocial({ slug });
  if (!res.ok) {
    if (res.error.code === "CLUBS.NOT_FOUND") notFound();
    throw new Error(res.error.message);
  }
  const clubId = (res.data.club as { id: string }).id;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ClubSocialView data={res.data} />
      <ClubMembershipBuySection clubId={clubId} />
    </div>
  );
}
