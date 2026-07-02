// Listado público de torneos SIN cookies, cacheado 60s con unstable_cache.
//
// La ruta /eventos es dynamic sí o sí (PublicChrome lee la sesión), así que el
// cache va en los DATOS: estas funciones usan el client anónimo puro (sin
// cookies()/headers() — dynamic APIs romperían unstable_cache) y se invalidan
// on-demand con revalidateTag(PUBLIC_TOURNAMENTS_TAG) desde
// setTournamentStatus. Antes: 2 queries a la DB por CADA visita anónima
// (audit de costos 2026-07-01). La vista tiene grant a anon y solo expone
// torneos no-draft/no-cancelled.
import "server-only";

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/db/env";
import { TournamentFeaturedSchema, type TournamentFeatured } from "@/lib/schemas/tournaments";

export const PUBLIC_TOURNAMENTS_TAG = "public-tournaments";

function anonClient() {
  return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapFeaturedRow(row: Record<string, unknown>): TournamentFeatured {
  return TournamentFeaturedSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    prizePoolCents: row.prize_pool_cents ?? null,
    entryFeeCents: row.entry_fee_cents ?? 0,
    currency: row.currency ?? null,
    maxParticipants: row.max_participants ?? null,
    allowWaitlist: (row.allow_waitlist as boolean | null | undefined) ?? false,
    sport: row.sport,
    format: row.format,
    status: row.status,
    clubName: row.club_name ?? null,
    clubCity: row.club_city ?? null,
    registrationsCount: row.registrations_count ?? 0,
    isFeatured: (row.is_featured as boolean | null | undefined) ?? false,
  });
}

/** Próximos torneos (estelar primero) — misma query que listFeaturedTournaments. */
export const listPublicUpcomingTournaments = unstable_cache(
  async (limit: number): Promise<TournamentFeatured[]> => {
    const { data, error } = await anonClient()
      .from("tournaments_public_summary")
      .select("*")
      .gte("starts_at", new Date().toISOString())
      .order("is_featured", { ascending: false })
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("[public-listing] upcoming falló:", error.message);
      return [];
    }
    return (data ?? []).map((r) => mapFeaturedRow(r as Record<string, unknown>));
  },
  ["public-tournaments-upcoming"],
  { revalidate: 60, tags: [PUBLIC_TOURNAMENTS_TAG] },
);

/** Torneos pasados — misma query que listPastTournaments. */
export const listPublicPastTournaments = unstable_cache(
  async (limit: number): Promise<TournamentFeatured[]> => {
    const { data, error } = await anonClient()
      .from("tournaments_public_summary")
      .select("*")
      .or(`status.eq.finished,ends_at.lt.${new Date().toISOString()}`)
      .order("ends_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[public-listing] past falló:", error.message);
      return [];
    }
    return (data ?? []).map((r) => mapFeaturedRow(r as Record<string, unknown>));
  },
  ["public-tournaments-past"],
  { revalidate: 60, tags: [PUBLIC_TOURNAMENTS_TAG] },
);
