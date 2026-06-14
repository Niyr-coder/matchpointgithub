/** One-off: otorgar rol admin global. Uso: npx tsx --env-file=.env.local scripts/grant-admin.ts andrews@mp.top */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: npx tsx --env-file=.env.local scripts/grant-admin.ts <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserId(): Promise<string> {
  // Paginar auth admin por si hay muchos usuarios.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers p${page}: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No existe usuario con email ${email}`);
}

async function grantAdmin(userId: string) {
  const { data: revived, error: reviveErr } = await sb
    .from("role_assignments")
    .update({ revoked_at: null, granted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("club_id", null)
    .is("partner_id", null)
    .select("id");
  if (reviveErr) throw new Error(`revive admin: ${reviveErr.message}`);
  if (revived?.length) {
    console.log("✓ Rol admin reactivado");
    return;
  }
  const { error: insErr } = await sb.from("role_assignments").insert({
    user_id: userId,
    role: "admin",
    club_id: null,
    partner_id: null,
    granted_at: new Date().toISOString(),
  });
  if (insErr) throw new Error(`insert admin: ${insErr.message}`);
  console.log("✓ Rol admin insertado");
}

async function main() {
  const userId = await findUserId();
  console.log(`Usuario ${email} → ${userId}`);
  await grantAdmin(userId);
  const { data: roles, error } = await sb
    .from("role_assignments")
    .select("role, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw error;
  console.log("Roles activos:", roles?.map((r) => r.role).join(", ") || "(ninguno)");
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
