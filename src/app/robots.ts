import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://matchpointgithub.vercel.app";

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
