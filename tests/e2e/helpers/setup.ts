// Setup mínimo para verificación E2E del CRUD canchas (MAT-8).
// Garantiza idempotentemente:
//   1. Usuario `e2e-owner@matchpoint.demo` (rol `owner`) — password de prueba.
//   2. Club E2E "Club E2E Pickleball" con slug determinístico.
//   3. Al menos una cancha activa con 1 banda de tarifa (para los flujos de
//      editar y bloquear). El flujo de crear cancha agrega *otra* cancha
//      durante el test.
//
// Bypasea RLS vía service role. Limpieza: el dominio @matchpoint.demo del
// usuario es la marca de "demo", que el seed reset borra.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  E2E_CLUB_NAME,
  E2E_CLUB_SLUG,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
} from "./env";
import { getServiceClient } from "./supabase";

export type SeedState = {
  ownerId: string;
  clubId: string;
  initialCourtId: string;
  initialCourtCode: string;
};

const ARTIFACT_DIR = path.join(process.cwd(), "tests", "e2e", ".artifacts");

export async function ensureArtifactDir(): Promise<string> {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  return ARTIFACT_DIR;
}

export async function writeArtifact(name: string, content: string): Promise<string> {
  const dir = await ensureArtifactDir();
  const target = path.join(dir, name);
  await fs.writeFile(target, content, "utf8");
  return target;
}

export async function ensureSeed(): Promise<SeedState> {
  const sb = getServiceClient() as ReturnType<typeof getServiceClient> & {
    auth: { admin: { listUsers: (o: { perPage: number }) => Promise<{ data: { users: Array<{ id: string; email: string | null }> } }>; createUser: (o: object) => Promise<{ data: { user: { id: string } } | null; error: { message: string } | null }> } };
  };

  // 1) Asegurar usuario owner.
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  let ownerId = list.users.find((u) => u.email === E2E_OWNER_EMAIL)?.id;
  if (!ownerId) {
    const { data, error } = await sb.auth.admin.createUser({
      email: E2E_OWNER_EMAIL,
      password: E2E_OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: "e2eowner",
        display_name: "E2E Owner",
        locale: "es",
      },
    });
    if (error || !data?.user) {
      throw new Error(`createUser(e2e-owner) falló: ${error?.message ?? "sin user"}`);
    }
    ownerId = data.user.id;
  }
  // Asegurar profile mínimo.
  await sb.from("profiles").upsert(
    { id: ownerId, username: "e2eowner", display_name: "E2E Owner", country: "EC" } as never,
    { onConflict: "id" },
  );

  // 2) Asegurar club E2E.
  let clubId: string | undefined;
  const existing = await sb.from("clubs").select("id").eq("slug", E2E_CLUB_SLUG).maybeSingle();
  if (existing.data?.id) {
    clubId = existing.data.id as string;
  } else {
    const ins = await sb
      .from("clubs")
      .insert(
        {
          slug: E2E_CLUB_SLUG,
          name: E2E_CLUB_NAME,
          description: "Club seed para tests E2E MAT-8",
          country: "EC",
          city: "Quito",
          address: "Av. E2E s/n",
          phone: "+593 99 000 0000",
          email: E2E_OWNER_EMAIL,
          timezone: "America/Guayaquil",
          currency: "USD",
          sports: ["pickleball"],
          status: "active",
          applied_by: ownerId,
          approved_by: ownerId,
          approved_at: new Date().toISOString(),
        } as never,
      )
      .select("id")
      .single();
    if (ins.error || !ins.data) throw new Error(`club insert: ${ins.error?.message}`);
    clubId = ins.data.id as string;
    await sb.from("club_settings").upsert(
      {
        club_id: clubId,
        reservation_window_days: 14,
        cancellation_window_hours: 24,
        default_slot_minutes: 60,
        allow_walkins: true,
        open_hours: { mon: [["06:00", "22:00"]] },
      } as never,
      { onConflict: "club_id" },
    );
  }
  if (!clubId) throw new Error("club id sin resolver");

  // 3) Grant rol owner.
  await sb.from("user_roles").upsert(
    { user_id: ownerId, role: "owner", club_id: clubId, partner_id: null } as never,
    { onConflict: "user_id,role,club_id,partner_id", ignoreDuplicates: true },
  );

  // 4) Asegurar al menos una cancha activa.
  const courts = await sb
    .from("courts")
    .select("id, code, active")
    .eq("club_id", clubId)
    .order("ordinal", { ascending: true });
  let initialCourtId: string | undefined;
  let initialCourtCode: string | undefined;
  const activeCourt = courts.data?.find((c) => c.active);
  if (activeCourt) {
    initialCourtId = activeCourt.id as string;
    initialCourtCode = activeCourt.code as string;
  } else {
    const ins = await sb
      .from("courts")
      .insert(
        {
          club_id: clubId,
          code: "E2E1",
          sport: "pickleball",
          surface: "acrylic_outdoor",
          indoor: false,
          lights: true,
          ordinal: 0,
          active: true,
        } as never,
      )
      .select("id, code")
      .single();
    if (ins.error || !ins.data) throw new Error(`court insert: ${ins.error?.message}`);
    initialCourtId = ins.data.id as string;
    initialCourtCode = ins.data.code as string;
  }

  // 5) Asegurar una banda de tarifa para esa cancha (necesaria para Editar).
  const bands = await sb
    .from("court_pricing")
    .select("id")
    .eq("court_id", initialCourtId);
  if (!bands.data?.length) {
    await sb.from("court_pricing").insert(
      {
        court_id: initialCourtId,
        day_of_week: null,
        starts_at: "08:00:00",
        ends_at: "18:00:00",
        price_cents: 2000,
        duration_minutes: 60,
        currency: "USD",
        active: true,
      } as never,
    );
  }

  return { ownerId, clubId, initialCourtId, initialCourtCode };
}

export async function dumpRows(table: string, filter: { col: string; eq: string }) {
  const sb = getServiceClient();
  const { data, error } = await sb.from(table).select("*").eq(filter.col, filter.eq);
  if (error) throw new Error(`dump ${table}: ${error.message}`);
  return data ?? [];
}
