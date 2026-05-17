import { notFound } from "next/navigation";
import { getTournament, listFeaturedTournaments } from "@/server/actions/tournaments";
import { getEvent } from "@/server/actions/events";
import { getClub } from "@/server/actions/clubs";
import { getSession } from "@/lib/auth/session";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { EventDetailView } from "@/components/landing/eventos/EventDetailView";
import { EventKindDetailView } from "@/components/landing/eventos/EventKindDetailView";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Slug-collision policy: si el slug existe tanto en tournaments como en events,
  // gana el torneo (se intenta primero). Es consistente con el comportamiento
  // previo y con que los torneos suelen tener mayor visibilidad.
  const [detailRes, summaryRes] = await Promise.all([
    getTournament({ idOrSlug: slug }),
    listFeaturedTournaments({ limit: 24 }),
  ]);

  if (detailRes.ok) {
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

  // Fallback: ¿es un event.kind (clinic/social/exhibition/etc) del club?
  const eventRes = await getEvent({ idOrSlug: slug });
  if (!eventRes.ok) notFound();
  const event = eventRes.data;

  // Hidrata nombre/ciudad del club organizador (si tiene). getClub admite uuid.
  let clubName: string | null = null;
  let clubCity: string | null = null;
  if (event.clubId) {
    const clubRes = await getClub({ idOrSlug: event.clubId });
    if (clubRes.ok) {
      clubName = clubRes.data.club.name ?? null;
      clubCity = clubRes.data.club.city ?? null;
    }
  }

  // userId desde el servidor: no hay hook client de sesión, así que se pasa
  // como prop al componente cliente. Si es null, el botón redirige a /login.
  const sess = await getSession();
  const userId = sess.authenticated ? sess.session.userId : null;

  return (
    <PublicChrome>
      <EventKindDetailView
        event={event}
        clubName={clubName}
        clubCity={clubCity}
        userId={userId}
      />
    </PublicChrome>
  );
}
