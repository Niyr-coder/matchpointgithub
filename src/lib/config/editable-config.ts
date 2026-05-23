// Allowlist de keys de platform_config editables desde el panel admin + cómo se
// coacciona/valida cada value. Vive fuera del archivo de server actions (esos
// módulos solo pueden exportar funciones async). Lo consumen la action
// updatePlatformConfig y el server component AdminConfigScreenServer.
export const EDITABLE_CONFIG = {
  take_rate_pct: { type: "number", min: 0, max: 100 },
  estelar_price_cents: { type: "number", min: 0, max: 1_000_000 },
  refund_window_days: { type: "number", min: 0, max: 365 },
  ranking_min_matches: { type: "number", min: 0, max: 100 },
  match_seek_expiry_days: { type: "number", min: 1, max: 90 },
  match_seek_max_open_per_user: { type: "number", min: 1, max: 50 },
  multisport_enabled: { type: "boolean" },
  system_messages_enabled: { type: "boolean" },
} as const;

export type EditableConfigKey = keyof typeof EDITABLE_CONFIG;
