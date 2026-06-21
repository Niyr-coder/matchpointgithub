// Login E2E genérico vía modal ?auth=signin (mismo flujo que jugador/owner).
import type { Page } from "@playwright/test";
import { dismissCookieConsent } from "./cookie-consent";

export async function signInWithCredentials(
  page: Page,
  email: string,
  password: string,
  nextPath: string,
) {
  await page.goto(nextPath);
  if (page.url().includes("/dashboard")) return;

  await page.goto(`/?auth=signin&next=${encodeURIComponent(nextPath)}`);
  await dismissCookieConsent(page);
  await page.getByPlaceholder("tu@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);

  const ingresar = page.getByRole("button", { name: /Ingresar/ });
  for (let attempt = 0; attempt < 4; attempt++) {
    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 30_000 }),
      ingresar.click(),
    ]).catch(() => undefined);
    if (page.url().includes("/dashboard")) return;

    const rateLimited = await page.getByText(/Too many requests/i).isVisible().catch(() => false);
    if (!rateLimited) break;
    await page.waitForTimeout(4_000);
  }

  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 30_000 });
}
