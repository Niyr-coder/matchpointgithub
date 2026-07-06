/**
 * Seed · Concorde Pickleball Club (idempotente por slug).
 *
 *   npx tsx --env-file=.env.local scripts/seed-concorde-club.ts
 *
 * Crea:
 *   - Club "Concorde Pickleball Club" (Portoviejo, EC, pickleball, active).
 *   - club_settings con defaults (ventana 14d, slot 60 min, walk-ins on).
 *   - 7 canchas C1..C7 activas.
 *   - court_pricing $8/hora (800 cents) 08:00–22:00 todos los días.
 *
 * Sin owner: el club queda gestionable por admin; asignar owner después con
 * un insert en role_assignments (role='owner', club_id).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as any;

const CLUB = {
  name: "Concorde Pickleball Club",
  slug: "concorde-pickleball-club",
  city: "Portoviejo",
  country: "EC",
  timezone: "America/Guayaquil",
  currency: "USD",
  sports: ["pickleball"],
};

const COURTS_COUNT = 7;
const PRICE_CENTS = 800; // $8.00 / hora

async function main() {
  // 1. Club (idempotente por slug)
  let clubId: string;
  const { data: existing } = await sb.from("clubs").select("id").eq("slug", CLUB.slug).maybeSingle();
  if (existing?.id) {
    clubId = existing.id as string;
    console.log(`Club ya existe (${clubId}) — actualizando datos base.`);
    await sb
      .from("clubs")
      .update({ name: CLUB.name, city: CLUB.city, status: "active", sports: CLUB.sports })
      .eq("id", clubId);
  } else {
    const { data: club, error } = await sb
      .from("clubs")
      .insert({
        name: CLUB.name,
        slug: CLUB.slug,
        city: CLUB.city,
        country: CLUB.country,
        status: "active",
        timezone: CLUB.timezone,
        currency: CLUB.currency,
        sports: CLUB.sports,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !club) throw new Error(`club insert: ${error?.message ?? "sin id"}`);
    clubId = club.id as string;
    console.log(`✓ Club creado: ${CLUB.name} (${clubId})`);
  }

  // 2. Settings (idempotente por PK)
  const { error: settingsErr } = await sb.from("club_settings").upsert(
    {
      club_id: clubId,
      reservation_window_days: 14,
      default_slot_minutes: 60,
      allow_walkins: true,
    },
    { onConflict: "club_id" },
  );
  if (settingsErr) throw new Error(`club_settings: ${settingsErr.message}`);
  console.log("✓ club_settings listos");

  // 3. Canchas C1..C7 (idempotente por (club_id, code))
  for (let i = 1; i <= COURTS_COUNT; i++) {
    const code = `C${i}`;
    const { data: court } = await sb
      .from("courts")
      .select("id")
      .eq("club_id", clubId)
      .eq("code", code)
      .maybeSingle();
    let courtId: string;
    if (court?.id) {
      courtId = court.id as string;
      await sb.from("courts").update({ active: true, sport: "pickleball" }).eq("id", courtId);
    } else {
      const { data: created, error } = await sb
        .from("courts")
        .insert({
          club_id: clubId,
          code,
          name: `Cancha ${i}`,
          sport: "pickleball",
          indoor: false,
          lights: true,
          ordinal: i - 1,
          active: true,
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(`court ${code}: ${error?.message ?? "sin id"}`);
      courtId = created.id as string;
    }

    // 4. Pricing $8/h (idempotente: si ya hay banda activa de 60 min, se actualiza)
    const { data: band } = await sb
      .from("court_pricing")
      .select("id")
      .eq("court_id", courtId)
      .eq("active", true)
      .is("day_of_week", null)
      .maybeSingle();
    if (band?.id) {
      await sb
        .from("court_pricing")
        .update({ price_cents: PRICE_CENTS, starts_at: "08:00", ends_at: "22:00", duration_minutes: 60, currency: "USD" })
        .eq("id", band.id);
    } else {
      const { error } = await sb.from("court_pricing").insert({
        court_id: courtId,
        day_of_week: null,
        starts_at: "08:00",
        ends_at: "22:00",
        price_cents: PRICE_CENTS,
        duration_minutes: 60,
        currency: "USD",
        active: true,
      });
      if (error) throw new Error(`pricing ${code}: ${error.message}`);
    }
    console.log(`✓ ${code} lista ($${PRICE_CENTS / 100}/h)`);
  }

  console.log(`\nListo: ${CLUB.name} · ${COURTS_COUNT} canchas · $${PRICE_CENTS / 100}/hora · /clubes/${CLUB.slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
