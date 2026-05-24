// MAT-13 — Smoke end-to-end de la cola de aprobación MATCHPOINT+
// contra prod (proyecto Supabase piylgplwwwmuqclqsjxt, deploy commit 2993522).
//
// Board permission (Vicente, MAT-4 comment 29c259c4): we MAY provision
// synthetic admin + users + transactions + subscriptions in prod, exercise the
// admin UI, and verify DB writes. Mandatory cleanup at the end.
//
// Cubre el DoD de MAT-4:
//   1. Provisionar admin sintético + 2 jugadores + 2 transactions con proof_url
//      + 2 player_subscriptions pending.
//   2. Login admin → /dashboard/admin/admin-plans → tab "Cola de aprobación"
//      (default cuando hay pendientes).
//   3. Click "Aprobar" en row 1 → confirm → verify player_subscriptions.status=
//      'active', profiles.plan_expires_at extendido, fn_admin_audit_log entry.
//   4. Click "Ver" en row 2 → drawer → "Rechazar" → reason ≥10 chars →
//      verify status='rejected', DM plan_subscription_rejected, audit log.
//   5. Cleanup todas las filas sintéticas. Prod queda como estaba.
//
// Artefactos en `tests/e2e/.artifacts/mat13-*` para postmortem.

import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./helpers/supabase";
import { getRequiredEnv } from "./helpers/env";
import { writeArtifact } from "./helpers/setup";

const RUN_STAMP = Date.now().toString(36);
const ADMIN_EMAIL = `mat13-admin-${RUN_STAMP}@matchpoint.demo`;
const USER1_EMAIL = `mat13-user1-${RUN_STAMP}@matchpoint.demo`;
const USER2_EMAIL = `mat13-user2-${RUN_STAMP}@matchpoint.demo`;
const PASSWORD = "MatchPoint-mat13-smoke-2026";
const PROOF_PATH = `mat13-${RUN_STAMP}/proof.txt`;
const REJECT_REASON = "Smoke MAT-13: comprobante de prueba rechazado";

type ProvisionedIds = {
  adminId: string;
  user1Id: string;
  user2Id: string;
  tx1Id: string;
  tx2Id: string;
  sub1Id: string;
  sub2Id: string;
};

async function createAuthUser(
  sb: SupabaseClient,
  opts: { email: string; password: string; displayName: string },
): Promise<string> {
  // auth.admin.listUsers is unreliable on this project (see crud-canchas
  // helper); skip lookup, just create, fall back to signInWithPassword on
  // "already" collision.
  const sbAdmin = sb as unknown as {
    auth: {
      admin: {
        createUser: (o: object) => Promise<{
          data: { user: { id: string } | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const created = await sbAdmin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: {
      display_name: opts.displayName,
      locale: "es",
    },
  });
  if (created.data?.user) return created.data.user.id;
  if (!created.error?.message?.includes("already")) {
    throw new Error(`createUser(${opts.email}) failed: ${created.error?.message ?? "no user"}`);
  }
  const env = getRequiredEnv();
  const anon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signin = await anon.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  });
  if (signin.error || !signin.data?.user) {
    throw new Error(
      `signInWithPassword(${opts.email}) failed: ${signin.error?.message ?? "no user"}`,
    );
  }
  return signin.data.user.id;
}

async function provisionAll(sb: SupabaseClient): Promise<ProvisionedIds> {
  // ── 1. Admin user + profile + role_assignment ────────────────────────
  const adminId = await createAuthUser(sb, {
    email: ADMIN_EMAIL,
    password: PASSWORD,
    displayName: "MAT-13 Admin Smoke",
  });
  await sb.from("profiles").upsert(
    {
      id: adminId,
      username: `mat13admin${RUN_STAMP}`,
      display_name: "MAT-13 Admin Smoke",
      country: "EC",
      onboarded_at: new Date().toISOString(),
    } as never,
    { onConflict: "id" },
  );
  // role_assignments unique key includes (user_id, role, club_id, partner_id)
  // — admin grant has both club_id and partner_id null.
  await sb.from("role_assignments").upsert(
    {
      user_id: adminId,
      role: "admin",
      club_id: null,
      partner_id: null,
      granted_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id,role,club_id,partner_id", ignoreDuplicates: true },
  );

  // ── 2. Player 1 (approve target) ─────────────────────────────────────
  const user1Id = await createAuthUser(sb, {
    email: USER1_EMAIL,
    password: PASSWORD,
    displayName: "MAT-13 Player One",
  });
  await sb.from("profiles").upsert(
    {
      id: user1Id,
      username: `mat13user1${RUN_STAMP}`,
      display_name: "MAT-13 Player One",
      country: "EC",
      onboarded_at: new Date().toISOString(),
    } as never,
    { onConflict: "id" },
  );

  // ── 3. Player 2 (reject target) ──────────────────────────────────────
  const user2Id = await createAuthUser(sb, {
    email: USER2_EMAIL,
    password: PASSWORD,
    displayName: "MAT-13 Player Two",
  });
  await sb.from("profiles").upsert(
    {
      id: user2Id,
      username: `mat13user2${RUN_STAMP}`,
      display_name: "MAT-13 Player Two",
      country: "EC",
      onboarded_at: new Date().toISOString(),
    } as never,
    { onConflict: "id" },
  );

  // ── 4. Transactions con proof_submitted ──────────────────────────────
  const insertTx = async (userId: string) => {
    const ins = await sb
      .from("transactions")
      .insert({
        club_id: null,
        kind: "plan",
        ref_id: null,
        customer_user_id: userId,
        amount_cents: 500,
        currency: "USD",
        method: "transfer",
        status: "proof_submitted",
        proof_url: PROOF_PATH,
        proof_submitted_at: new Date().toISOString(),
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      throw new Error(`transactions insert failed: ${ins.error?.message ?? "no row"}`);
    }
    return ins.data.id as string;
  };
  const tx1Id = await insertTx(user1Id);
  const tx2Id = await insertTx(user2Id);

  // ── 5. player_subscriptions pending ──────────────────────────────────
  const insertSub = async (userId: string, txId: string) => {
    const ins = await sb
      .from("player_subscriptions")
      .insert({
        user_id: userId,
        tier: "premium",
        status: "pending",
        duration_months: 1,
        transaction_id: txId,
      } as never)
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      throw new Error(`player_subscriptions insert failed: ${ins.error?.message ?? "no row"}`);
    }
    return ins.data.id as string;
  };
  const sub1Id = await insertSub(user1Id, tx1Id);
  const sub2Id = await insertSub(user2Id, tx2Id);

  return { adminId, user1Id, user2Id, tx1Id, tx2Id, sub1Id, sub2Id };
}

async function cleanupAll(sb: SupabaseClient, ids: ProvisionedIds | null) {
  if (!ids) return;
  // Order matters for FKs.
  // 1. system messages: find conversations between system user and our users,
  //    delete messages, conversation_members, conversations.
  const convsByUser = await sb
    .from("conversation_members")
    .select("conversation_id")
    .in("user_id", [ids.user1Id, ids.user2Id]);
  const convIds = Array.from(
    new Set((convsByUser.data ?? []).map((r: { conversation_id: string }) => r.conversation_id)),
  );
  if (convIds.length) {
    await sb.from("messages").delete().in("conversation_id", convIds);
    await sb.from("conversation_members").delete().in("conversation_id", convIds);
    await sb.from("conversations").delete().in("id", convIds);
  }
  // 2. player_subscriptions
  await sb.from("player_subscriptions").delete().in("id", [ids.sub1Id, ids.sub2Id]);
  // 3. transactions
  await sb.from("transactions").delete().in("id", [ids.tx1Id, ids.tx2Id]);
  // 4. audit_log: tg_audit + fn_admin_audit_log entries for these subs/profiles.
  await sb
    .from("audit_log")
    .delete()
    .in("entity_id", [ids.sub1Id, ids.sub2Id, ids.user1Id, ids.user2Id, ids.tx1Id, ids.tx2Id]);
  // 5. role_assignments
  await sb.from("role_assignments").delete().eq("user_id", ids.adminId);
  // 6. profiles
  await sb.from("profiles").delete().in("id", [ids.adminId, ids.user1Id, ids.user2Id]);
  // 7. auth.users — via admin API. Best-effort.
  const sbAdmin = sb as unknown as {
    auth: { admin: { deleteUser: (id: string) => Promise<{ error: { message: string } | null }> } };
  };
  for (const uid of [ids.adminId, ids.user1Id, ids.user2Id]) {
    const r = await sbAdmin.auth.admin.deleteUser(uid);
    if (r.error && !r.error.message.includes("not found")) {
      console.error(`deleteUser(${uid}) failed: ${r.error.message}`);
    }
  }
}

async function signInAsAdmin(page: Page) {
  const next = "/dashboard/admin/admin-plans";
  await page.goto(`/?auth=signin&next=${encodeURIComponent(next)}`);
  await page.getByPlaceholder("tu@email.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 25_000 }),
    page.getByRole("button", { name: /Ingresar/ }).click(),
  ]);
}

test.describe.serial("MAT-13 MP+ approval queue smoke (prod)", () => {
  let ids: ProvisionedIds | null = null;

  test.beforeAll(async () => {
    const sb = getServiceClient();
    ids = await provisionAll(sb);
    // Persist IDs as artifact for postmortem cleanup.
    await writeArtifact(
      `mat13-${RUN_STAMP}-provisioned.json`,
      JSON.stringify(
        {
          stamp: RUN_STAMP,
          adminEmail: ADMIN_EMAIL,
          user1Email: USER1_EMAIL,
          user2Email: USER2_EMAIL,
          ...ids,
        },
        null,
        2,
      ),
    );
  });

  test.afterAll(async () => {
    const sb = getServiceClient();
    await cleanupAll(sb, ids);
  });

  test("approve · row 1 → player_subscriptions active + profile expires_at + audit log", async ({ page }) => {
    if (!ids) throw new Error("ids not provisioned");
    await signInAsAdmin(page);
    await page.waitForURL(/\/dashboard\/admin\/admin-plans/, { timeout: 20_000 });

    // La tab "Cola de aprobación" debería ser default por haber pendientes.
    // Identificamos la fila por el display_name del player 1.
    const row = page.locator("tr", { hasText: "MAT-13 Player One" }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Click Aprobar en la fila.
    await row.getByRole("button", { name: /Aprobar/ }).click();
    // Confirm dialog → "Confirmar y aprobar".
    await page.getByRole("button", { name: /Confirmar y aprobar/i }).click();

    // Esperar a que la fila desaparezca (refresh tras éxito).
    await expect(page.locator("tr", { hasText: "MAT-13 Player One" })).toHaveCount(0, {
      timeout: 20_000,
    });

    // ── Verificación DB ────────────────────────────────────────────────
    const sb = getServiceClient();
    const sub = await sb
      .from("player_subscriptions")
      .select("id,status,starts_at,expires_at,tier,user_id")
      .eq("id", ids.sub1Id)
      .single();
    expect(sub.error, sub.error?.message).toBeNull();
    expect(sub.data?.status).toBe("active");
    expect(sub.data?.starts_at).not.toBeNull();
    expect(sub.data?.expires_at).not.toBeNull();
    expect(sub.data?.tier).toBe("premium");

    const profile = await sb
      .from("profiles")
      .select("plan_tier,plan_expires_at")
      .eq("id", ids.user1Id)
      .single();
    expect(profile.error, profile.error?.message).toBeNull();
    expect(profile.data?.plan_tier).toBe("premium");
    expect(profile.data?.plan_expires_at).not.toBeNull();
    // expires_at debe ser aprox +1 mes desde ahora.
    const expiresMs = new Date(profile.data!.plan_expires_at as string).getTime();
    const inOneMonth = new Date();
    inOneMonth.setMonth(inOneMonth.getMonth() + 1);
    expect(Math.abs(expiresMs - inOneMonth.getTime())).toBeLessThan(2 * 60_000);

    // Audit log entry — el RPC fn_admin_audit_log inserta en audit_log.
    const audit = await sb
      .from("audit_log")
      .select("entity,entity_id,action,diff,created_at")
      .eq("entity_id", ids.sub1Id)
      .eq("action", "plan_subscription.admin_approve")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit.error, audit.error?.message).toBeNull();
    expect(audit.data?.length, "expected at least 1 audit row for approve").toBeGreaterThan(0);

    await writeArtifact(
      `mat13-${RUN_STAMP}-approve-verification.json`,
      JSON.stringify(
        { sub: sub.data, profile: profile.data, audit: audit.data },
        null,
        2,
      ),
    );
  });

  test("reject · row 2 → status rejected + DM plan_subscription_rejected + audit log", async ({ page }) => {
    if (!ids) throw new Error("ids not provisioned");
    await signInAsAdmin(page);
    await page.waitForURL(/\/dashboard\/admin\/admin-plans/, { timeout: 20_000 });

    const row = page.locator("tr", { hasText: "MAT-13 Player Two" }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // El botón Rechazar solo está en el drawer; abrimos con "Ver".
    await row.getByRole("button", { name: /Ver/ }).click();

    // Drawer footer Rechazar.
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: /Rechazar/ }).click();

    // Reject dialog: textarea + Rechazar.
    const textarea = page.locator("textarea");
    await textarea.fill(REJECT_REASON);
    // Click el botón "Rechazar" del reject dialog (no el del drawer).
    // El reject dialog tiene z-index mayor y es el último diálogo abierto.
    await page.getByRole("button", { name: /^Rechazar$/ }).last().click();

    // Esperar a que la fila desaparezca.
    await expect(page.locator("tr", { hasText: "MAT-13 Player Two" })).toHaveCount(0, {
      timeout: 20_000,
    });

    // ── Verificación DB ────────────────────────────────────────────────
    const sb = getServiceClient();
    const sub = await sb
      .from("player_subscriptions")
      .select("id,status,cancelled_reason,user_id")
      .eq("id", ids.sub2Id)
      .single();
    expect(sub.error, sub.error?.message).toBeNull();
    expect(sub.data?.status).toBe("rejected");
    expect(sub.data?.cancelled_reason).toBe(REJECT_REASON);

    const audit = await sb
      .from("audit_log")
      .select("entity,entity_id,action,diff,created_at")
      .eq("entity_id", ids.sub2Id)
      .eq("action", "plan_subscription.admin_reject")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit.error, audit.error?.message).toBeNull();
    expect(audit.data?.length, "expected at least 1 audit row for reject").toBeGreaterThan(0);

    // DM: messages table, kind='system', payload.kind='plan_subscription_rejected',
    // payload.subscriptionId = sub2Id. (fn_send_system_message envuelve el kind
    // semántico dentro de payload.)
    const dm = await sb
      .from("messages")
      .select("id,conversation_id,kind,body,payload,created_at")
      .eq("kind", "system")
      .filter("payload->>kind", "eq", "plan_subscription_rejected")
      .filter("payload->>subscriptionId", "eq", ids.sub2Id)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(dm.error, dm.error?.message).toBeNull();
    expect(dm.data?.length, "expected plan_subscription_rejected DM").toBeGreaterThan(0);

    await writeArtifact(
      `mat13-${RUN_STAMP}-reject-verification.json`,
      JSON.stringify(
        { sub: sub.data, audit: audit.data, dm: dm.data },
        null,
        2,
      ),
    );
  });
});
