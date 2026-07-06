// Hook: suscribe a postgres_changes en las tablas dadas y dispara
// router.refresh() (modo default) o un callback granular cuando llega un
// evento. Auto-cleanup al desmontar o cambiar deps.
//
// Modo refresh (default — sin onChange):
//   useRealtimeRefresh([
//     { table: "reservations", filter: `club_id=eq.${clubId}` },
//     { table: "tournaments", filter: `club_id=eq.${clubId}` },
//   ], { enabled: !!clubId });
//
// Modo callback (granular — con onChange):
//   useRealtimeRefresh(
//     [{ table: "transactions", filter: "kind=eq.tournament" }],
//     {
//       onChange: (table, payload) => {
//         // Solo refetchea la sección que importa, no toda la pantalla.
//         startTransition(async () => {
//           const r = await listMyTxs();
//           setTxs(r.data);
//         });
//       },
//     },
//   );
//
// Cuándo usar callback: si re-correr todas las server queries de la página
// es caro y solo necesitas refetch puntual (ej. una lista, un counter, un
// chart). El callback recibe la tabla afectada + el payload raw de Supabase
// para que el caller decida qué hacer con el evento.
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/db/client.browser";
import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";

export type RealtimeWatch = {
  table: string;
  filter?: string; // ej. "club_id=eq.UUID"
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

export type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

type Opts = {
  enabled?: boolean;
  // Debounce para evitar 10 refreshes seguidos si llegan eventos en ráfaga.
  // Solo aplica al modo router.refresh(); en modo callback el caller decide.
  debounceMs?: number;
  // Si se pasa, NO se llama router.refresh(). El caller recibe el evento y
  // hace refetch granular (ej. startTransition + reset de un useState).
  // Recibe el nombre de la tabla afectada y el payload raw de Supabase.
  onChange?: (table: string, payload: RealtimePayload) => void;
};

export function useRealtimeRefresh(watches: RealtimeWatch[], opts: Opts = {}) {
  const router = useRouter();
  const enabled = opts.enabled !== false;
  const debounceMs = opts.debounceMs ?? REALTIME_DEBOUNCE.DEFAULT;
  // Ref para que cambios de onChange no fuercen re-suscripción al canal.
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  // Stringify watches para que el effect solo re-suscriba si cambian.
  const key = JSON.stringify(watches);

  useEffect(() => {
    if (!enabled || watches.length === 0) return;
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    // El cleanup del effect setea disposed para cancelar retries pendientes
    // (crítico en dev: StrictMode monta el effect dos veces).
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const triggerRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), debounceMs);
    };

    const tables = watches.map((w) => w.table).join(",");

    // Si el canal muere (red caída, token vencido, error del server), la
    // pantalla quedaría muda para siempre: re-suscribimos con backoff
    // exponencial. En SUBSCRIBED se resetea el contador.
    const openChannel = () => {
      if (disposed) return;
      // Canal reemplazado por un retry: sus callbacks tardíos no deben
      // volver a agendar otro retry.
      let stale = false;
      const channelName = `mp-rt-${Math.random().toString(36).slice(2, 10)}`;
      let ch = supabase.channel(channelName);

      for (const w of watches) {
        ch = ch.on(
          "postgres_changes" as never,
          {
            event: w.event ?? "*",
            schema: "public",
            table: w.table,
            ...(w.filter ? { filter: w.filter } : {}),
          },
          (payload: RealtimePayload) => {
            if (onChangeRef.current) {
              // Modo callback: el caller decide qué refetchear. Sin debounce
              // global — si el caller quiere debounce, lo arma él.
              onChangeRef.current(w.table, payload);
            } else {
              triggerRefresh();
            }
          },
        );
      }

      ch.subscribe((status: string) => {
        if (disposed || stale) return;
        if (status === "SUBSCRIBED") {
          retryCount = 0;
          return;
        }
        // CLOSED con disposed ya retornó arriba (cleanup normal); aquí es
        // un cierre inesperado y se trata igual que un error.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          stale = true;
          const delay = Math.min(1000 * 2 ** retryCount, 30_000);
          retryCount += 1;
          console.warn(
            `[realtime] canal ${channelName} (${tables}) en estado ${status}; reintento en ${delay}ms`,
          );
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            if (disposed) return;
            if (channel) supabase.removeChannel(channel);
            channel = null;
            openChannel();
          }, delay);
        }
      });
      channel = ch;
    };

    openChannel();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, debounceMs]);
}
