import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
