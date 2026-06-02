import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const SITE_URL = getSiteUrl();

// Bloqueamos superficies privadas / de sesión del crawler: dashboard,
// onboarding, callbacks de auth, pagos y rutas de join por código.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/onboarding",
        "/auth",
        "/login",
        "/signup",
        "/forgot-password",
        "/pagos",
        "/q/",
        "/sandbox",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
