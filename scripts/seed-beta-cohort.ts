/**
 * Habilita flags de beta para clubes piloto (idempotente).
 *
 *   BETA_PILOT_CLUB_SLUGS=club-a,club-b npx tsx --env-file=.env.local scripts/seed-beta-cohort.ts
 *
 * Opcional:
 *   BETA_ENABLE_MEMBERSHIPS=1   → club_memberships_v2 por club
 *   BETA_ENABLE_MARKETING=1     → club_marketing_enabled por club (requiere cron dispatch-broadcasts)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const slugsRaw = process.env.BETA_PILOT_CLUB_SLUGS?.trim();
if (!slugsRaw) {
  console.error("Define BETA_PILOT_CLUB_SLUGS=slug1,slug2");
  process.exit(1);
}

const slugs = slugsRaw.split(",").map((s) => s.trim()).filter(Boolean);
const enableMemberships = process.env.BETA_ENABLE_MEMBERSHIPS === "1";
const enableMarketing = process.env.BETA_ENABLE_MARKETING === "1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as any;

type FlagSpec = { key: string; reason: string };

const BASE_FLAGS: FlagSpec[] = [
  { key: "club_giveaways_enabled", reason: "Beta piloto — sorteos v2" },
];

async function upsertClubFlag(clubId: string, flag: FlagSpec) {
  const { error } = await sb.from("feature_flag_assignments").upsert(
    {
      flag_key: flag.key,
      scope: "club",
      scope_id: clubId,
      enabled: true,
      reason: flag.reason,
    },
    { onConflict: "flag_key,scope,scope_id" },
  );
  if (error) throw new Error(`${flag.key}@${clubId}: ${error.message}`);
}

async function main() {
  console.log(`Clubes piloto (${slugs.length}): ${slugs.join(", ")}`);
  console.log(`  membresías: ${enableMemberships ? "sí" : "no"}`);
  console.log(`  marketing:  ${enableMarketing ? "sí" : "no"}`);

  for (const slug of slugs) {
    const { data: club, error } = await sb
      .from("clubs")
      .select("id,name,slug")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!club) {
      console.warn(`  ⚠ club no encontrado: ${slug}`);
      continue;
    }

    const clubId = club.id as string;
    const flags = [...BASE_FLAGS];
    if (enableMemberships) {
      flags.push({ key: "club_memberships_v2", reason: "Beta piloto — membresías" });
    }
    if (enableMarketing) {
      flags.push({ key: "club_marketing_enabled", reason: "Beta piloto — marketing" });
    }

    for (const flag of flags) {
      await upsertClubFlag(clubId, flag);
    }
    console.log(`  ✓ ${club.name} (${slug}) — ${flags.map((f) => f.key).join(", ")}`);
  }

  console.log("\nListo. Verifica con: npx tsx --env-file=.env.local scripts/check-beta-readiness.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
