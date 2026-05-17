// Hook: suscribe a postgres_changes en las tablas dadas y dispara router.refresh()
// cuando llega un evento. Auto-cleanup al desmontar o cambiar deps.
//
// Uso:
//   useRealtimeRefresh([
//     { table: "reservations", filter: `club_id=eq.${clubId}` },
//     { table: "tournaments", filter: `club_id=eq.${clubId}` },
//   ], { enabled: !!clubId });
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/db/client.browser";

export type RealtimeWatch = {
  table: string;
  filter?: string; // ej. "club_id=eq.UUID"
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

type Opts = {
  enabled?: boolean;
  // Debounce para evitar 10 refreshes seguidos si llegan eventos en ráfaga.
  debounceMs?: number;
};

export function useRealtimeRefresh(watches: RealtimeWatch[], opts: Opts = {}) {
  const router = useRouter();
  const enabled = opts.enabled !== false;
  const debounceMs = opts.debounceMs ?? 300;
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
        triggerRefresh,
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
