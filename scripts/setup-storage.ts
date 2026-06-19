// Creates Storage buckets with size limits matching src/lib/storage/buckets.ts.
// Idempotent: skips if a bucket already exists.
// Run: npx tsx --env-file=.env.local scripts/setup-storage.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const buckets = [
  { id: "avatars", public: true, fileSizeLimit: 2 * 1024 * 1024 },
  { id: "club-covers", public: false, fileSizeLimit: 8 * 1024 * 1024 },
  { id: "club-courts", public: true, fileSizeLimit: 8 * 1024 * 1024 },
  { id: "clubs", public: true, fileSizeLimit: 8 * 1024 * 1024 },
  { id: "resources", public: false, fileSizeLimit: 50 * 1024 * 1024 },
  { id: "tickets-attachments", public: false, fileSizeLimit: 10 * 1024 * 1024 },
  { id: "kyc-docs", public: false, fileSizeLimit: 10 * 1024 * 1024 },
  { id: "payment_proofs", public: false, fileSizeLimit: 8 * 1024 * 1024 },
];

async function main() {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const b of buckets) {
    const { error } = await client.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
    });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      console.error(`✗ ${b.id}: ${error.message}`);
    } else {
      console.log(`✓ ${b.id.padEnd(24)} ${b.public ? "public" : "private"}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
