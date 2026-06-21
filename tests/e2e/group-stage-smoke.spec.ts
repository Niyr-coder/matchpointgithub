/**
 * Smoke E2E — panel de fase de grupos en torneo partner (groups_to_knockout).
 *
 *   MATCHPOINT_E2E_REUSE_SERVER=1 npm run test:e2e -- tests/e2e/group-stage-smoke.spec.ts
 */
import { test, expect } from "@playwright/test";
import { signInWithCredentials } from "./helpers/auth-credentials";
import { dismissCookieConsent } from "./helpers/cookie-consent";
import { E2E_DEMO_PASSWORD, E2E_PARTNER_EMAIL } from "./helpers/env";
import { ensureGroupStageDemo } from "./helpers/ensure-group-stage-demo";

test.describe.configure({ mode: "serial" });

let tournamentId: string;

test.beforeAll(async () => {
  const demo = await ensureGroupStageDemo();
  tournamentId = demo.tournamentId;
}, { timeout: 120_000 });

test("partner ve panel Fase de grupos en torneo groups_to_knockout", async ({ page }) => {
  const path = `/dashboard/partner/torneo/${tournamentId}`;
  await signInWithCredentials(page, E2E_PARTNER_EMAIL, E2E_DEMO_PASSWORD, path);
  await dismissCookieConsent(page);

  await expect(page.getByText("Fase de grupos").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("tab", { name: /Open Singles E2E/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sortear grupos/i })).toBeVisible();
  await expect(page.getByText(/Pendiente sorteo/i).first()).toBeVisible();
});
