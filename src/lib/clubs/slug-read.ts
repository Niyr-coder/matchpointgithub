/** Slugs legacy en DB pueden empezar con `-`; normaliza para validación de lectura. */
export function normalizeClubSlugForRead(raw: unknown): string {
  const slug = String(raw ?? "").trim().toLowerCase();
  return slug.replace(/^-+/, "").replace(/-+/g, "-");
}
