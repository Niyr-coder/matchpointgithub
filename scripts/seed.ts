// Demo data seeder. Populates the live DB with the same fixtures the
// dashboard mocks display, so wiring UI → real API doesn't show empty screens.
//
// Run:
//   npx tsx --env-file=.env.local scripts/seed.ts            # idempotent populate
//   npx tsx --env-file=.env.local scripts/seed.ts --reset    # wipe demo data + repopulate
//
// All demo users share the @matchpoint.demo domain so cleanup is trivial.
// Bypasses RLS via service role.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const RESET = process.argv.includes("--reset");
const DEMO_PASSWORD = "MatchPoint-demo-2026";
const DEMO_DOMAIN = "matchpoint.demo";

// Untyped: scripts intentionally bypass the generated `Database` types so we
// don't have to placate strict update payloads. Trust Postgres to reject bad data.
 
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

// ── helpers ────────────────────────────────────────────────────────────
async function ensureUser(opts: {
  email: string;
  username: string;
  displayName: string;
  city?: string;
  country?: string;
  preferredSport?: "tennis" | "padel" | "pickleball";
  skillLevel?: "beginner" | "intermediate" | "advanced" | "pro";
}): Promise<string> {
  // Look up by email first (auth admin).
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === opts.email);
  if (existing) {
    // Make sure the profile reflects whatever we want now.
    await sb
      .from("profiles")
      .update({
        username: opts.username,
        display_name: opts.displayName,
        city: opts.city ?? null,
        country: opts.country ?? "EC",
        preferred_sport: opts.preferredSport ?? null,
        skill_level: opts.skillLevel ?? null,
      })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: opts.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: opts.username,
      display_name: opts.displayName,
      locale: "es",
    },
  });
  if (error) throw new Error(`createUser ${opts.email}: ${error.message}`);

  // Trigger created profile + role 'user'. Fill optional bits.
  await sb
    .from("profiles")
    .update({
      city: opts.city ?? null,
      country: opts.country ?? "EC",
      preferred_sport: opts.preferredSport ?? null,
      skill_level: opts.skillLevel ?? null,
    })
    .eq("id", data.user!.id);

  return data.user!.id;
}

async function grantRole(userId: string, role: string, clubId?: string, partnerId?: string) {
  const { error } = await sb
    .from("role_assignments")
    .upsert(
      {
        user_id: userId,
        role,
        club_id: clubId ?? null,
        partner_id: partnerId ?? null,
        granted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,role,club_id,partner_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`grantRole ${role}: ${error.message}`);
}

async function wipeDemo() {
  console.log("⌫  wiping demo data ...");
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const demoUsers = (list?.users ?? []).filter((u) => u.email?.endsWith("@" + DEMO_DOMAIN));
  const userIds = demoUsers.map((u) => u.id);

  // Look up demo clubs (and partners) by slug before deleting them, so we can
  // explicitly clean child rows whose FKs lack ON DELETE CASCADE.
  const { data: demoClubs } = await sb
    .from("clubs")
    .select("id")
    .in("slug", ["club-norte-pickleball", "club-sur-padel"]);
  const clubIds = (demoClubs ?? []).map((c) => c.id);

  if (clubIds.length) {
    await sb.from("reservations").delete().in("club_id", clubIds);
    await sb.from("walkins").delete().in("club_id", clubIds);
    await sb.from("check_ins").delete().in("club_id", clubIds);
    // Featuring de clubes antes que transactions (FK transaction_id NO ACTION),
    // sino quedan huérfanas en AdminPlans "featuring reciente".
    await sb.from("club_featuring_subscriptions").delete().in("club_id", clubIds);
    await sb.from("transactions").delete().in("club_id", clubIds);
    await sb.from("cash_sessions").delete().in("club_id", clubIds);
    await sb.from("sales").delete().in("club_id", clubIds);
    await sb.from("products").delete().in("club_id", clubIds);
    await sb.from("classes").delete().in("club_id", clubIds);
    await sb.from("events").delete().in("club_id", clubIds);
    await sb.from("tournaments").delete().in("club_id", clubIds);
    await sb.from("tickets").delete().in("club_id", clubIds);
    await sb.from("courts").delete().in("club_id", clubIds);
  }

  if (userIds.length) {
    await sb.from("reservations").delete().in("organizer_id", userIds);
    await sb.from("notifications").delete().in("recipient_user_id", userIds);
    await sb.from("teams").delete().in("captain_id", userIds);
    await sb.from("conversations").delete().in("created_by", userIds);
    await sb.from("tickets").delete().in("opener_id", userIds);
    // Coach domain has no FK cascade from profiles → clean manually.
    await sb.from("resource_files").delete().in("resource_id",
      ((await sb.from("resources").select("id").in("coach_id", userIds)).data ?? []).map((r) => r.id));
    await sb.from("resources").delete().in("coach_id", userIds);
    await sb.from("coach_certifications").delete().in("coach_id", userIds);
    await sb.from("coach_availability").delete().in("coach_id", userIds);
    await sb.from("coach_specialties").delete().in("coach_id", userIds);
    await sb.from("coach_clubs").delete().in("coach_id", userIds);
    await sb.from("coach_reviews").delete().in("coach_id", userIds);
    await sb.from("coach_profiles").delete().in("id", userIds);
    // Friendships use composite (user_a, user_b) and neither cascades.
    await sb.from("friendships").delete().or(
      userIds.map((id) => `user_a.eq.${id},user_b.eq.${id}`).join(","),
    );
    await sb.from("friend_requests").delete().or(
      userIds.map((id) => `from_user_id.eq.${id},to_user_id.eq.${id}`).join(","),
    );
    await sb.from("player_stats").delete().in("user_id", userIds);
    // Planes premium: NO cascadean siempre (el borrado por auth.admin /
    // Studio puede bypassear el cascade y dejar player_subscriptions huérfanas
    // → seguían saliendo en AdminPlans "historial reciente"). Borramos explícito.
    // Orden: subs ANTES que transactions (FK transaction_id es NO ACTION).
    await sb.from("player_subscriptions").delete().in("user_id", userIds);
    await sb.from("transactions").delete().in("customer_user_id", userIds);
    await sb.from("role_assignments").delete().in("user_id", userIds);
  }

  // Catalog tables (shared, no need to delete) — just used by smoke tests.
  await sb.from("notification_kinds").delete().in("kind", [
    "reservation.confirmed", "reservation.created", "message.new",
    "class.enrollment.new", "club_app.submitted", "club_app.review_needed",
  ]);

  await sb.from("clubs").delete().in("slug", ["club-norte-pickleball", "club-sur-padel"]);
  await sb.from("partner_orgs").delete().in("slug", ["fep-pickleball"]);

  for (const u of demoUsers) await sb.auth.admin.deleteUser(u.id);
  console.log(`   removed ${demoUsers.length} demo users, ${clubIds.length} clubs`);
}

const ts = (offsetMin: number) =>
  new Date(Date.now() + offsetMin * 60 * 1000).toISOString();
const tsrange = (startMin: number, durationMin: number) =>
  `[${ts(startMin)},${ts(startMin + durationMin)})`;

// Inline error reporter for upserts/inserts that don't chain .select().
async function check<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) {
    console.error(`   ✗ ${label}: ${error.message}`);
    return null;
  }
  const n = Array.isArray(data) ? data.length : data ? 1 : 0;
  console.log(`   ✓ ${label} (${n})`);
  return data;
}

// ── main ───────────────────────────────────────────────────────────────
async function main() {
  if (RESET) await wipeDemo();

  const existing = await sb.auth.admin.listUsers({ perPage: 1 });
  const alreadyAdmin = await sb
    .from("profiles")
    .select("id")
    .eq("username", "mpadmin")
    .maybeSingle();
  if (alreadyAdmin.data && !RESET) {
    console.log("✓ demo data already present (use --reset to repopulate)");
    return;
  }

  console.log("👥 users ...");
  const users = {
    admin: await ensureUser({ email: `admin@${DEMO_DOMAIN}`, username: "mpadmin", displayName: "MP Admin" }),
    laura: await ensureUser({
      email: `laura@${DEMO_DOMAIN}`,
      username: "lauraNorte",
      displayName: "Laura Cevallos",
      city: "Cumbayá",
      preferredSport: "pickleball",
      skillLevel: "advanced",
    }),
    diego: await ensureUser({
      email: `diego@${DEMO_DOMAIN}`,
      username: "diegoSur",
      displayName: "Diego Carrasco",
      city: "Quito",
      preferredSport: "padel",
      skillLevel: "advanced",
    }),
    manager: await ensureUser({
      email: `marta@${DEMO_DOMAIN}`,
      username: "martaNorte",
      displayName: "Marta Pérez",
      city: "Cumbayá",
    }),
    employee: await ensureUser({
      email: `sofia@${DEMO_DOMAIN}`,
      username: "sofiaRcp",
      displayName: "Sofía Andrade",
      city: "Cumbayá",
    }),
    coach: await ensureUser({
      email: `joaquin@${DEMO_DOMAIN}`,
      username: "joacoach",
      displayName: "Joaquín Silva",
      city: "Cumbayá",
      preferredSport: "pickleball",
      skillLevel: "pro",
    }),
    coach2: await ensureUser({
      email: `maite@${DEMO_DOMAIN}`,
      username: "maitecoach",
      displayName: "Maite Acosta",
      city: "Quito",
      preferredSport: "tennis",
      skillLevel: "pro",
    }),
    partner: await ensureUser({
      email: `partner@${DEMO_DOMAIN}`,
      username: "fepartner",
      displayName: "Pablo Endara · FEP",
      city: "Quito",
    }),
    camila: await ensureUser({
      email: `camila@${DEMO_DOMAIN}`,
      username: "camilaA",
      displayName: "Camila Aguilar",
      city: "Cumbayá",
      preferredSport: "pickleball",
      skillLevel: "intermediate",
    }),
    andres: await ensureUser({
      email: `andres@${DEMO_DOMAIN}`,
      username: "andresV",
      displayName: "Andrés Vega",
      city: "Quito",
      preferredSport: "padel",
      skillLevel: "intermediate",
    }),
    valentina: await ensureUser({
      email: `valentina@${DEMO_DOMAIN}`,
      username: "valeS",
      displayName: "Valentina Soto",
      city: "Cumbayá",
      preferredSport: "tennis",
      skillLevel: "intermediate",
    }),
    mateo: await ensureUser({
      email: `mateo@${DEMO_DOMAIN}`,
      username: "mateoV",
      displayName: "Mateo Vélez",
      city: "Quito",
      preferredSport: "padel",
      skillLevel: "beginner",
    }),
  };

  console.log("🏷  roles ...");
  await grantRole(users.admin, "admin");
  await grantRole(users.partner, "user");

  console.log("🏢 partner org ...");
  await sb.from("partner_orgs").upsert(
    {
      slug: "fep-pickleball",
      name: "Federación Ecuatoriana de Pickleball",
      country: "EC",
      contact_email: `partner@${DEMO_DOMAIN}`,
      status: "active",
    } as never,
    { onConflict: "slug" },
  );
  const { data: partnerOrg } = await sb
    .from("partner_orgs")
    .select("id")
    .eq("slug", "fep-pickleball")
    .single();
  if (partnerOrg) {
    await check("partner_members", sb.from("partner_members").insert(
      [{ partner_id: partnerOrg.id, user_id: users.partner, role: "owner" }] as never,
      { defaultToNull: false },
    ) as never);
    await grantRole(users.partner, "partner", undefined, partnerOrg.id);
  }

  console.log("🏟  clubs ...");
  const { data: clubNorte } = await sb
    .from("clubs")
    .upsert(
      {
        slug: "club-norte-pickleball",
        name: "Club Norte Pickleball",
        description: "Club outdoor con 4 canchas profesionales en Cumbayá.",
        country: "EC",
        city: "Cumbayá",
        address: "Av. Interoceánica km 12, Local 4",
        phone: "+593 99 412 8866",
        email: `laura@${DEMO_DOMAIN}`,
        timezone: "America/Guayaquil",
        currency: "USD",
        sports: ["pickleball"],
        status: "active",
        applied_by: users.laura,
        approved_by: users.admin,
        approved_at: new Date().toISOString(),
      } as never,
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  const { data: clubSur } = await sb
    .from("clubs")
    .upsert(
      {
        slug: "club-sur-padel",
        name: "Club Sur Pádel",
        description: "4 pistas panorámicas en el corazón sur de Quito.",
        country: "EC",
        city: "Quito",
        address: "Av. Mariscal Sucre s/n",
        phone: "+593 99 222 1100",
        email: `diego@${DEMO_DOMAIN}`,
        timezone: "America/Guayaquil",
        currency: "USD",
        sports: ["padel"],
        status: "active",
        applied_by: users.diego,
        approved_by: users.admin,
        approved_at: new Date().toISOString(),
      } as never,
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (!clubNorte || !clubSur) throw new Error("club upsert failed");
  const NORTE = clubNorte.id;
  const SUR = clubSur.id;

  // Settings + amenities + photos
  await sb.from("club_settings").upsert(
    [
      { club_id: NORTE, reservation_window_days: 14, cancellation_window_hours: 24, default_slot_minutes: 60, allow_walkins: true, open_hours: { mon: [["06:00", "22:00"]], sun: [["07:00", "22:00"]] } },
      { club_id: SUR, reservation_window_days: 14, cancellation_window_hours: 48, default_slot_minutes: 90, allow_walkins: true, open_hours: { mon: [["07:00", "23:00"]] } },
    ] as never,
    { onConflict: "club_id" },
  );
  await check("club_amenities", sb.from("club_amenities").insert(
    [
      { club_id: NORTE, amenity: "parking" },
      { club_id: NORTE, amenity: "pro_shop" },
      { club_id: NORTE, amenity: "showers" },
      { club_id: NORTE, amenity: "wifi" },
      { club_id: SUR, amenity: "parking" },
      { club_id: SUR, amenity: "restaurant" },
      { club_id: SUR, amenity: "wifi" },
    ] as never,
    { defaultToNull: false },
  ) as never);

  console.log("👮 club staff ...");
  await grantRole(users.laura, "owner", NORTE);
  await grantRole(users.manager, "manager", NORTE);
  await grantRole(users.employee, "employee", NORTE);
  await grantRole(users.coach, "coach", NORTE);
  await grantRole(users.diego, "owner", SUR);
  await grantRole(users.coach2, "coach", SUR);

  console.log("🎾 courts ...");
  const courtsData = [
    { club_id: NORTE, code: "C1", sport: "pickleball", surface: "acrylic_outdoor", indoor: false, lights: true, ordinal: 0 },
    { club_id: NORTE, code: "C2", sport: "pickleball", surface: "acrylic_outdoor", indoor: false, lights: true, ordinal: 1 },
    { club_id: NORTE, code: "C3", sport: "pickleball", surface: "acrylic_outdoor", indoor: false, lights: true, ordinal: 2 },
    { club_id: NORTE, code: "C4", sport: "pickleball", surface: "synthetic_indoor", indoor: true, lights: false, ordinal: 3 },
    { club_id: SUR, code: "P1", sport: "padel", surface: "panoramic", indoor: false, lights: true, ordinal: 0 },
    { club_id: SUR, code: "P2", sport: "padel", surface: "panoramic", indoor: false, lights: true, ordinal: 1 },
    { club_id: SUR, code: "P3", sport: "padel", surface: "panoramic", indoor: false, lights: true, ordinal: 2 },
    { club_id: SUR, code: "P4", sport: "padel", surface: "panoramic", indoor: true, lights: false, ordinal: 3 },
  ];
  await sb.from("courts").upsert(courtsData as never, { onConflict: "club_id,code" });
  const { data: courts } = await sb.from("courts").select("id,club_id,code").in("club_id", [NORTE, SUR]);
  const courtId = (clubId: string, code: string) =>
    courts!.find((c) => c.club_id === clubId && c.code === code)!.id;

  // Court pricing (one rate per court for simplicity)
  await sb.from("court_pricing").upsert(
    courts!.map((c) => ({
      court_id: c.id,
      day_of_week: null,
      starts_at: "06:00",
      ends_at: "23:00",
      price_cents: c.club_id === NORTE ? 2400 : 2800,
      duration_minutes: 60,
      currency: "USD",
      active: true,
    })) as never,
    { ignoreDuplicates: true },
  );

  console.log("📅 reservations ...");
  // Some past, some today, some future, mix of statuses
  const reservations = [
    { club_id: NORTE, court_id: courtId(NORTE, "C3"), during: tsrange(-1440, 90), status: "completed", sport: "pickleball", organizer_id: users.camila, max_players: 4 },
    { club_id: NORTE, court_id: courtId(NORTE, "C1"), during: tsrange(-90, 60), status: "checked_in", sport: "pickleball", organizer_id: users.andres, max_players: 2 },
    { club_id: NORTE, court_id: courtId(NORTE, "C2"), during: tsrange(30, 60), status: "booked", sport: "pickleball", organizer_id: users.valentina, max_players: 2, visibility: "public" },
    { club_id: NORTE, court_id: courtId(NORTE, "C3"), during: tsrange(60, 90), status: "booked", sport: "pickleball", organizer_id: users.camila, max_players: 4, visibility: "public" },
    { club_id: NORTE, court_id: courtId(NORTE, "C4"), during: tsrange(90, 90), status: "booked", sport: "pickleball", organizer_id: users.andres, max_players: 4 },
    { club_id: NORTE, court_id: courtId(NORTE, "C1"), during: tsrange(120, 90), status: "confirmed", sport: "pickleball", organizer_id: users.mateo, max_players: 4 },
    { club_id: NORTE, court_id: courtId(NORTE, "C3"), during: tsrange(-2880, 60), status: "no_show", sport: "pickleball", organizer_id: users.mateo, max_players: 2 },
    { club_id: SUR, court_id: courtId(SUR, "P1"), during: tsrange(60, 90), status: "booked", sport: "padel", organizer_id: users.andres, max_players: 4 },
    { club_id: SUR, court_id: courtId(SUR, "P2"), during: tsrange(180, 90), status: "booked", sport: "padel", organizer_id: users.mateo, max_players: 4 },
  ];
  await check(
    "reservations",
    sb.from("reservations").insert(reservations as never, { defaultToNull: false }).select() as never,
  );

  console.log("💵 cash session + transactions ...");
  const { data: cashSession } = await sb
    .from("cash_sessions")
    .insert({
      club_id: NORTE,
      opened_by: users.employee,
      opened_at: ts(-360),
      opening_float_cents: 5000,
      status: "open",
    } as never)
    .select("id")
    .single();
  const SESSION = cashSession!.id;
  await sb.from("transactions").insert(
    [
      { club_id: NORTE, cash_session_id: SESSION, kind: "reservation", customer_user_id: users.camila, amount_cents: 2100, currency: "USD", method: "card", status: "captured", created_by: users.employee, created_at: ts(-180) },
      { club_id: NORTE, cash_session_id: SESSION, kind: "reservation", customer_user_id: users.andres, amount_cents: 1400, currency: "USD", method: "cash", status: "captured", created_by: users.employee, created_at: ts(-150) },
      { club_id: NORTE, cash_session_id: SESSION, kind: "proshop_sale", customer_user_id: users.camila, amount_cents: 19800, currency: "USD", method: "card", status: "captured", created_by: users.employee, created_at: ts(-120) },
      { club_id: NORTE, cash_session_id: SESSION, kind: "reservation", customer_user_id: users.mateo, amount_cents: -2700, currency: "USD", method: "card", status: "refunded", created_by: users.employee, created_at: ts(-100) },
      { club_id: NORTE, cash_session_id: SESSION, kind: "proshop_sale", customer_name: "Walk-in · Sofía", amount_cents: 1200, currency: "USD", method: "cash", status: "captured", created_by: users.employee, created_at: ts(-70) },
      { club_id: NORTE, cash_session_id: SESSION, kind: "reservation", customer_user_id: users.valentina, amount_cents: 1400, currency: "USD", method: "transfer", status: "captured", created_by: users.employee, created_at: ts(-40) },
      { club_id: NORTE, cash_session_id: SESSION, kind: "reservation", customer_user_id: users.andres, amount_cents: 2800, currency: "USD", method: "card", status: "captured", created_by: users.employee, created_at: ts(-20) },
    ] as never,
  );

  console.log("🛍  proshop ...");
  const { data: catNorte } = await sb
    .from("product_categories")
    .upsert([{ club_id: NORTE, name: "Paletas", slug: "paletas", ordinal: 0 }, { club_id: NORTE, name: "Pelotas", slug: "pelotas", ordinal: 1 }, { club_id: NORTE, name: "Ropa", slug: "ropa", ordinal: 2 }, { club_id: NORTE, name: "Accesorios", slug: "accesorios", ordinal: 3 }] as never, { onConflict: "club_id,slug" })
    .select("id,slug");
  const cat = (slug: string) => catNorte!.find((c) => c.slug === slug)!.id;
  await sb.from("products").upsert(
    [
      { club_id: NORTE, category_id: cat("paletas"), sku: "BPV04", name: "Bullpadel Vertex 04", price_cents: 18900, currency: "USD", stock: 4, active: true },
      { club_id: NORTE, category_id: cat("paletas"), sku: "WUv2", name: "Wilson Ultra v2", price_cents: 15900, currency: "USD", stock: 6, active: true },
      { club_id: NORTE, category_id: cat("pelotas"), sku: "HEADX3", name: "Pelotas Head Pro x3", price_cents: 900, currency: "USD", stock: 24, active: true },
      { club_id: NORTE, category_id: cat("ropa"), sku: "MTECHM", name: "Polera Match Tech · M", price_cents: 2500, currency: "USD", stock: 8, active: true },
      { club_id: NORTE, category_id: cat("accesorios"), sku: "GRIP01", name: "Grip Premium", price_cents: 900, currency: "USD", stock: 18, active: true },
      { club_id: NORTE, category_id: cat("accesorios"), sku: "BAG20", name: "Bolso Pro 2.0", price_cents: 4900, currency: "USD", stock: 3, active: true },
    ] as never,
    { onConflict: "club_id,sku" },
  );

  console.log("🎓 coaches ...");
  await sb.from("coach_profiles").upsert(
    [
      { id: users.coach, headline: "Pickleball pro · 10 años de experiencia", bio: "Especialista en estrategia y juego de red.", years_experience: 10, hourly_rate_cents: 3500, currency: "USD", rating_avg: 4.9, rating_count: 38 },
      { id: users.coach2, headline: "Tenis · top 50 nacional", bio: "Ex-jugadora ITF, ahora full coaching.", years_experience: 8, hourly_rate_cents: 4000, currency: "USD", rating_avg: 4.8, rating_count: 22 },
    ] as never,
    { onConflict: "id" },
  );
  await check("coach_clubs", sb.from("coach_clubs").insert(
    [
      { coach_id: users.coach, club_id: NORTE },
      { coach_id: users.coach2, club_id: SUR },
    ] as never,
    { defaultToNull: false },
  ) as never);
  await check("coach_specialties", sb.from("coach_specialties").insert(
    [
      { coach_id: users.coach, sport: "pickleball", specialty: "tactical", proficiency: 5 },
      { coach_id: users.coach, sport: "pickleball", specialty: "serve_volley", proficiency: 5 },
      { coach_id: users.coach, sport: "pickleball", specialty: "juniors", proficiency: 4 },
      { coach_id: users.coach2, sport: "tennis", specialty: "high_performance", proficiency: 5 },
    ] as never,
    { defaultToNull: false },
  ) as never);
  await sb.from("coach_availability").insert(
    [
      { coach_id: users.coach, club_id: NORTE, day_of_week: 1, starts_at: "07:00", ends_at: "12:00" },
      { coach_id: users.coach, club_id: NORTE, day_of_week: 1, starts_at: "16:00", ends_at: "21:00" },
      { coach_id: users.coach, club_id: NORTE, day_of_week: 3, starts_at: "07:00", ends_at: "12:00" },
      { coach_id: users.coach, club_id: NORTE, day_of_week: 5, starts_at: "16:00", ends_at: "21:00" },
      { coach_id: users.coach2, club_id: SUR, day_of_week: 2, starts_at: "08:00", ends_at: "12:00" },
      { coach_id: users.coach2, club_id: SUR, day_of_week: 4, starts_at: "16:00", ends_at: "20:00" },
    ] as never,
  );
  await sb.from("coach_certifications").insert(
    [
      { coach_id: users.coach, name: "PPR Level 3", issuer: "PPR", issued_year: 2022 },
      { coach_id: users.coach, name: "IPTPA Certified", issuer: "IPTPA", issued_year: 2023 },
      { coach_id: users.coach2, name: "ITF Level 2", issuer: "ITF", issued_year: 2021 },
    ] as never,
  );
  await sb.from("coach_reviews").upsert(
    [
      { coach_id: users.coach, reviewer_id: users.camila, rating: 5, comment: "Cambió mi juego en 2 meses." },
      { coach_id: users.coach, reviewer_id: users.andres, rating: 5, comment: "Excelente didáctica." },
      { coach_id: users.coach, reviewer_id: users.valentina, rating: 5, comment: "Recomendado 100%." },
    ] as never,
    { onConflict: "coach_id,reviewer_id" },
  );

  console.log("📚 classes + students ...");
  const { data: classRows } = await sb
    .from("classes")
    .insert(
      [
        { club_id: NORTE, coach_id: users.coach, name: "Iniciación Pickleball", description: "Para empezar de cero.", kind: "group", sport: "pickleball", skill_level: "beginner", max_students: 8, price_cents: 1400, currency: "USD" },
        { club_id: NORTE, coach_id: users.coach, name: "Tactical · Avanzado", description: "Lecturas de juego y patrones.", kind: "clinic", sport: "pickleball", skill_level: "advanced", max_students: 6, price_cents: 2400, currency: "USD" },
        { club_id: SUR, coach_id: users.coach2, name: "Tenis intermedio", description: "Drills + sparring.", kind: "group", sport: "tennis", skill_level: "intermediate", max_students: 6, price_cents: 1800, currency: "USD" },
      ] as never,
    )
    .select("id, club_id, coach_id, name");
  if (classRows && classRows.length) {
    const initiation = classRows.find((c) => c.name === "Iniciación Pickleball")!;
    const tactical = classRows.find((c) => c.name === "Tactical · Avanzado")!;
    await sb.from("class_sessions").insert(
      [
        { class_id: initiation.id, court_id: courtId(NORTE, "C2"), during: tsrange(60, 60), status: "scheduled" },
        { class_id: initiation.id, court_id: courtId(NORTE, "C2"), during: tsrange(60 + 24 * 60, 60), status: "scheduled" },
        { class_id: tactical.id, court_id: courtId(NORTE, "C3"), during: tsrange(120 + 48 * 60, 90), status: "scheduled" },
      ] as never,
    );
    await sb.from("class_enrollments").upsert(
      [
        { class_id: initiation.id, student_id: users.camila, status: "enrolled" },
        { class_id: initiation.id, student_id: users.andres, status: "enrolled" },
        { class_id: initiation.id, student_id: users.mateo, status: "enrolled" },
        { class_id: tactical.id, student_id: users.valentina, status: "enrolled" },
      ] as never,
      { onConflict: "class_id,student_id" },
    );
    await sb.from("student_progress").upsert(
      [
        { student_id: users.camila, coach_id: users.coach, skill: "forehand", current_level: 6, target_level: 8 },
        { student_id: users.camila, coach_id: users.coach, skill: "volley", current_level: 5, target_level: 7 },
        { student_id: users.andres, coach_id: users.coach, skill: "serve", current_level: 4, target_level: 7 },
        { student_id: users.valentina, coach_id: users.coach, skill: "backhand", current_level: 7, target_level: 9 },
      ] as never,
      { onConflict: "student_id,coach_id,skill" },
    );
  }

  console.log("📦 resources ...");
  const { data: res } = await sb
    .from("resources")
    .insert(
      [
        { coach_id: users.coach, club_id: NORTE, title: "Plan iniciación · 4 semanas", description: "Drills + objetivos por semana.", kind: "plan", level: "beginner", tags: ["plan", "iniciacion"], visibility: "members" },
        { coach_id: users.coach, club_id: NORTE, title: "Lectura de juego doble", description: "Video táctico de 12 min.", kind: "video", level: "intermediate", tags: ["tactica", "doble"], duration_seconds: 720, visibility: "private" },
        { coach_id: users.coach, club_id: NORTE, title: "Reglamento oficial 2026", description: "PDF descargable.", kind: "pdf", level: "beginner", tags: ["reglas"], visibility: "public" },
      ] as never,
    )
    .select("id,title");

  console.log("💬 conversations ...");
  const { data: conv } = await sb
    .from("conversations")
    .insert({ kind: "dm", created_by: users.camila } as never)
    .select("id")
    .single();
  if (conv) {
    await check("conversation_members", sb.from("conversation_members").insert(
      [
        { conversation_id: conv.id, user_id: users.camila, role: "admin" },
        { conversation_id: conv.id, user_id: users.coach, role: "member" },
      ] as never,
      { defaultToNull: false },
    ) as never);
    await check("messages", sb.from("messages").insert(
      [
        { conversation_id: conv.id, sender_id: users.camila, body: "Hola Joaquín, ¿hay cupo para la clase del jueves?" },
        { conversation_id: conv.id, sender_id: users.coach, body: "¡Sí! Te apunto. ¿Vienes con Andrés?" },
        { conversation_id: conv.id, sender_id: users.camila, body: "Yes, dos plazas." },
      ] as never,
    ).select() as never);
  }

  console.log("👫 friends + teams ...");
  // friendships must have user_a < user_b lexicographically
  const pair = (a: string, b: string) => (a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a });
  await check("friendships", sb.from("friendships").insert(
    [pair(users.camila, users.andres), pair(users.camila, users.valentina), pair(users.andres, users.mateo)] as never,
    { defaultToNull: false },
  ) as never);
  await sb.from("friend_requests").insert(
    [{ from_user_id: users.valentina, to_user_id: users.mateo, status: "pending" }] as never,
  );
  const { data: team } = await sb
    .from("teams")
    .insert({ name: "Los Norteños", slug: "los-nortenos", sport: "pickleball", captain_id: users.camila, club_id: NORTE } as never)
    .select("id")
    .single();
  if (team) {
    await check("team_members", sb.from("team_members").insert(
      [
        { team_id: team.id, user_id: users.camila, role: "captain" },
        { team_id: team.id, user_id: users.andres, role: "player" },
        { team_id: team.id, user_id: users.valentina, role: "player" },
        { team_id: team.id, user_id: users.mateo, role: "substitute" },
      ] as never,
      { defaultToNull: false },
    ) as never);
  }

  console.log("🏆 ranking ...");
  await sb.from("player_stats").upsert(
    [
      { user_id: users.camila, sport: "pickleball", matches_total: 28, wins: 18, losses: 10, current_rating: 1620, peak_rating: 1640 },
      { user_id: users.andres, sport: "padel", matches_total: 31, wins: 17, losses: 14, current_rating: 1580, peak_rating: 1605 },
      { user_id: users.valentina, sport: "tennis", matches_total: 22, wins: 14, losses: 8, current_rating: 1555, peak_rating: 1555 },
      { user_id: users.mateo, sport: "padel", matches_total: 12, wins: 5, losses: 7, current_rating: 1480, peak_rating: 1495 },
    ] as never,
    { onConflict: "user_id,sport" },
  );

  console.log("🥇 tournament + bracket ...");
  if (partnerOrg) {
    const { data: tour } = await sb
      .from("tournaments")
      .insert(
        {
          partner_id: partnerOrg.id,
          club_id: NORTE,
          name: "Open Norte 2026",
          slug: "open-norte-2026",
          sport: "pickleball",
          format: "single_elim",
          starts_at: ts(7 * 24 * 60),
          ends_at: ts(9 * 24 * 60),
          registration_opens_at: ts(-7 * 24 * 60),
          registration_closes_at: ts(3 * 24 * 60),
          status: "registration_open",
          max_participants: 16,
          entry_fee_cents: 1500,
          currency: "USD",
          prize_pool_cents: 50000,
          created_by: users.partner,
        } as never,
      )
      .select("id")
      .single();
    if (tour) {
      await sb.from("tournament_categories").insert(
        [{ tournament_id: tour.id, name: "Open M", gender: "m", max_teams: 8 }] as never,
      );
    }
  }

  console.log("🎉 events ...");
  await sb.from("events").insert(
    [
      { club_id: NORTE, organizer_id: users.laura, name: "Clinic con Joaquín · gratis", slug: "clinic-joaquin-2026", kind: "clinic", status: "published", starts_at: ts(3 * 24 * 60), ends_at: ts(3 * 24 * 60 + 120), capacity: 24, price_cents: 0, currency: "USD", visibility: "public" },
      { club_id: SUR, organizer_id: users.diego, name: "Mixer pádel · viernes social", slug: "mixer-padel-2026", kind: "social", status: "published", starts_at: ts(5 * 24 * 60), ends_at: ts(5 * 24 * 60 + 180), capacity: 32, price_cents: 1000, currency: "USD", visibility: "public" },
    ] as never,
  );

  console.log("🔔 notification catalog + sample notifs ...");
  await check("notification_kinds", sb.from("notification_kinds").insert(
    [
      { kind: "reservation.confirmed", description: "Reserva confirmada", allowed_roles: ["user"], default_channels: ["inapp", "email"], category: "reservation" },
      { kind: "reservation.created", description: "Nueva reserva en tu club", allowed_roles: ["owner", "manager", "employee"], default_channels: ["inapp"], category: "reservation" },
      { kind: "message.new", description: "Mensaje nuevo", allowed_roles: ["user", "coach"], default_channels: ["inapp"], category: "message" },
      { kind: "class.enrollment.new", description: "Nuevo alumno inscrito", allowed_roles: ["coach"], default_channels: ["inapp", "email"], category: "class" },
      { kind: "club_app.submitted", description: "Tu solicitud de club fue enviada", allowed_roles: ["user"], default_channels: ["inapp"], category: "system" },
      { kind: "club_app.review_needed", description: "Solicitud nueva en cola", allowed_roles: ["admin"], default_channels: ["inapp"], category: "system" },
    ] as never,
    { defaultToNull: false },
  ) as never);
  await check("notifications", sb.from("notifications").insert(
    [
      { recipient_user_id: users.camila, recipient_role: "user", kind: "reservation.confirmed", title: "Reserva confirmada", body: "C3 · hoy 19:00 · 90 min", payload: {} },
      { recipient_user_id: users.camila, recipient_role: "user", kind: "message.new", title: "Joaquín te respondió", body: "¡Te apunto al jueves!", payload: {} },
      { recipient_user_id: users.laura, recipient_role: "owner", kind: "reservation.created", title: "Nueva reserva · Camila Aguilar", body: "C3 · hoy 19:00", payload: {} },
      { recipient_user_id: users.coach, recipient_role: "coach", kind: "class.enrollment.new", title: "Mateo se inscribió a Iniciación", body: "Quedan 5 cupos", payload: {} },
      { recipient_user_id: users.admin, recipient_role: "admin", kind: "club_app.review_needed", title: "Nueva solicitud SC-0002", body: "En cola de revisión", payload: {} },
    ] as never,
  ).select() as never);

  console.log("🎫 tickets ...");
  await sb.from("tickets").insert(
    [
      { club_id: NORTE, opener_id: users.employee, subject: "Cancha 2 · grieta en línea de fondo", category: "maintenance", severity: "high", status: "open" },
      { club_id: NORTE, opener_id: users.employee, subject: "POS no procesa tarjetas Amex", category: "system", severity: "medium", status: "in_progress" },
      { opener_id: users.camila, subject: "No puedo cancelar mi reserva", category: "customer", severity: "low", status: "open" },
    ] as never,
  );

  console.log("\n🎉 seed complete\n");
  console.log("login credentials (todos):  password = " + DEMO_PASSWORD);
  console.log("  admin · admin@" + DEMO_DOMAIN);
  console.log("  owner · laura@" + DEMO_DOMAIN);
  console.log("  manager · marta@" + DEMO_DOMAIN);
  console.log("  employee · sofia@" + DEMO_DOMAIN);
  console.log("  coach · joaquin@" + DEMO_DOMAIN);
  console.log("  partner · partner@" + DEMO_DOMAIN);
  console.log("  user · camila@" + DEMO_DOMAIN);
  void existing;
}

main().catch((e) => {
  console.error("✗ seed failed:", e);
  process.exit(1);
});
