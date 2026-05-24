// Telemetry event schemas. Eventos write-only que escriben a paywall_events
// vía POST /api/v1/telemetry/pricing.
import { z } from "zod";

export const PRICING_EVENT_NAMES = [
  "pricing_page_viewed",
  "pricing_tab_viewed",
  "pricing_toggle_changed",
  "pricing_tier_cta_clicked",
  "pricing_faq_expanded",
] as const;

export const PricingEventNameSchema = z.enum(PRICING_EVENT_NAMES);

export type PricingEventName = z.infer<typeof PricingEventNameSchema>;

export const PricingEventSchema = z.object({
  event_name: PricingEventNameSchema,
  // `session_id` es un UUID/string generado por el cliente y mantenido en
  // sessionStorage para correlacionar eventos anónimos en una misma sesión.
  session_id: z.string().min(1).max(128).optional(),
  // Payload variable por evento. Lo dejamos como pasamanos jsonb — el
  // análisis vive en SQL/dashboards. Limitamos profundidad implícita por
  // tamaño del body via Next default.
  props: z.record(z.string(), z.unknown()).optional().default({}),
});

export type PricingEvent = z.infer<typeof PricingEventSchema>;
