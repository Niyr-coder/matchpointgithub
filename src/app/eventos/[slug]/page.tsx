import { notFound } from "next/navigation";
import { getTournament, listFeaturedTournaments } from "@/server/actions/tournaments";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { EventDetailView } from "@/components/landing/eventos/EventDetailView";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [detailRes, summaryRes] = await Promise.all([
    getTournament({ idOrSlug: slug }),
    listFeaturedTournaments({ limit: 24 }),
  ]);
  if (!detailRes.ok) notFound();
  const summary = summaryRes.ok ? summaryRes.data.find((t) => t.slug === slug) : undefined;
  return (
    <PublicChrome>
      <EventDetailView
        detail={detailRes.data}
        clubName={summary?.clubName ?? null}
        clubCity={summary?.clubCity ?? null}
      />
    </PublicChrome>
  );
}
