import {
  listPublicPastTournaments,
  listPublicUpcomingTournaments,
} from "@/lib/tournaments/public-listing";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { EventosPageView } from "@/components/landing/eventos/EventosPageView";

// La ruta es dynamic (PublicChrome lee la sesión), pero los DATOS del listado
// van cacheados 60s vía unstable_cache en public-listing.ts, con invalidación
// on-demand al publicar/cancelar (revalidateTag en setTournamentStatus).
// Antes era force-dynamic + 2 queries a la DB por CADA visita anónima.

export default async function EventosPage() {
  const [tournaments, pastTournaments] = await Promise.all([
    listPublicUpcomingTournaments(24),
    listPublicPastTournaments(24),
  ]);
  return (
    <PublicChrome>
      <EventosPageView tournaments={tournaments} pastTournaments={pastTournaments} />
    </PublicChrome>
  );
}
