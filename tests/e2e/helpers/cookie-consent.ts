import type { Page } from "@playwright/test";

/** Cierra el banner de cookies si bloquea clics en modales E2E. */
export async function dismissCookieConsent(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /cookies esenciales/i });
  if (!(await dialog.isVisible().catch(() => false))) return;
  await dialog.getByRole("button", { name: /Entendido/i }).click({ force: true });
  await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
}
