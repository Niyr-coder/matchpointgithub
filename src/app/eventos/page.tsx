import { listFeaturedTournaments, listPastTournaments } from "@/server/actions/tournaments";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { EventosPageView } from "@/components/landing/eventos/EventosPageView";

// Sin cache: el listado público debe reflejar cancelaciones, nuevos torneos
// publicados y cambios de status en tiempo real. La página la carga 1 query
// rápida — el costo de no-cachear es aceptable.
export const dynamic = "force-dynamic";

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
