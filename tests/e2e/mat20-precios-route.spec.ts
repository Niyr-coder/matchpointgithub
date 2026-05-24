// MAT-20 — `/clubes/precios` se mueve a `/precios` y "Precios" aparece en el top nav.
//
// Verifica:
//   1. GET `/clubes/precios` responde con redirect permanente (301) a `/precios`.
//   2. Desktop: el nav muestra el link "Precios" y queda marcado `data-active=true` en `/precios`.
//   3. Mobile: el sheet hamburguesa también muestra "Precios" activo en `/precios`.

import { test, expect, devices } from "@playwright/test";

test.describe("MAT-20 · /precios", () => {
  test("`/clubes/precios` redirige permanentemente a `/precios`", async ({ request }) => {
    const response = await request.get("/clubes/precios", { maxRedirects: 0 });
    expect([301, 308]).toContain(response.status());
    const location = response.headers()["location"] ?? "";
    expect(location).toMatch(/\/precios(\?.*)?$/);
  });

  test("desktop · nav muestra 'Precios' activo en `/precios`", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/precios");
    const link = page.locator("nav a[href='/precios']").first();
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Precios");
    await expect(link).toHaveAttribute("data-active", "true");
  });

  test("mobile · sheet muestra 'Precios' al abrir hamburguesa", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await page.goto("/precios");
    // El sheet vive siempre en el DOM (animaciones por opacity/transform). El
    // hamburger está en una `<nav>` flotante que captura los pointer events
    // contiguos — usar `force` para no depender del z-stacking exacto.
    await page.getByRole("button", { name: /Abrir menú/ }).click({ force: true });
    const link = page
      .locator("div[role='dialog'] a[href='/precios']")
      .first();
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Precios");
    await expect(link).toHaveAttribute("data-active", "true");
    await context.close();
  });
});
