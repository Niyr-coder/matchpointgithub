import { listFeaturedTournaments, listPastTournaments } from "@/server/actions/tournaments";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { EventosPageView } from "@/components/landing/eventos/EventosPageView";

export default async function EventosPage() {
  const [upcomingRes, pastRes] = await Promise.all([
    listFeaturedTournaments({ limit: 24 }),
    listPastTournaments({ limit: 24 }),
  ]);
  const tournaments = upcomingRes.ok ? upcomingRes.data : [];
  const pastTournaments = pastRes.ok ? pastRes.data : [];
  return (
    <PublicChrome>
      <EventosPageView tournaments={tournaments} pastTournaments={pastTournaments} />
    </PublicChrome>
  );
}
