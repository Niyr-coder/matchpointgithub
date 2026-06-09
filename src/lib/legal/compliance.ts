/** Avisos legales / beta. Client-safe (NEXT_PUBLIC_*). */

export const COOKIE_CONSENT_STORAGE_KEY = "mp_cookie_consent_v1";

/** Beta cerrada: aviso en auth hasta desactivar con NEXT_PUBLIC_MP_BETA_PHASE=0 */
export function isBetaPhaseDisclosureEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_MP_BETA_PHASE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

export function hasCookieConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) === "accepted";
  } catch {
    return false;
  }
}

export function acceptCookieConsent(): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
  } catch {
    // Sin storage (modo privado estricto): el banner puede reaparecer; no bloqueamos uso.
  }
}
