/**
 * E2E responsive mobile — dashboards por rol (390×844).
 *
 * Cubre rutas críticas de owner (seed E2E), admin, partner, coach y manager
 * (seed demo `scripts/seed.ts`). Detecta overflow horizontal y chrome móvil.
 *
 * Ejecutar:
 *   MATCHPOINT_E2E_REUSE_SERVER=1 npm run test:e2e -- tests/e2e/roles-mobile-responsive.spec.ts
 *   MATCHPOINT_E2E_REUSE_SERVER=1 npm run test:e2e:mobile
 */
import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { signInWithCredentials } from "./helpers/auth-credentials";
import {
  E2E_ADMIN_EMAIL,
  E2E_COACH_EMAIL,
  E2E_DEMO_PASSWORD,
  E2E_MANAGER_EMAIL,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_PARTNER_EMAIL,
} from "./helpers/env";
import {
  MOBILE_VIEWPORT,
  assertMobileChrome,
  assertNoHorizontalOverflow,
  probeMobileLayout,
} from "./helpers/mobile-layout";
import { ensureSeed } from "./helpers/setup";
import { ensureDemoMobileRoles } from "./helpers/ensure-demo-mobile";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureDemoMobileRoles();
}, { timeout: 120_000 });

type RoleRoute = {
  path: string;
  slug: string;
  heading: RegExp;
  knownOverflow?: boolean;
};

type RoleSuite = {
  id: string;
  email: string;
  password: string;
  loginPath: string;
  routes: RoleRoute[];
  prepare?: () => Promise<void>;
};

const ROLE_SUITES: RoleSuite[] = [
  {
    id: "owner",
    email: E2E_OWNER_EMAIL,
    password: E2E_OWNER_PASSWORD,
    loginPath: "/dashboard/owner",
    prepare: ensureSeed,
    routes: [
      { path: "/dashboard/owner", slug: "home", heading: /Overview|Mi club|Hoy/i },
      { path: "/dashboard/owner/club-canchas", slug: "canchas", heading: /Canchas|Gestión/i },
      { path: "/dashboard/owner/club-staff", slug: "staff", heading: /Personal|Staff/i },
      { path: "/dashboard/owner/club-eventos", slug: "eventos", heading: /Eventos/i },
      { path: "/dashboard/owner/club-finanzas", slug: "finanzas", heading: /Finanzas|Ingresos/i },
      { path: "/dashboard/owner/club-config", slug: "config", heading: /Configuración|club/i },
      { path: "/dashboard/owner/club-sorteos", slug: "sorteos", heading: /Sorteos|Giveaway/i },
      { path: "/dashboard/owner/club-membresias", slug: "membresias", heading: /Membresías|Planes/i },
    ],
  },
  {
    id: "admin",
    email: E2E_ADMIN_EMAIL,
    password: E2E_DEMO_PASSWORD,
    loginPath: "/dashboard/admin",
    routes: [
      { path: "/dashboard/admin", slug: "home", heading: /Overview|Admin|Plataforma/i },
      { path: "/dashboard/admin/admin-clubs", slug: "clubs", heading: /Clubes/i },
      { path: "/dashboard/admin/admin-events", slug: "events", heading: /Eventos/i },
      { path: "/dashboard/admin/admin-pagos", slug: "pagos", heading: /Pagos & Payouts/i },
      { path: "/dashboard/admin/admin-metrics", slug: "metrics", heading: /Métricas|KPI/i },
      { path: "/dashboard/admin/admin-flags", slug: "flags", heading: /Feature flags|Flags/i },
    ],
  },
  {
    id: "partner",
    email: E2E_PARTNER_EMAIL,
    password: E2E_DEMO_PASSWORD,
    loginPath: "/dashboard/partner",
    routes: [
      { path: "/dashboard/partner", slug: "home", heading: /Overview|torneos|Partner/i },
      { path: "/dashboard/partner/p-torneos", slug: "torneos", heading: /torneos|Mis torneos/i },
      { path: "/dashboard/partner/p-finanzas", slug: "finanzas", heading: /Finanzas/i },
      { path: "/dashboard/partner/p-brackets", slug: "brackets", heading: /Brackets/i },
      { path: "/dashboard/partner/p-inscritos", slug: "inscritos", heading: /Inscritos/i },
    ],
  },
  {
    id: "coach",
    email: E2E_COACH_EMAIL,
    password: E2E_DEMO_PASSWORD,
    loginPath: "/dashboard/coach",
    routes: [
      { path: "/dashboard/coach", slug: "home", heading: /Hoy|Coach|clases/i },
      { path: "/dashboard/coach/c-clases", slug: "clases", heading: /clases|Mis clases/i },
      { path: "/dashboard/coach/c-alumnos", slug: "alumnos", heading: /Alumnos/i },
      { path: "/dashboard/coach/c-calendar", slug: "calendar", heading: /Calendario/i },
    ],
  },
  {
    id: "manager",
    email: E2E_MANAGER_EMAIL,
    password: E2E_DEMO_PASSWORD,
    loginPath: "/dashboard/manager",
    routes: [
      { path: "/dashboard/manager", slug: "home", heading: /Hoy|Manager|Operación/i },
      { path: "/dashboard/manager/club-canchas", slug: "canchas", heading: /Canchas/i },
      { path: "/dashboard/manager/club-reservas", slug: "reservas", heading: /Reservas/i },
      { path: "/dashboard/manager/club-eventos", slug: "eventos", heading: /Eventos/i },
    ],
  },
];

function authFileFor(roleId: string) {
  return path.join(__dirname, `.artifacts/e2e-mobile-${roleId}-auth.json`);
}

async function gotoDashboardRoute(page: import("@playwright/test").Page, route: RoleRoute) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    const crashed = page.getByRole("heading", { name: /Algo se rompió/i });
    if (await crashed.isVisible().catch(() => false)) {
      if (attempt === 0) continue;
      throw new Error(`Pantalla de error en ${route.path}`);
    }
    await expect(page.getByText(route.heading).first()).toBeVisible({ timeout: 15_000 });
    return;
  }
}

for (const suite of ROLE_SUITES) {
  test.describe(`${suite.id} · móvil responsive`, () => {
    const AUTH_FILE = authFileFor(suite.id);

    if (!fs.existsSync(AUTH_FILE)) {
      fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
      fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    }

    test.use({
      viewport: MOBILE_VIEWPORT,
      hasTouch: true,
      isMobile: true,
      storageState: AUTH_FILE,
    });

    test.beforeAll(async ({ browser }) => {
      if (suite.prepare) await suite.prepare();
      fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
      const ctx = await browser.newContext({
        viewport: MOBILE_VIEWPORT,
        hasTouch: true,
        isMobile: true,
      });
      const page = await ctx.newPage();
      await signInWithCredentials(page, suite.email, suite.password, suite.loginPath);
      await ctx.storageState({ path: AUTH_FILE });
      await ctx.close();
    }, { timeout: 90_000 });

    test("chrome móvil: bottom nav y drawer cerrado", async ({ page }) => {
      await page.goto(suite.loginPath);
      await assertMobileChrome(page);
      const sidebarVisible = await page.locator("aside.w-64.fixed").first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.right > 4;
      });
      expect(sidebarVisible).toBe(false);
    });

    for (const route of suite.routes) {
      test(`carga ${route.slug} (${route.path})`, async ({ page }) => {
        await gotoDashboardRoute(page, route);
        await assertMobileChrome(page);
      });
    }

    test.describe("layout sin overflow horizontal", () => {
      for (const route of suite.routes) {
        test(`${route.slug}${route.knownOverflow ? " (bug conocido)" : ""}`, async ({ page }) => {
          await page.goto(route.path);
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(400);

          if (route.knownOverflow) {
            const probe = await probeMobileLayout(page);
            test.info().annotations.push({
              type: "overflow-px",
              description: String(probe.scrollOverflowPx),
            });
            test.fixme(
              probe.scrollOverflowPx <= 3,
              `Pendiente fix CSS móvil en ${suite.id}/${route.slug} (overflow ${probe.scrollOverflowPx}px)`,
            );
            return;
          }

          await assertNoHorizontalOverflow(page, {
            attachLabel: `${suite.id}-${route.slug}`,
            maxPx: 3,
          });
        });
      }
    });
  });
}
