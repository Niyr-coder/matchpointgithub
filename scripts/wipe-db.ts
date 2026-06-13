// Wipe total de datos (DESTRUCTIVO). Deja el schema intacto; vacía tablas public,
// storage.objects y todos los usuarios de Auth.
//
//   npx tsx --env-file=.env.local scripts/wipe-db.ts --confirm
//
// Requiere SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL.
// Opcional: DATABASE_URL o STAGING_DATABASE_URL para TRUNCATE vía pg.
// Si no hay URL de Postgres, el script solo borra Auth + Storage (correr SQL
// de truncate por separado — ver README en supabase/ o usar MCP/dashboard).

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const CONFIRM = process.argv.includes("--confirm");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pgUrl =
  process.env.DATABASE_URL ??
  process.env.STAGING_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL;

if (!CONFIRM) {
  console.error("Refusing to run without --confirm (wipe total es irreversible).");
  process.exit(1);
}
if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as any;

const TRUNCATE_SQL = `
DO $$
DECLARE
  tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> 'spatial_ref_sys';

  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
`;

async function truncatePublic(pg: Client) {
  console.log("⌫  truncating public.* (except spatial_ref_sys) ...");
  await pg.query(TRUNCATE_SQL);
  console.log("   ✓ public tables cleared");
}

async function emptyStorageBucket(bucketId: string, prefix = ""): Promise<number> {
  let removed = 0;
  const { data, error } = await sb.storage.from(bucketId).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    if (error.message?.includes("not found")) return 0;
    throw new Error(`list ${bucketId}/${prefix}: ${error.message}`);
  }
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      removed += await emptyStorageBucket(bucketId, path);
    } else {
      const { error: rmErr } = await sb.storage.from(bucketId).remove([path]);
      if (rmErr) throw new Error(`remove ${bucketId}/${path}: ${rmErr.message}`);
      removed += 1;
    }
  }
  return removed;
}

async function wipeStorage() {
  console.log("⌫  clearing storage buckets ...");
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  let total = 0;
  for (const b of buckets ?? []) {
    const n = await emptyStorageBucket(b.id);
    total += n;
    console.log(`   ✓ ${b.id}: ${n} object(s)`);
  }
}

async function wipeAuthUsersViaSql(pg: Client) {
  console.log("⌫  deleting auth.users via SQL ...");
  const { rowCount } = await pg.query("DELETE FROM auth.users");
  console.log(`   ✓ removed ${rowCount ?? 0} auth user(s)`);
}

async function wipeAuthUsers() {
  console.log("⌫  deleting auth users ...");
  let deleted = 0;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000, page: 1 });
    if (error) {
      throw new Error(`listUsers: ${error.message}`);
    }
    const users = data?.users ?? [];
    if (!users.length) break;
    for (const u of users) {
      const { error: delErr } = await sb.auth.admin.deleteUser(u.id);
      if (delErr) throw new Error(`deleteUser ${u.email ?? u.id}: ${delErr.message}`);
      deleted += 1;
    }
  }
  console.log(`   ✓ removed ${deleted} auth user(s)`);
}

async function main() {
  console.log("⚠️  WIPE TOTAL — proyecto:", url);

  if (pgUrl) {
    const pg = new Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
    await pg.connect();
    try {
      await truncatePublic(pg);
      await wipeAuthUsersViaSql(pg);
    } finally {
      await pg.end();
    }
  } else {
    console.log("   (no DATABASE_URL — usa Supabase MCP/dashboard para TRUNCATE + DELETE FROM auth.users)");
  }

  if (!pgUrl) {
    try {
      await wipeAuthUsers();
    } catch (e) {
      console.warn("   ⚠ auth admin API falló; borra auth.users por SQL si quedan cuentas:", (e as Error).message);
    }
  }

  await wipeStorage();

  console.log("\n✓ wipe complete");
  console.log("  Siguiente paso sugerido: npm run seed:reset");
}

main().catch((e) => {
  console.error("✗ wipe failed:", e);
  process.exit(1);
});
