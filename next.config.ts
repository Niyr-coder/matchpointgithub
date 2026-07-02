import type { NextConfig } from "next";

// CSP en modo enforce.
// unsafe-inline / unsafe-eval requeridos por Next.js (turbopack, hydration).
// TODO (Ola 3+): implementar nonce-based CSP en middleware para eliminar unsafe-*.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://*.basemaps.cartocdn.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // zod v4 tiene imports circulares internos (core ↔ classic) que el chunking
  // de Turbopack a veces parte en orden inválido → "Cannot access 'X' before
  // initialization" al recolectar page data (falla el build de forma no
  // determinística). Externalizarlo del bundle server evita que Turbopack lo
  // re-agrupe; Node lo resuelve directo de node_modules.
  serverExternalPackages: ["zod"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
  // OJO: el rewrite del subdominio tv.matchpoint.top vive en src/proxy.ts
  // (Next 16: proxy.ts reemplaza a middleware.ts) — NO duplicarlo aquí.
  async redirects() {
    return [
      // www → apex. Requiere que www.matchpoint.top esté en Vercel con SSL.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.matchpoint.top" }],
        destination: "https://matchpoint.top/:path*",
        permanent: true,
      },
      // MAT-20 — `/clubes/precios` se movió a `/precios` (sale de la columna
      // "Clubes" en el footer al top nav como ítem propio). Mantener 301 por
      // 90 días para no romper inbound links (footer viejo en prod, búsqueda,
      // bookmarks). Reevaluar retiro post 2026-08-24.
      {
        source: "/clubes/precios",
        destination: "/precios",
        statusCode: 301,
      },
    ];
  },
};

export default nextConfig;
