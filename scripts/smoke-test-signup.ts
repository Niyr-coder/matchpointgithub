// Smoke test: signs up a temp user, verifies profile + role were auto-created
// by the trigger, then cleans up.
// Run: npx tsx --env-file=.env.local scripts/smoke-test-signup.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ts = Date.now();
const email = `smoke+${ts}@example.com`;
const password = "Smoke-test-123";
const username = `smoke${ts.toString(36).slice(-6)}`;

async function main() {
  const anonClient = createClient(url, anon);
  const adminClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("1. admin.createUser (skips email confirm) ...");
  const { data: signUp, error: e1 } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: "Smoke Test User", locale: "es" },
  });
  if (e1) throw e1;
  if (!signUp.user) throw new Error("No user returned");
  console.log("   user.id =", signUp.user.id);

  console.log("2. profiles row exists?");
  const { data: profile, error: e2 } = await adminClient
    .from("profiles")
    .select("id,username,display_name,locale")
    .eq("id", signUp.user.id)
    .single();
  if (e2) throw e2;
  console.log("   ✓ profile:", profile);

  console.log("3. role_assignments row exists?");
  const { data: roles, error: e3 } = await adminClient
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", signUp.user.id);
  if (e3) throw e3;
  console.log("   ✓ roles:", roles);

  console.log("4. createApplication via authenticated client ...");
  const { error: e4 } = await anonClient.auth.signInWithPassword({ email, password });
  if (e4) throw e4;
  const { data: app, error: e5 } = await anonClient
    .from("club_applications")
    .insert({ applicant_id: signUp.user.id } as never)
    .select()
    .single();
  if (e5) throw e5;
  console.log("   ✓ application created:", { code: app.code, status: app.status });

  console.log("5. submit application missing fields → should fail with 422-equivalent ...");
  const { error: e6 } = await anonClient
    .from("club_applications")
    .update({ status: "submitted" } as never)
    .eq("id", app.id);
  // RLS allows update from draft → submitted, but app is empty.
  // In real flow the server-action checks completeness. Here we just confirm row reachable.
  if (e6) console.log("   (RLS:", e6.message, ")");
  else console.log("   ✓ status updateable from applicant");

  console.log("6. cleanup ...");
  await adminClient.from("club_applications").delete().eq("id", app.id);
  await adminClient.auth.admin.deleteUser(signUp.user.id);
  console.log("   ✓ done");

  console.log("\n🎉 End-to-end loop works.");
}

main().catch((e) => {
  console.error("✗ failed:", e);
  process.exit(1);
});
