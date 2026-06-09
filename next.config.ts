import type { NextConfig } from "next";

const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ];
  },
  async redirects() {
    return [
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
