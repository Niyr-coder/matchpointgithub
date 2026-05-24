"use server";

// Telemetría de pricing/paywall. Escribe a paywall_events vía service-role
// (RLS de la tabla no expone insert a anon/authenticated — los eventos solo
// entran por este path para tener un único lugar de validación).
//
// Diseño deliberado:
// - Anónimo permitido: /precios es landing pública. user_id queda null y
//   correlacionamos por session_id (sessionStorage del cliente).
// - Fire-and-forget desde el cliente: nunca devolvemos error útil; el viewer
//   no debe enterarse si la analítica falla.
// - Tabla write-only desde aquí. Lectura/analítica = SQL admin.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { getSession } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/api/action";
import { PricingEventSchema } from "@/lib/schemas/telemetry";
import { captureError } from "@/lib/observability/sentry";

export async function trackPricingEvent(input: unknown): Promise<ActionResult<{ recorded: true }>> {
  return runAction(PricingEventSchema, input, async (event) => {
    const sessionResult = await getSession();
    const userId = sessionResult.authenticated ? sessionResult.session.userId : null;

    const admin = getAdminClient();
    // `paywall_events` se introdujo en la migración 171 — no está aún en los
    // tipos generados de Supabase. El cast a any se reemplaza cuando se
    // regeneren los types (independiente de este ticket).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("paywall_events").insert({
      event_name: event.event_name,
      user_id: userId,
      session_id: event.session_id ?? null,
      props: event.props ?? {},
    });

    if (error) {
      // Logueamos pero no rompemos al caller — telemetría es best-effort.
      captureError(error, { layer: "action", scope: "telemetry.pricing" });
    }

    return { recorded: true as const };
  });
}
