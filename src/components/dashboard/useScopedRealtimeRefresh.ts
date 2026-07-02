// Variante de useRealtimeRefresh para pantallas MULTI-torneo (home del
// partner, listados de club): no pueden filtrar server-side por un solo
// tournament_id, así que el CDC les entrega eventos de toda la plataforma.
// `isRelevant` decide client-side (p. ej. payload.tournament_id ∈ mis
// torneos — la columna existe en las tablas de scoring desde mig
// 20260715000000) y solo entonces agenda un router.refresh() debounced.
//
// Para pantallas de UN torneo NO usar esto: filtrar directo en la suscripción
// (`filter: tournament_id=eq.<id>` — ver 50-realtime.md §16).
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
  /** true = el evento pertenece a esta pantalla → refresh. */
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
