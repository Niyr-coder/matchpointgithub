// Variante de useRealtimeRefresh para tablas SIN filtro server-side posible
// (ej. bracket_matches no tiene tournament_id — deuda estructural, ver audit
// 2026-07-01). El CDC hace fanout global en esas tablas: sin este guard, cada
// punto anotado en CUALQUIER torneo de la plataforma re-ejecutaba la página
// completa de todos los subscribers (~18 queries por refresh).
//
// isRelevant decide client-side si el evento pertenece a ESTA página (por
// bracket_id/group_id/category_id del payload). Solo entonces se agenda un
// router.refresh() debounced. Eventos sin payload identificable (DELETE con
// replica identity parcial) se tratan como relevantes (fail-open, raros).
//
// El fix definitivo (fase 4 del plan de costos) es denormalizar tournament_id
// y filtrar en la suscripción — esto es el puente barato.
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";
import {
  useRealtimeRefresh,
  type RealtimePayload,
  type RealtimeWatch,
} from "./useRealtimeRefresh";

type Opts = {
  enabled?: boolean;
  debounceMs?: number;
  /** true = el evento pertenece a esta página → refresh. */
  isRelevant: (table: string, payload: RealtimePayload) => boolean;
};

export function useScopedRealtimeRefresh(watches: RealtimeWatch[], opts: Opts) {
  const router = useRouter();
  const debounceMs = opts.debounceMs ?? REALTIME_DEBOUNCE.DEFAULT;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref para no re-suscribir el canal cuando cambia el closure de isRelevant.
  const isRelevantRef = useRef(opts.isRelevant);
  isRelevantRef.current = opts.isRelevant;

  useRealtimeRefresh(watches, {
    enabled: opts.enabled,
    onChange: (table, payload) => {
      if (!isRelevantRef.current(table, payload)) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => router.refresh(), debounceMs);
    },
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}

/** Helper: lee un id del payload (new primero, old como fallback en DELETE). */
export function payloadId(payload: RealtimePayload, column: string): string | null {
  const fromNew = payload.new?.[column];
  if (typeof fromNew === "string") return fromNew;
  const fromOld = payload.old?.[column];
  if (typeof fromOld === "string") return fromOld;
  return null;
}
