import { redirect } from "next/navigation";

/** Compat: notifs y feed v1 apuntaban a /dashboard/user/giveaways/[id]. */
export default async function LegacyUserGiveawayRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/clubes/giveaways/${id}`);
}
