"use server";

import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { requireAdminUserId } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";

// Prefix que identifica torneos de testing — permite listarlos y borrarlos en bloque.
const SEED_MARK = "[SEED]";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rndInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function uid6(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ── Datos de muestra ──────────────────────────────────────────────────────────

const NAMES = [
  "Open Quito", "Torneo Relámpago", "Copa Andes", "Challenge Series",
  "Grand Slam Ecuador", "Copa Norte", "Copa Sur", "Torneo Fundadores",
  "Open Masters", "Copa Amateur", "Torneo Invitacional", "Open Universitario",
  "Copa Invierno", "Challenge Elite", "Open Verano", "Copa Mixta",
  "Torneo Navidad", "Open Guayaquil", "Copa Sierra", "Challenge Pro",
];

const FORMATS = [
  "single_elim", "double_elim", "round_robin", "swiss", "groups_to_knockout",
] as const;

const MODALITIES = ["singles", "doubles", "mixto"] as const;

const FEES = [0, 1000, 1500, 2000, 2500, 3000]; // cents USD

const MAX_PARTS = [8, 12, 16, 24, 32];

const CAT_LEVELS = [
  "principiante", "intermedio", "avanzado", "abierto",
] as const;

const CAT_GENDERS = ["M", "F", "mixed"] as const;

// Distribución de estados según offset de días desde hoy
type SeedConfig = {
  status: string;
  daysOffset: number;
  registrationDaysOffset: number;
};

const STATUS_SPREAD: SeedConfig[] = [
  { status: "finished",             daysOffset: -25, registrationDaysOffset: -35 },
  { status: "finished",             daysOffset: -10, registrationDaysOffset: -20 },
  { status: "live",                 daysOffset:  -1, registrationDaysOffset: -10 },
  { status: "live",                 daysOffset:   0, registrationDaysOffset:  -8 },
  { status: "registration_closed",  daysOffset:   4, registrationDaysOffset:  -5 },
  { status: "registration_open",    daysOffset:   8, registrationDaysOffset:  -3 },
  { status: "registration_open",    daysOffset:  12, registrationDaysOffset:  -2 },
  { status: "registration_open",    daysOffset:  18, registrationDaysOffset:  -1 },
  { status: "published",            daysOffset:  25, registrationDaysOffset:   5 },
  { status: "published",            daysOffset:  35, registrationDaysOffset:  10 },
  { status: "draft",                daysOffset:  50, registrationDaysOffset:  20 },
  { status: "draft",                daysOffset:  70, registrationDaysOffset:  35 },
];

// ── adminSeedTournaments ──────────────────────────────────────────────────────

const SeedParamsSchema = z.object({
  count: z.number().int().min(1).max(30).default(12),
});

export async function adminSeedTournaments(
  input: unknown = {},
): Promise<ActionResult<{ created: number }>> {
  return runAction(SeedParamsSchema, input, async ({ count }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // Necesita al menos un partner_org activo para linkear los torneos.
    const { data: partners } = await admin
      .from("partner_orgs")
      .select("id")
      .eq("status", "active")
      .limit(5);

    if (!partners?.length) {
      throw new MpError(
        "SEED.NO_PARTNER",
        "No hay partner orgs activos. Crea al menos uno antes de seedear torneos.",
        400,
      );
    }

    // Club opcional — no bloquea si no hay.
    const { data: clubs } = await admin
      .from("clubs")
      .select("id")
      .eq("status", "active")
      .limit(5);

    const now = new Date();
    const spread = [...STATUS_SPREAD];
    // Si piden más torneos que configs disponibles, repetir spread.
    while (spread.length < count) spread.push(...STATUS_SPREAD);

    let created = 0;
    for (let i = 0; i < count; i++) {
      const cfg = spread[i % spread.length];
      const rawName = pick(NAMES);
      const name = `${SEED_MARK} ${rawName}`;
      const slug = `seed-${rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uid6()}`;
      const format = pick(FORMATS);
      const modality = pick(MODALITIES);
      const partnerId = pick(partners).id;
      const clubId = clubs?.length ? pick(clubs).id : null;
      const entryFeeCents = pick(FEES);
      const maxParticipants = pick(MAX_PARTS);
      const startsAt = addDays(now, cfg.daysOffset);
      const endsAt = addDays(now, cfg.daysOffset + rndInt(1, 2));
      const registrationOpensAt = addDays(now, cfg.registrationDaysOffset);

      const { data: tournament, error: tErr } = await admin
        .from("tournaments")
        .insert({
          partner_id: partnerId,
          club_id: clubId,
          name,
          slug,
          status: cfg.status,
          sport: "pickleball",
          format,
          modality,
          starts_at: startsAt,
          ends_at: endsAt,
          registration_opens_at: registrationOpensAt,
          entry_fee_cents: entryFeeCents,
          currency: "USD",
          payment_policy: entryFeeCents > 0 ? "transfer" : "free",
          max_participants: maxParticipants,
          prize_pool_cents: entryFeeCents > 0 ? entryFeeCents * maxParticipants * rndInt(4, 8) : 0,
          scoring_config: { type: "side_out", points: 11, winBy: 2, bestOf: 3 },
          terms_accepted: true,
        } as never)
        .select("id")
        .single();

      if (tErr || !tournament) continue;

      // Crear 1-2 categorías por torneo
      const catCount = rndInt(1, 2);
      const categories = Array.from({ length: catCount }, (_, ci) => ({
        tournament_id: tournament.id,
        name: `Categoría ${ci + 1} — ${pick(CAT_LEVELS)}`,
        gender: pick(CAT_GENDERS) as string,
        level: pick(CAT_LEVELS) as string,
        max_teams: Math.floor(maxParticipants / catCount),
      }));

      await admin.from("tournament_categories").insert(categories as never);
      created++;
    }

    return { created };
  });
}

// ── adminClearSeedTournaments ─────────────────────────────────────────────────

export async function adminClearSeedTournaments(): Promise<ActionResult<{ deleted: number }>> {
  return runAction(z.object({}), {}, async () => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    const { data: rows, error } = await admin
      .from("tournaments")
      .delete()
      .like("name", `${SEED_MARK}%`)
      .select("id");

    if (error) {
      throw new MpError("SEED.CLEAR_FAILED", error.message, 500);
    }

    return { deleted: rows?.length ?? 0 };
  });
}
