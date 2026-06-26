import { notFound } from "next/navigation";
import { getTournamentLiveDisplay } from "@/server/actions/tournament-live";
import { TournamentLiveDisplayClient } from "@/components/tournaments/TournamentLiveDisplayClient";

export const dynamic = "force-dynamic";

export default async function TournamentLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { slug } = await params;
  const { k } = await searchParams;
  if (!k) notFound();

  const res = await getTournamentLiveDisplay({ slug, token: k });
  if (!res.ok) notFound();

  return (
    <TournamentLiveDisplayClient slug={slug} token={k} initial={res.data} />
  );
}
