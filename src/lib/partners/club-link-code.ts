/** Normaliza el código CLB-XXXX-XXXX que comparte el club con partners. */
export function normalizeClubPartnerLinkCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
