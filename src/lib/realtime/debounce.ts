/** Tiers de debounce para `useRealtimeRefresh` (modo `router.refresh`). */
export const REALTIME_DEBOUNCE = {
  /** Pantallas operativas en vivo (caja, check-in, bracket). */
  LIVE: 300,
  /** Default cuando el caller no pasa `debounceMs`. */
  DEFAULT: 1500,
  /** Listas admin / dashboards secundarios. */
  ADMIN_LIST: 5000,
  /** Analytics agregados — evitar refresh por cada txn/reserva. */
  ANALYTICS: 30_000,
} as const;
