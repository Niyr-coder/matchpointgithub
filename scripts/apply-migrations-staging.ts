// Applies supabase/migrations/*.sql in order against STAGING_DATABASE_URL.
// Idempotent: tracks applied files in _matchpoint_migrations so re-runs skip.
// One transaction per file so a single bad migration rolls back cleanly.
//
//   npx tsx --env-file=.env.local scripts/apply-migrations-staging.ts

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const connectionString = process.env.STAGING_DATABASE_URL;
if (!connectionString) {
  console.error("Missing STAGING_DATABASE_URL");
  process.exit(1);
}

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

console.log(`Found ${files.length} migration files in ${MIGRATIONS_DIR}`);

// Supabase Postgres requires TLS; certs are managed by Supabase but the
// driver default rejects self-signed/intermediate chains in some node builds.
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Connected.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS _matchpoint_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  let applied = 0;
  let skipped = 0;
  for (const filename of files) {
    const { rowCount } = await client.query(
      "SELECT 1 FROM _matchpoint_migrations WHERE filename = $1",
      [filename],
    );
    if (rowCount) {
      skipped++;
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
    // Postgres forbids using a newly-added enum value inside the same
    // transaction that ran ALTER TYPE ... ADD VALUE. For files that do both,
    // strip the ADD VALUE statements out and run each in its own query so
    // they implicitly commit before the rest references the new label.
    const enumAdds = extractEnumAdds(sql);
    const hasEnumAdds = enumAdds.statements.length > 0;
    process.stdout.write(
      `APPLY ${filename}${hasEnumAdds ? " (split enum-adds)" : ""}... `,
    );
    try {
      for (const stmt of enumAdds.statements) {
        await client.query(stmt);
      }
      const remaining = enumAdds.remaining;
      await client.query("BEGIN");
      if (remaining.trim()) await client.query(remaining);
      await client.query(
        "INSERT INTO _matchpoint_migrations(filename) VALUES ($1)",
        [filename],
      );
      await client.query("COMMIT");
      console.log("OK");
      applied++;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\nFAILED at ${filename}:\n${msg}`);
      process.exit(1);
    }
  }

  const tablesRes = await client.query(
    "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'",
  );
  console.log(
    `\nDone. applied=${applied} skipped=${skipped} total=${files.length} public_tables=${tablesRes.rows[0].n}`,
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Strip out `ALTER TYPE ... ADD VALUE [IF NOT EXISTS] '<label>';` statements so
// they can be executed individually (each commits implicitly), and return the
// remaining SQL. Match is anchored on each line of the file since these always
// appear as their own single-line statements in this repo's migrations.
function extractEnumAdds(sql: string): {
  statements: string[];
  remaining: string;
} {
  const re = /^[ \t]*alter\s+type\s+[\w".]+\s+add\s+value\b[^;]*;[ \t]*$/gim;
  const statements = (sql.match(re) ?? []).map((s) => s.trim());
  const remaining = sql.replace(re, "");
  return { statements, remaining };
}
