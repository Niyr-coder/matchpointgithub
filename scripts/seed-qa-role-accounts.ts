/**
 * Cuentas QA para probar roles manualmente (idempotente).
 *
 *   npx tsx --env-file=.env.local scripts/seed-qa-role-accounts.ts
 *
 * Contraseña compartida: QaTest1234!
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

export const QA_PASSWORD = "QaTest1234!";
const QA_DOMAIN = "matchpoint.test";
const CLUB_SLUG = "qa-club-prueba";
const PARTNER_SLUG = "qa-org-partner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as any;

async function patchProfile(userId: string, opts: { username: string; displayName: string }) {
  await sb
    .from("profiles")
    .update({
      username: opts.username,
      display_name: opts.displayName,
      country: "EC",
      city: "Quito",
      preferred_sport: "pickleball",
      skill_level: "intermediate",
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) return null;
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signin = await anon.auth.signInWithPassword({ email, password: QA_PASSWORD });
  return signin.data?.user?.id ?? null;
}

async function ensureUser(opts: {
  email: string;
  username: string;
  displayName: string;
}): Promise<string> {
  const { data: byUsername } = await sb.from("profiles").select("id").eq("username", opts.username).maybeSingle();
  if (byUsername?.id) {
    await patchProfile(byUsername.id as string, opts);
    return byUsername.id as string;
  }

  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u: { email?: string }) => u.email === opts.email);
  if (existing) {
    await patchProfile(existing.id as string, opts);
    return existing.id as string;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email: opts.email,
    password: QA_PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: opts.username,
      display_name: opts.displayName,
      locale: "es",
    },
  });

  if (error) {
    const already =
      error.message.includes("already") || error.message.includes("registered");
    if (already) {
      const id = await resolveUserIdByEmail(opts.email);
      if (id) {
        await patchProfile(id, opts);
        return id;
      }
    }
    throw new Error(`createUser ${opts.email}: ${error.message}`);
  }

  const id = data.user!.id as string;
  await patchProfile(id, opts);
  return id;
}

async function grantRole(
  userId: string,
  role: string,
  clubId?: string | null,
  partnerId?: string | null,
) {
  let revive = sb
    .from("role_assignments")
    .update({ revoked_at: null, granted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("role", role);
  revive = clubId ? revive.eq("club_id", clubId) : revive.is("club_id", null);
  revive = partnerId ? revive.eq("partner_id", partnerId) : revive.is("partner_id", null);
  const { data: revived, error: reviveErr } = await revive.select("id");
  if (reviveErr) throw new Error(`grantRole revive ${role}: ${reviveErr.message}`);
  if (revived?.length) return;

  const { error } = await sb.from("role_assignments").insert({
    user_id: userId,
    role,
    club_id: clubId ?? null,
    partner_id: partnerId ?? null,
    granted_at: new Date().toISOString(),
  });
  if (error) throw new Error(`grantRole insert ${role}: ${error.message}`);
}

/** El trigger de signup ya inserta `user`; evitamos filas duplicadas (NULL en unique). */
async function dedupeGlobalUserRole(userId: string) {
  const { data: rows, error } = await sb
    .from("role_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "user")
    .is("club_id", null)
    .is("partner_id", null)
    .is("revoked_at", null)
    .order("granted_at", { ascending: true });
  if (error) throw new Error(`dedupe user: ${error.message}`);
  const extras = (rows ?? []).slice(1).map((r: { id: string }) => r.id);
  if (extras.length) {
    const { error: delErr } = await sb.from("role_assignments").delete().in("id", extras);
    if (delErr) throw new Error(`dedupe delete: ${delErr.message}`);
  }
}

async function ensureClub(ownerId: string): Promise<string> {
  const { data: existing } = await sb.from("clubs").select("id").eq("slug", CLUB_SLUG).maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await sb
    .from("clubs")
    .insert({
      slug: CLUB_SLUG,
      name: "Club QA Prueba",
      description: "Club de prueba para testear rol owner/manager/employee.",
      country: "EC",
      city: "Quito",
      address: "Av. QA 123",
      phone: "+593 99 000 0101",
      email: `qa-owner@${QA_DOMAIN}`,
      timezone: "America/Guayaquil",
      currency: "USD",
      sports: ["pickleball"],
      status: "active",
      applied_by: ownerId,
      approved_by: ownerId,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`club insert: ${error?.message ?? "sin id"}`);

  const clubId = data.id as string;
  await sb.from("club_settings").upsert(
    {
      club_id: clubId,
      reservation_window_days: 14,
      cancellation_window_hours: 24,
      default_slot_minutes: 60,
      allow_walkins: true,
      open_hours: { mon: [["07:00", "22:00"]] },
    },
    { onConflict: "club_id" },
  );

  const { data: courts } = await sb.from("courts").select("id").eq("club_id", clubId).limit(1);
  if (!courts?.length) {
    const { data: court, error: courtErr } = await sb
      .from("courts")
      .insert({
        club_id: clubId,
        code: "Q1",
        sport: "pickleball",
        surface: "acrylic_outdoor",
        indoor: false,
        lights: true,
        ordinal: 0,
        active: true,
      })
      .select("id")
      .single();
    if (courtErr || !court) throw new Error(`court insert: ${courtErr?.message ?? "sin id"}`);
    await sb.from("court_pricing").insert({
      court_id: court.id,
      day_of_week: null,
      starts_at: "07:00",
      ends_at: "22:00",
      price_cents: 2000,
      duration_minutes: 60,
      currency: "USD",
      active: true,
    });
  }

  return clubId;
}

async function ensurePartnerOrg(): Promise<string> {
  await sb.from("partner_orgs").upsert(
    {
      slug: PARTNER_SLUG,
      name: "Org QA Partner",
      country: "EC",
      contact_email: `qa-partner@${QA_DOMAIN}`,
      status: "active",
    },
    { onConflict: "slug" },
  );
  const { data } = await sb.from("partner_orgs").select("id").eq("slug", PARTNER_SLUG).single();
  if (!data?.id) throw new Error("partner org sin id");
  return data.id as string;
}

async function main() {
  console.log("Creando / actualizando cuentas QA …\n");

  const playerId = await ensureUser({
    email: `qa-player@${QA_DOMAIN}`,
    username: "qaplayer",
    displayName: "QA Jugador",
  });
  const ownerId = await ensureUser({
    email: `qa-owner@${QA_DOMAIN}`,
    username: "qaowner",
    displayName: "QA Dueño Club",
  });
  const managerId = await ensureUser({
    email: `qa-manager@${QA_DOMAIN}`,
    username: "qamanager",
    displayName: "QA Manager",
  });
  const employeeId = await ensureUser({
    email: `qa-employee@${QA_DOMAIN}`,
    username: "qaemployee",
    displayName: "QA Empleado",
  });
  const partnerUserId = await ensureUser({
    email: `qa-partner@${QA_DOMAIN}`,
    username: "qapartner",
    displayName: "QA Partner Org",
  });

  const clubId = await ensureClub(ownerId);
  const partnerOrgId = await ensurePartnerOrg();

  await grantRole(ownerId, "owner", clubId);
  await grantRole(managerId, "manager", clubId);
  await grantRole(employeeId, "employee", clubId);
  await grantRole(partnerUserId, "partner", null, partnerOrgId);

  await sb.from("partner_members").upsert(
    { partner_id: partnerOrgId, user_id: partnerUserId, role: "owner" },
    { onConflict: "partner_id,user_id", ignoreDuplicates: true },
  );

  for (const id of [playerId, ownerId, managerId, employeeId, partnerUserId]) {
    await dedupeGlobalUserRole(id);
  }

  const accounts = [
    { label: "Jugador", email: `qa-player@${QA_DOMAIN}`, username: "qaplayer", path: "/dashboard/user" },
    { label: "Dueño", email: `qa-owner@${QA_DOMAIN}`, username: "qaowner", path: "/dashboard/owner" },
    { label: "Manager", email: `qa-manager@${QA_DOMAIN}`, username: "qamanager", path: "/dashboard/manager" },
    { label: "Empleado", email: `qa-employee@${QA_DOMAIN}`, username: "qaemployee", path: "/dashboard/employee" },
    { label: "Partner", email: `qa-partner@${QA_DOMAIN}`, username: "qapartner", path: "/dashboard/partner" },
  ];

  console.log("Contraseña para todas:", QA_PASSWORD);
  console.log(`Club: ${CLUB_SLUG} · Partner org: ${PARTNER_SLUG}\n`);
  console.log("| Cuenta | Roles activos | Entrar directo |");
  console.log("|--------|---------------|----------------|");
  for (const a of accounts) {
    const { data: prof } = await sb.from("profiles").select("id").eq("username", a.username).maybeSingle();
    const { data: roles } = prof?.id
      ? await sb
          .from("role_assignments")
          .select("role,club_id,partner_id")
          .eq("user_id", prof.id)
          .is("revoked_at", null)
      : { data: [] };
    const roleList = (roles ?? []).map((r: { role: string }) => r.role).join(", ") || "(ninguno)";
    console.log(`| ${a.label} · ${a.email} | ${roleList} | ${a.path} |`);
  }
  console.log("\nCierra sesión y vuelve a entrar (o abre la URL del rol) para refrescar cookies.");
}

main().catch((e) => {
  console.error("✗ seed QA roles:", e);
  process.exit(1);
});
