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
  const debounceMs = opts.debounceMs ?? 300;
  // Ref para que cambios de onChange no fuercen re-suscripción al canal.
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  // Stringify watches para que el effect solo re-suscriba si cambian.
  const key = JSON.stringify(watches);

  useEffect(() => {
    if (!enabled || watches.length === 0) return;
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const triggerRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), debounceMs);
    };

    const channelName = `mp-rt-${Math.random().toString(36).slice(2, 10)}`;
    let channel = supabase.channel(channelName);

    for (const w of watches) {
      channel = channel.on(
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

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, debounceMs]);
}
