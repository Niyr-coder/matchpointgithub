// Login E2E vía el endpoint público de la app — devuelve un Page autenticado.
// Usar UI (modal `?auth=signin`) en vez de inyectar cookies para validar el
// flujo real de auth + middleware de Next + redirect post-login.
import type { Page } from "@playwright/test";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "./env";

export async function signInAsOwner(page: Page, nextPath = "/dashboard/owner/club-canchas") {
  // Abrir el modal de signin via querystring (ver landing/PublicChromeClient).
  await page.goto(`/?auth=signin&next=${encodeURIComponent(nextPath)}`);
  await page.getByPlaceholder("tu@email.com").fill(E2E_OWNER_EMAIL);
  await page.getByPlaceholder("••••••••").fill(E2E_OWNER_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20_000 }),
    page.getByRole("button", { name: /Ingresar/ }).click(),
  ]);
  // Esperar a que el screen de canchas esté renderizado (tab "Gestión" visible).
  await page.getByRole("button", { name: /Gestión/ }).waitFor({ state: "visible" });
}
