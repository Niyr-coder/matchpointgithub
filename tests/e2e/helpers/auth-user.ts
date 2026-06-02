// Login E2E jugador — flujo real vía modal ?auth=signin (mismo patrón que owner).
import type { Page } from "@playwright/test";
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./env";

export { E2E_USER_EMAIL, E2E_USER_PASSWORD };

export async function signInAsUser(page: Page, nextPath = "/dashboard/user") {
  await page.goto(nextPath);
  if (page.url().includes("/dashboard")) return;

  await page.goto(`/?auth=signin&next=${encodeURIComponent(nextPath)}`);
  await page.getByPlaceholder("tu@email.com").fill(E2E_USER_EMAIL);
  await page.getByPlaceholder("••••••••").fill(E2E_USER_PASSWORD);

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
