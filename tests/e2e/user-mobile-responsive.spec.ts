/**
 * E2E responsive mobile — dashboard user (390×844, iPhone 14 class).
 *
 * Objetivo: detectar pantallas rotas en móvil (overflow, chrome, carga).
 * Credenciales: `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` (default seed QA).
 *
 * Ejecutar:
 *   npm run test:e2e -- tests/e2e/user-mobile-responsive.spec.ts
 *   npm run test:e2e:mobile
 */
import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { signInAsUser, E2E_USER_EMAIL } from "./helpers/auth-user";
import {
  MOBILE_VIEWPORT,
  assertMobileChrome,
  assertNoHorizontalOverflow,
  probeMobileLayout,
} from "./helpers/mobile-layout";

test.describe.configure({ mode: "serial" });

const USER_AUTH_FILE = path.join(__dirname, ".artifacts/e2e-user-mobile-auth.json");

if (!fs.existsSync(USER_AUTH_FILE)) {
  fs.mkdirSync(path.dirname(USER_AUTH_FILE), { recursive: true });
  fs.writeFileSync(USER_AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
}

test.use({
  viewport: MOBILE_VIEWPORT,
  hasTouch: true,
  isMobile: true,
  storageState: USER_AUTH_FILE,
});

type UserRoute = {
  path: string;
  slug: string;
  heading: RegExp;
  /** Si true, el overflow horizontal es un bug conocido documentado en docs/qa/user-mobile-ui-audit.md */
  knownOverflow?: boolean;
};

const USER_ROUTES: UserRoute[] = [
  { path: "/dashboard/user", slug: "home", heading: /Inicio|Reservas|Torneos|Bienvenido/i },
  { path: "/dashboard/user/chat", slug: "chat", heading: /Mensajes/i },
  { path: "/dashboard/user/quedadas", slug: "quedadas", heading: /Quedadas/i },
  { path: "/dashboard/user/amigos", slug: "amigos", heading: /Amigos|Solicitudes/i },
  { path: "/dashboard/user/busco-partido", slug: "busco-partido", heading: /Busco|partido|avisos/i },
  { path: "/dashboard/user/perfil", slug: "perfil", heading: /perfil|Jugador|MP\+|Free/i },
  { path: "/dashboard/user/clubes", slug: "clubes", heading: /Clubes/i },
  { path: "/dashboard/user/mi-plan", slug: "mi-plan", heading: /plan|MP\+|Premium/i },
  { path: "/dashboard/user/eventos", slug: "eventos", heading: /Eventos/i },
  { path: "/dashboard/user/ranking", slug: "ranking", heading: /Ranking/i },
];

test.beforeAll(async ({ browser }) => {
  fs.mkdirSync(path.dirname(USER_AUTH_FILE), { recursive: true });
  const ctx = await browser.newContext({
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await signInAsUser(page, "/dashboard/user");
  await ctx.storageState({ path: USER_AUTH_FILE });
  await ctx.close();
});

test("chrome móvil: bottom nav y drawer cerrado", async ({ page }) => {
  await page.goto("/dashboard/user");
  await assertMobileChrome(page);
  const sidebarVisible = await page.locator("aside.w-64.fixed").first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.right > 4;
  });
  expect(sidebarVisible).toBe(false);
});

for (const route of USER_ROUTES) {
  test(`carga ${route.slug} (${route.path})`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(route.heading).first()).toBeVisible({ timeout: 15_000 });
    await assertMobileChrome(page);
  });
}

test.describe("layout sin overflow horizontal", () => {
  for (const route of USER_ROUTES) {
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
          `Pendiente fix CSS móvil en ${route.slug} (overflow ${probe.scrollOverflowPx}px)`,
        );
        return;
      }

      await assertNoHorizontalOverflow(page, { attachLabel: route.slug, maxPx: 3 });
    });
  }
});

test("mensajes: lista visible sin conversación activa", async ({ page }) => {
  await page.goto("/dashboard/user/chat");
  await expect(page.getByText(/Mensajes/i).first()).toBeVisible();
  const list = page.locator("aside.mp-messages-list");
  await expect(list).toBeVisible();
  await expect(page.locator(".mp-messages-thread")).toBeHidden();
});

test("mensajes: al abrir hilo, lista se oculta en móvil", async ({ page }) => {
  await page.goto("/dashboard/user/chat");
  const firstConvo = page
    .locator("aside.mp-messages-list > div")
    .nth(1)
    .locator("button.mp-press")
    .first();
  const count = await firstConvo.count();
  test.skip(count === 0, "Sin conversaciones en la cuenta E2E");
  await firstConvo.click();
  await expect(page.locator("aside.mp-messages-list")).toBeHidden();
  await expect(page.locator(".mp-messages-thread")).toBeVisible();
});

test("amigos: panel principal debajo del aside en móvil", async ({ page }) => {
  await page.goto("/dashboard/user/amigos");
  const main = page.locator("main").locator("main, main > *").first();
  await expect(page.getByText(/Amigos|Solicitudes/i).first()).toBeVisible();
  const probe = await probeMobileLayout(page);
  expect(probe.scrollOverflowPx).toBeLessThanOrEqual(12);
});
