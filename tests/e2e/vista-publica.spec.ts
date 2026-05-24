// Captura de la tab "Vista pública" para responder la pregunta del CEO en
// MAT-8 — "¿por qué está distinta la galería?". El SVG-gallery original se
// preservó acá per UX kit Ola A; este spec lo evidencia con un screenshot
// dedicado.

import { test } from "@playwright/test";
import { signInAsOwner } from "./helpers/auth";
import { ensureSeed } from "./helpers/setup";

test("vista pública · captura de galería SVG preservada", async ({ page }) => {
  await ensureSeed();
  await signInAsOwner(page);
  await page.getByRole("button", { name: /Vista pública/ }).click();
  // Esperar a que la banda informativa azul + la galería SVG estén pintadas.
  await page.locator("text=Vista pública").first().waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "tests/e2e/.artifacts/vista-publica-galeria.png",
    fullPage: true,
  });
});
