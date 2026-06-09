import "server-only";

import { MpError } from "@/lib/api/errors";
import type { PaymentProviderAdapter, PaymentProviderKey } from "@/lib/payments/types";
import { mercadoPagoProvider } from "@/lib/payments/providers/mercadopago";
import { stripeProvider } from "@/lib/payments/providers/stripe";

const ADAPTERS: Record<PaymentProviderKey, PaymentProviderAdapter | null> = {
  manual: null,
  stripe: stripeProvider,
  mercadopago: mercadoPagoProvider,
};

export function resolvePaymentProvider(key: PaymentProviderKey): PaymentProviderAdapter {
  const adapter = ADAPTERS[key];
  if (!adapter) {
    throw new MpError("PSP.PROVIDER_UNSUPPORTED", `Proveedor '${key}' no soporta checkout automático.`, 400);
  }
  return adapter;
}

export function defaultPaymentProviderKey(): PaymentProviderKey {
  const raw = (process.env.PSP_DEFAULT_PROVIDER ?? "stripe").trim().toLowerCase();
  if (raw === "mercadopago" || raw === "mp") return "mercadopago";
  if (raw === "stripe") return "stripe";
  return "stripe";
}

export function listConfiguredProviders(): PaymentProviderKey[] {
  return (["stripe", "mercadopago"] as const).filter((k) => ADAPTERS[k]?.isConfigured());
}
