import { notFound } from "next/navigation";
import { getClubSocial } from "@/server/actions/clubs";
import { ClubSocialView } from "@/components/dashboard/clubes/ClubSocialView";

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
  return <ClubSocialView data={res.data} />;
}
