/**
 * Lista cuentas demo/E2E y roles activos (auditoría pre-prod).
 *
 *   npx tsx --env-file=.env.local scripts/audit-demo-accounts.ts
 *
 * No borra nada — solo reporta. Para limpiar demo: scripts/seed.ts --reset
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as any;

function isDemoEmail(email: string): boolean {
  return (
    email.endsWith("@matchpoint.demo") ||
    email.endsWith("@matchpoint.test") ||
    /^e2e-/i.test(email)
  );
}

async function main() {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const demoUsers = (list?.users ?? []).filter((u: { email?: string }) =>
    isDemoEmail(u.email ?? ""),
  );

  console.log(`Cuentas demo/E2E: ${demoUsers.length}\n`);

  for (const u of demoUsers) {
    const userId = u.id as string;
    const email = u.email as string;
    const { data: roles } = await sb
      .from("role_assignments")
      .select("role,club_id,partner_id,revoked_at")
      .eq("user_id", userId)
      .is("revoked_at", null);

    const activeRoles = (roles ?? []).map(
      (r: { role: string; club_id: string | null; partner_id: string | null }) =>
        [r.role, r.club_id ? `club:${r.club_id.slice(0, 8)}` : null, r.partner_id ? `partner:${r.partner_id.slice(0, 8)}` : null]
          .filter(Boolean)
          .join(" "),
    );

    console.log(`  ${email}`);
    if (activeRoles.length) {
      console.log(`    roles: ${activeRoles.join(" | ")}`);
    } else {
      console.log("    roles: (ninguno activo)");
    }
  }

  if (demoUsers.length === 0) {
    console.log("Nada que reportar.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
