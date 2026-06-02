/** URL pública del sitio (metadata, sitemap, emails). Acepta host sin protocolo. */

const DEFAULT_SITE_URL = "https://matchpointgithub.vercel.app";

export function resolveSiteUrl(
  raw?: string | null,
  fallback: string = DEFAULT_SITE_URL,
): string {
  const value = (raw?.trim() || fallback).trim();
  if (!value) return DEFAULT_SITE_URL;
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/$/, "");
  }
  return `https://${value.replace(/\/$/, "")}`;
}

export function getSiteUrl(): string {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL);
}
