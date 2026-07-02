import { notFound } from "next/navigation";
import { getTournament } from "@/server/actions/tournaments";
import { getEvent } from "@/server/actions/events";
import { getClub } from "@/server/actions/clubs";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { loadTournamentScheduleBlocks } from "@/server/queries/tournament-schedule";
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
  const detailRes = await getTournament({ idOrSlug: slug });

  if (detailRes.ok) {
    const sess = await getSession();
    const supabase = await getServerClient();

    // Club de la sede: 1 fila puntual de la vista pública (antes se traían 24
    // torneos con listFeaturedTournaments solo para extraer este dato).
    const { data: summaryRow } = await supabase
      .from("tournaments_public_summary")
      .select("club_name,club_city")
      .eq("id", detailRes.data.tournament.id)
      .maybeSingle();
    const summary = summaryRow
      ? {
          clubName: (summaryRow.club_name as string | null) ?? null,
          clubCity: (summaryRow.club_city as string | null) ?? null,
        }
      : undefined;

    // Si hay sesión, chequeamos si ya está inscrito a este torneo.
    let myRegistration: MyRegistration | null = null;
    if (sess.authenticated) {
      const { data: regRow } = await supabase
        .from("registrations")
        .select("id,status,category_id")
        .eq("tournament_id", detailRes.data.tournament.id)
        .contains("player_ids", [sess.session.userId])
        .not("status", "in", "(withdrawn,rejected,cancelled)")
        .limit(1)
        .maybeSingle();
      if (regRow) {
        myRegistration = {
          id: regRow.id as string,
          status: regRow.status as string,
          categoryId: (regRow.category_id as string | null) ?? null,
        };
      }
    }

    const scheduleBlocks = await loadTournamentScheduleBlocks(detailRes.data.tournament.id);

    // Premios reales del organizador (tournament_prizes, lectura pública) —
    // el podio ya no es el split teórico 50/30/20 cuando hay lista granular.
    // category_id atribuye cada premio a su categoría (multi-categoría).
    type PrizeRowRaw = { position: number | null; place_label: string; prize_label: string; value_cents: number | null; category_id: string | null };
    const { data: prizesRaw } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("tournament_prizes" as any)
      .select("position,place_label,prize_label,value_cents,category_id")
      .eq("tournament_id", detailRes.data.tournament.id)
      .order("position", { ascending: true });
    const catNameById = new Map(
      detailRes.data.categories.map((c) => [c.id, c.name] as const),
    );
    const prizes = ((prizesRaw ?? []) as unknown as PrizeRowRaw[]).map((p) => ({
      position: p.position ?? null,
      placeLabel: p.place_label,
      prizeLabel: p.prize_label,
      valueCents: p.value_cents ?? null,
      categoryName: p.category_id ? (catNameById.get(p.category_id) ?? null) : null,
    }));

    // Lista de inscritos — admin client: reg_visible no tiene política pública.
    const admin = getAdminClient();
    type RegRow = { id: string; player_ids: string[] | null; guest_names: string[] | null; created_at: string };
    const { data: regsRaw } = await admin
      .from("registrations")
      .select("id,player_ids,created_at")
      .eq("tournament_id", detailRes.data.tournament.id)
      // Waitlist no aparece en la lista pública de inscritos.
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: true })
      .limit(64) as unknown as { data: RegRow[] | null };
    // Fetch guest_names separately ya que no están en los tipos generados.
    const regIds = (regsRaw ?? []).map((r) => r.id);
    const guestsByRegId = new Map<string, string[]>();
    if (regIds.length > 0) {
      const { data: guestRows } = await admin
        .from("registrations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id,guest_names" as any)
        .in("id", regIds) as unknown as { data: { id: string; guest_names: string[] | null }[] | null };
      for (const g of guestRows ?? []) {
        if (g.guest_names?.length) guestsByRegId.set(g.id, g.guest_names);
      }
    }
    const allIds = new Set<string>();
    for (const r of regsRaw ?? []) {
      for (const p of r.player_ids ?? []) allIds.add(p);
    }
    const profById = new Map<string, { displayName: string; avatarUrl: string | null; city: string | null }>();
    if (allIds.size > 0) {
      const { data: profs } = await admin
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
    const inscritos = (regsRaw ?? []).flatMap((r) => {
      const pids = r.player_ids ?? [];
      const guests = guestsByRegId.get(r.id) ?? [];
      // Walk-ins: player_ids vacío, nombres en guest_names
      if (pids.length === 0 && guests.length > 0) {
        return guests.map((name) => ({
          userId: r.id,
          displayName: name,
          avatarUrl: null,
          city: null,
          registeredAt: r.created_at,
        }));
      }
      return pids.map((pid) => {
        const p = profById.get(pid);
        return {
          userId: pid,
          displayName: p?.displayName ?? "Sin nombre",
          avatarUrl: p?.avatarUrl ?? null,
          city: p?.city ?? null,
          registeredAt: r.created_at,
        };
      });
    });

    return (
      <PublicChrome>
        <EventDetailView
          detail={detailRes.data}
          clubName={summary?.clubName ?? null}
          clubCity={summary?.clubCity ?? null}
          myRegistration={myRegistration}
          inscritos={inscritos}
          scheduleBlocks={scheduleBlocks}
          prizes={prizes}
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
