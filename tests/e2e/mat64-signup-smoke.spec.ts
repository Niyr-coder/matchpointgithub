// MAT-64 — acceptance #1 + #3 verification.
//
// Drives the real AuthModal flow against prod (matchpointgithub.vercel.app):
//   1) Open the landing, click "Crear cuenta", fill the signup form, submit.
//   2) Confirm we navigate off the landing into an authenticated route (the
//      brand-new user lands on /onboarding?next=/dashboard/user by design;
//      see src/server/actions/auth.ts::buildPostAuthRedirect).
//   3) Mark the profile as onboarded via service-role so the subsequent
//      signin redirect resolves to /dashboard/user (literal acceptance #3).
//   4) Sign out via API, reopen "Iniciar sesión", sign in with the same
//      creds, confirm we land at /dashboard/user.
//   5) Clean up the test user with admin.auth.admin.deleteUser.
//
// Bypasses the Supabase email-confirmation step that MAT-65 unblocked
// (mailer_autoconfirm = true). When Resend domain is verified and that flag
// goes back to false, this smoke still works because we never click any
// confirmation link.
//
// Run:
//   MATCHPOINT_E2E_BASE_URL=https://matchpointgithub.vercel.app \
//   MATCHPOINT_E2E_REUSE_SERVER=1 \
//   npx playwright test tests/e2e/mat64-signup-smoke.spec.ts --project=chromium

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dismissCookieConsent } from "./helpers/cookie-consent";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ts = Date.now();
const email = `mat64.smoke.${ts}@gmail.com`;
const password = "MatPoint64!aQ";
const username = `mat64_${ts.toString(36).slice(-6)}`;
const displayName = "MAT64 Smoke";

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("signup + signin via UI lands authenticated user at /dashboard/user", async ({ page }) => {
  let createdUserId: string | null = null;

  try {
    // 1. Landing → open AuthModal in signup mode.
    await page.goto("/");
    await dismissCookieConsent(page);
    await page.getByRole("button", { name: /Crear cuenta/i }).first().click();
    await expect(page.getByRole("dialog", { name: /Crea tu cuenta/i })).toBeVisible();

    // 2. Fill signup form (mirrors AuthModal field names).
    await page.locator('input[name="displayName"]').fill(displayName);
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("checkbox", { name: /Acepto los Términos/i }).check();
    await page.getByRole("button", { name: /Crear cuenta gratis/i }).click();

    // 3. Accept either /onboarding (correct for new user) or /dashboard/user
    //    (acceptable if onboarding state is bypassed). The negative case we
    //    need to rule out is staying on /, which is what Bug A produced.
    await page.waitForURL((u) => {
      const p = u.pathname;
      return p.startsWith("/onboarding") || p.startsWith("/dashboard");
    }, { timeout: 25_000 });
    const postSignupPath = new URL(page.url()).pathname;
    expect(postSignupPath).toMatch(/^\/(onboarding|dashboard)/);

    // Capture user id via the profile row that tg_handle_new_auth_user
    // inserts on signup. admin.listUsers() is paginated and can't filter by
    // email, but `profiles.username` is unique and seeded by our trigger.
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();
    if (pErr || !profile) {
      throw new Error(
        `profile lookup after signup failed for username=${username}: ${pErr?.message ?? "no row"}`,
      );
    }
    createdUserId = profile.id as string;

    // 4. Force onboarded so signIn redirects straight to /dashboard/user
    //    (acceptance #3 literal). Without this the user hits /onboarding,
    //    which is the *correct* product behaviour for a fresh signup but
    //    skips the dashboard URL the ticket asks for.
    const onboardedAt = new Date().toISOString();
    const { error: upErr } = await admin
      .from("profiles")
      .update({ onboarded_at: onboardedAt } as never)
      .eq("id", createdUserId);
    if (upErr) throw new Error(`onboarded_at update failed: ${upErr.message}`);

    // 5. Sign out via signOutAndRedirect server action surface
    //    (POST /api/v1/auth/sign-out clears the cookie session).
    await page.request.post("/api/v1/auth/sign-out");
    await page.context().clearCookies();

    // 6. AuthModal en modo signin (mismo flujo que otros E2E).
    await page.goto("/?auth=signin&next=%2Fdashboard%2Fuser");
    await dismissCookieConsent(page);
    await expect(page.getByRole("dialog", { name: /Bienvenido/i })).toBeVisible();
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /^Ingresar$/i }).click();

    // 7. Literal acceptance #3: signin → /dashboard/user (or any /dashboard route).
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 25_000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/dashboard\/user/);

    await page.screenshot({
      path: "tests/e2e/.artifacts/mat64-signup-smoke-dashboard.png",
      fullPage: true,
    });
  } finally {
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId);
    }
  }
});
