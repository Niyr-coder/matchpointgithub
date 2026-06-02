import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const SITE_URL = getSiteUrl();

// Rutas públicas estáticas del landing. Las dinámicas (clubes/[slug],
// eventos/[slug], blog/[slug]) se podrían sumar generándolas desde la BD;
// por ahora listamos las páginas marketing estables.
const STATIC_PATHS = [
  "",
  "/clubes",
  "/eventos",
  "/coaches",
  "/ranking",
  "/precios",
  "/como-funciona",
  "/blog",
  "/acerca-de",
  "/soy-club",
  "/soy-partner",
  "/soy-coach",
  "/trabaja-con-nosotros",
  "/legal/terminos",
  "/legal/privacidad",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return STATIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
