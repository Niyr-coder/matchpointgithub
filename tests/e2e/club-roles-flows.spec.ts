import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureSeed } from "./helpers/setup";
import { getRequiredEnv } from "./helpers/env";
import { getServiceClient } from "./helpers/supabase";

type Role = "owner" | "manager" | "employee" | "user";

type Persona = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

const password = "MatchPoint-e2e-2026";

function isoPlusMinutes(minutes: number): string {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 14);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

async function createPersona(role: Role, clubId?: string): Promise<Persona> {
  const admin = getServiceClient() as ReturnType<typeof getServiceClient> & {
    auth: {
      admin: {
        createUser: (o: object) => Promise<{ data: { user: { id: string } } | null; error: { message: string } | null }>;
      };
    };
  };
  const env = getRequiredEnv();
  const stamp = `${role}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `e2e-${stamp}@matchpoint.demo`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username: `e2e${stamp}`.slice(0, 28),
      display_name: `E2E ${role}`,
      locale: "es",
    },
  });
  if (created.error || !created.data?.user) {
    throw new Error(`No se pudo crear ${role}: ${created.error?.message ?? "sin user"}`);
  }
  const id = created.data.user.id;
  await admin.from("profiles").upsert(
    {
      id,
      username: `e2e${stamp}`.slice(0, 28),
      display_name: `E2E ${role}`,
      country: "EC",
      onboarded_at: new Date().toISOString(),
    } as never,
    { onConflict: "id" },
  );
  await admin.from("role_assignments").insert({
    user_id: id,
    role,
    club_id: role === "user" ? null : clubId,
    partner_id: null,
    granted_at: new Date().toISOString(),
  } as never);

  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signin = await client.auth.signInWithPassword({ email, password });
  if (signin.error) throw new Error(`signin ${role}: ${signin.error.message}`);
  return { id, email, password, client };
}

async function cleanupUsers(userIds: string[]) {
  const admin = getServiceClient() as ReturnType<typeof getServiceClient> & {
    auth: { admin: { deleteUser: (id: string) => Promise<{ error: { message: string } | null }> } };
  };
  for (const id of userIds) {
    await admin.from("role_assignments").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

test.describe.serial("roles de club · flujos E2E por rol", () => {
  test("owner crea cancha, tarifa, asigna manager y aprueba membresía", async () => {
    const seed = await ensureSeed();
    const admin = getServiceClient();
    const manager = await createPersona("user");
    const member = await createPersona("user");
    const env = getRequiredEnv();
    const ownerClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ownerSignin = await ownerClient.auth.signInWithPassword({
      email: process.env.E2E_OWNER_EMAIL ?? "e2e-owner@matchpoint.demo",
      password: process.env.E2E_OWNER_PASSWORD ?? password,
    });
    expect(ownerSignin.error, ownerSignin.error?.message).toBeNull();

    try {
      const code = `ROLE-${Date.now().toString().slice(-6)}`;
      const court = await ownerClient
        .from("courts")
        .insert({
          club_id: seed.clubId,
          code,
          sport: "pickleball",
          surface: "acrylic_outdoor",
          indoor: false,
          lights: true,
          ordinal: 90,
          active: true,
        } as never)
        .select("id,code")
        .single();
      expect(court.error, court.error?.message).toBeNull();
      const courtId = court.data!.id as string;

      const pricing = await ownerClient.from("court_pricing").insert({
        court_id: courtId,
        day_of_week: null,
        starts_at: "07:00:00",
        ends_at: "11:00:00",
        price_cents: 2400,
        duration_minutes: 60,
        currency: "USD",
        active: true,
      } as never);
      expect(pricing.error, pricing.error?.message).toBeNull();

      const staffGrant = await admin.from("role_assignments").insert({
        user_id: manager.id,
        role: "manager",
        club_id: seed.clubId,
        partner_id: null,
        granted_at: new Date().toISOString(),
      } as never);
      expect(staffGrant.error, staffGrant.error?.message).toBeNull();

      const tier = await ownerClient
        .from("club_membership_tiers")
        .insert({
          club_id: seed.clubId,
          name: "E2E VIP",
          price_cents: 5000,
          duration_months: 1,
          discount_pct: 10,
          benefits: ["Reserva preferente"],
          sort_order: 99,
          is_active: true,
        } as never)
        .select("id")
        .single();
      expect(tier.error, tier.error?.message).toBeNull();
      const membership = await admin
        .from("club_memberships")
        .insert({
          club_id: seed.clubId,
          tier_id: tier.data!.id,
          user_id: member.id,
          status: "pending",
        } as never)
        .select("id")
        .single();
      expect(membership.error, membership.error?.message).toBeNull();

      const approved = await ownerClient
        .from("club_memberships")
        .update({ status: "active", starts_at: new Date().toISOString() } as never)
        .eq("id", membership.data!.id)
        .select("status")
        .single();
      expect(approved.error, approved.error?.message).toBeNull();
      expect(approved.data?.status).toBe("active");
    } finally {
      await admin.from("club_memberships").delete().eq("user_id", member.id).eq("club_id", seed.clubId);
      await cleanupUsers([manager.id, member.id]);
      await admin.from("club_membership_tiers").delete().eq("name", "E2E VIP").eq("club_id", seed.clubId);
      await admin.from("courts").delete().eq("club_id", seed.clubId).like("code", "ROLE-%");
    }
  });

  test("manager reserva, cancela, crea walk-in y ve reportes base", async () => {
    const seed = await ensureSeed();
    const manager = await createPersona("manager", seed.clubId);
    const admin = getServiceClient();
    try {
      const court = await admin
        .from("courts")
        .insert({
          club_id: seed.clubId,
          code: `MGR-${Date.now().toString().slice(-6)}`,
          sport: "pickleball",
          surface: "acrylic_outdoor",
          indoor: false,
          lights: true,
          ordinal: 91,
          active: true,
        } as never)
        .select("id")
        .single();
      expect(court.error, court.error?.message).toBeNull();

      const reservation = await manager.client
        .from("reservations")
        .insert({
          club_id: seed.clubId,
          court_id: court.data!.id,
          during: `[${isoPlusMinutes(120)},${isoPlusMinutes(180)})`,
          sport: "pickleball",
          visibility: "private",
          max_players: 4,
          organizer_id: manager.id,
          source: "app",
          status: "booked",
        } as never)
        .select("id,status")
        .single();
      expect(reservation.error, reservation.error?.message).toBeNull();

      const cancelled = await manager.client
        .from("reservations")
        .update({ status: "cancelled", cancellation_reason: "E2E", cancelled_at: new Date().toISOString() } as never)
        .eq("id", reservation.data!.id)
        .select("status")
        .single();
      expect(cancelled.error, cancelled.error?.message).toBeNull();
      expect(cancelled.data?.status).toBe("cancelled");

      const walkin = await manager.client.from("walkins").insert({
        club_id: seed.clubId,
        court_id: court.data!.id,
        customer_name: "Walk-in E2E",
        party_size: 2,
        duration_minutes: 60,
        attended_by: manager.id,
      } as never);
      expect(walkin.error, walkin.error?.message).toBeNull();

      const reportRead = await manager.client
        .from("transactions")
        .select("id,status")
        .eq("club_id", seed.clubId)
        .limit(1);
      expect(reportRead.error, reportRead.error?.message).toBeNull();
    } finally {
      await admin.from("walkins").delete().eq("attended_by", manager.id);
      await admin.from("reservations").delete().eq("organizer_id", manager.id);
      await cleanupUsers([manager.id]);
      await admin.from("courts").delete().eq("club_id", seed.clubId).like("code", "MGR-%");
    }
  });

  test("employee hace check-in, abre/cierra caja, vende en shop y crea ticket", async () => {
    const seed = await ensureSeed();
    const employee = await createPersona("employee", seed.clubId);
    const player = await createPersona("user");
    const admin = getServiceClient();
    try {
      const reservation = await admin
        .from("reservations")
        .insert({
          club_id: seed.clubId,
          court_id: seed.initialCourtId,
          during: `[${isoPlusMinutes(240)},${isoPlusMinutes(300)})`,
          sport: "pickleball",
          visibility: "private",
          max_players: 4,
          organizer_id: player.id,
          source: "app",
          status: "booked",
        } as never)
        .select("id")
        .single();
      expect(reservation.error, reservation.error?.message).toBeNull();

      const checkin = await employee.client.from("check_ins").insert({
        reservation_id: reservation.data!.id,
        user_id: player.id,
        club_id: seed.clubId,
        method: "manual",
        scanned_by: employee.id,
      } as never);
      expect(checkin.error, checkin.error?.message).toBeNull();

      const cash = await employee.client
        .from("cash_sessions")
        .insert({
          club_id: seed.clubId,
          opened_by: employee.id,
          opening_float_cents: 2000,
          status: "open",
        } as never)
        .select("id")
        .single();
      expect(cash.error, cash.error?.message).toBeNull();

      const product = await admin
        .from("products")
        .insert({
          club_id: seed.clubId,
          name: `Agua E2E ${Date.now()}`,
          sku: `E2E-${Date.now()}`,
          price_cents: 150,
          currency: "USD",
          stock: 5,
          low_stock_threshold: 1,
          active: true,
        } as never)
        .select("id")
        .single();
      expect(product.error, product.error?.message).toBeNull();

      const sale = await employee.client.rpc("fn_create_sale", {
        p_club_id: seed.clubId,
        p_user_id: employee.id,
        p_customer_user_id: null,
        p_customer_name: "Cliente shop E2E",
        p_method: "cash",
        p_items: [{ product_id: product.data!.id, qty: 1 }],
      } as never);
      expect(sale.error, sale.error?.message).toBeNull();

      const closed = await employee.client
        .from("cash_sessions")
        .update({ status: "closed", closed_by: employee.id, closed_at: new Date().toISOString(), closing_counted_cents: 2150 } as never)
        .eq("id", cash.data!.id)
        .select("status")
        .single();
      expect(closed.error, closed.error?.message).toBeNull();
      expect(closed.data?.status).toBe("closed");

      const ticket = await employee.client.from("tickets").insert({
        club_id: seed.clubId,
        opener_id: employee.id,
        subject: "Ticket E2E employee",
        category: "maintenance",
        severity: "medium",
        status: "open",
      } as never);
      expect(ticket.error, ticket.error?.message).toBeNull();
    } finally {
      const saleRows = await admin
        .from("sales")
        .select("id,transaction_id")
        .eq("sold_by", employee.id);
      for (const row of saleRows.data ?? []) {
        await admin.from("sale_items").delete().eq("sale_id", row.id);
        await admin.from("sales").delete().eq("id", row.id);
        if (row.transaction_id) {
          await admin.from("transactions").delete().eq("id", row.transaction_id);
        }
      }
      await admin.from("inventory_movements").delete().eq("created_by", employee.id);
      await admin.from("cash_sessions").delete().eq("opened_by", employee.id);
      await admin.from("check_ins").delete().eq("scanned_by", employee.id);
      await admin.from("tickets").delete().eq("opener_id", employee.id);
      await admin.from("reservations").delete().eq("organizer_id", player.id);
      await cleanupUsers([employee.id, player.id]);
      await admin.from("products").delete().eq("club_id", seed.clubId).ilike("sku", "E2E-%");
    }
  });
});
