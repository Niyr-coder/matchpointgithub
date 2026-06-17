/** Constantes PSP — sin server-only para imports compartidos. */
export const PSP_CHECKOUT_FLAG = "psp_checkout_enabled";

export const PSP_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "MP_ACCESS_TOKEN",
  "MP_WEBHOOK_SECRET",
  "PSP_DEFAULT_PROVIDER",
] as const;
