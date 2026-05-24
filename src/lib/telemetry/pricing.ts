// Cliente browser para registrar eventos pricing_* en paywall_events.
// Fire-and-forget: jamás bloquea ni lanza. Si la red o el endpoint fallan,
// log a console y seguimos.
//
// Eventos cubiertos (spec en MAT-27, MAT-1 §5.3):
//   pricing_page_viewed       — landing /precios
//   pricing_tab_viewed        — { audience }
//   pricing_toggle_changed    — { billing_period }
//   pricing_tier_cta_clicked  — { tier_key, audience, billing_period }
//   pricing_faq_expanded      — { faq_key }
//
// PostHog: cuando esté cableado a futuro, espejamos el call aquí mismo
// (`window.posthog?.capture(name, props)`) sin tocar callers.

import type { PricingEventName } from "@/lib/schemas/telemetry";

const SESSION_KEY = "mp_pricing_session_id";
const ENDPOINT = "/api/v1/telemetry/pricing";

function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage puede estar bloqueado (Safari ITP, modo incógnito raro).
    return null;
  }
}

type EventProps = Record<string, unknown>;

type PricingEventArgs =
  | { name: "pricing_page_viewed"; props?: EventProps }
  | { name: "pricing_tab_viewed"; props: { audience: string } & EventProps }
  | { name: "pricing_toggle_changed"; props: { billing_period: "monthly" | "annual" } & EventProps }
  | {
      name: "pricing_tier_cta_clicked";
      props: { tier_key: string; audience: string; billing_period: "monthly" | "annual" } & EventProps;
    }
  | { name: "pricing_faq_expanded"; props: { faq_key: string } & EventProps };

export function trackPricingEvent(arg: PricingEventArgs): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    event_name: arg.name,
    session_id: getSessionId() ?? undefined,
    props: arg.props ?? {},
  });

  // sendBeacon es preferible — funciona durante unload y no bloquea.
  // Fallback a fetch con keepalive si no está disponible.
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon(ENDPOINT, blob);
      if (sent) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch((err) => {
      console.warn("[telemetry.pricing] fetch failed", err);
    });
  } catch (err) {
    console.warn("[telemetry.pricing] send failed", err);
  }
}

// Re-export del nombre canónico por si algún caller necesita tipearlo.
export type { PricingEventName };
