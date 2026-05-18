import { notFound } from "next/navigation";
import { getTournament, listFeaturedTournaments } from "@/server/actions/tournaments";
import { getEvent } from "@/server/actions/events";
import { getClub } from "@/server/actions/clubs";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { PublicChrome } from "@/components/landing/PublicChrome";
import {
  EventDetailView,
  type MyRegistration,
} from "@/components/landing/eventos/EventDetailView";
import { EventKindDetailView } from "@/components/landing/eventos/EventKindDetailView";

// Igual que el listado: detalle público debe reflejar cancelaciones y
// cambios de status (cuota, fecha, etc) sin esperar revalidate.
export const dynamic = "force-dynamic";

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
    const sess = await getSession();
    const supabase = await getServerClient();

    // Si hay sesión, chequeamos si ya está inscrito a este torneo.
    let myRegistration: MyRegistration | null = null;
    if (sess.authenticated) {
      const { data: regRow } = await supabase
        .from("registrations")
        .select("id,status")
        .eq("tournament_id", detailRes.data.tournament.id)
        .contains("player_ids", [sess.session.userId])
        .not("status", "in", "(withdrawn,rejected,cancelled)")
        .limit(1)
        .maybeSingle();
      if (regRow) {
        myRegistration = {
          id: regRow.id as string,
          status: regRow.status as string,
        };
      }
    }

    // Lista de inscritos para mostrar abajo del detalle. Resuelve perfiles
    // de todos los player_ids en una sola query batch.
    const { data: regsRaw } = await supabase
      .from("registrations")
      .select("id,player_ids,created_at")
      .eq("tournament_id", detailRes.data.tournament.id)
      .not("status", "in", "(withdrawn,rejected,cancelled)")
      .order("created_at", { ascending: true })
      .limit(64);
    const allIds = new Set<string>();
    for (const r of regsRaw ?? []) {
      for (const p of (r.player_ids as string[] | null) ?? []) allIds.add(p);
    }
    const profById = new Map<string, { displayName: string; avatarUrl: string | null; city: string | null }>();
    if (allIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url,city")
        .in("id", Array.from(allIds));
      for (const p of profs ?? []) {
        profById.set(p.id as string, {
          displayName: (p.display_name as string | null) ?? "Sin nombre",
          avatarUrl: (p.avatar_url as string | null) ?? null,
          city: (p.city as string | null) ?? null,
        });
      }
    }
    const inscritos = (regsRaw ?? []).flatMap((r) =>
      ((r.player_ids as string[] | null) ?? []).map((pid) => {
        const p = profById.get(pid);
        return {
          userId: pid,
          displayName: p?.displayName ?? "Sin nombre",
          avatarUrl: p?.avatarUrl ?? null,
          city: p?.city ?? null,
          registeredAt: r.created_at as string,
        };
      }),
    );

    return (
      <PublicChrome>
        <EventDetailView
          detail={detailRes.data}
          clubName={summary?.clubName ?? null}
          clubCity={summary?.clubCity ?? null}
          myRegistration={myRegistration}
          inscritos={inscritos}
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
