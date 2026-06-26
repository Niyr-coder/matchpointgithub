import "server-only";

import { headers } from "next/headers";
import type { NextRequest } from "next/server";

// Usamos x-real-ip (puesto por el proxy de Vercel / load balancer de confianza)
// antes que x-forwarded-for. El leftmost de x-forwarded-for lo controla el
// cliente y es spoofeable para saltar rate limits — no usarlo como fuente primaria.
// En Vercel: x-real-ip = IP real del cliente; último segmento de x-forwarded-for
// = IP de salida del load balancer.

/** IP del cliente para rate limits (Server Actions / Route Handlers). */
export async function clientIpFromHeaders(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-real-ip") ||
    lastTrustedIp(h.get("x-forwarded-for")) ||
    "unknown"
  );
}

export function clientIpFromRequest(req: NextRequest): string | null {
  return (
    req.headers.get("x-real-ip") ??
    lastTrustedIp(req.headers.get("x-forwarded-for")) ??
    null
  );
}

/** Último segmento de x-forwarded-for = IP añadida por el proxy de borde (confiable). */
function lastTrustedIp(fwd: string | null | undefined): string | null {
  if (!fwd) return null;
  const segs = fwd.split(",");
  const last = segs[segs.length - 1]?.trim();
  return last || null;
}
