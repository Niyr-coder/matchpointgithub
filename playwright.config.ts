// Playwright config para MAT-8 — verificación E2E del CRUD de canchas
// implementado en MAT-6 (commits 7603fa5 + ee49cd0).
//
// Pre-requisitos:
//   - `.env.local` con NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
//     + SUPABASE_SERVICE_ROLE_KEY apuntando a una instancia con migraciones
//     001..0XX aplicadas. La service role se usa para el seed E2E
//     (owner + club + canchas) y para los dumps SQL de verificación.
//   - Dev server arranca solo (`webServer` abajo) o `BASE_URL` apunta a uno ya
//     corriendo (`http://localhost:3000` por default).
//
// Ejecutar:
//   npm run test:e2e:install   # primera vez: descarga chromium
//   npm run test:e2e

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.MATCHPOINT_E2E_BASE_URL ?? "http://localhost:3000";
const REUSE_SERVER = process.env.MATCHPOINT_E2E_REUSE_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e/.artifacts/results",
  fullyParallel: false, // los tres flujos comparten el mismo club seed
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "./tests/e2e/.artifacts/html-report" }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: REUSE_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
