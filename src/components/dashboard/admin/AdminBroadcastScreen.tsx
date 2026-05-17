// Server: broadcasts scope=platform (enviadas + programadas) para admin.
import { getServerClient } from "@/lib/db/client.server";
import {
  AdminBroadcastScreenView,
  type BroadcastData,
  type SentRow,
  type DraftRow,
  type Kind,
} from "./AdminBroadcastScreenView";

function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "ayer" : `hace ${days} d`;
  return `hace ${Math.floor(days / 7)} sem`;
}

function mapChannelToKind(channel: string): Kind {
  if (channel === "push") return "push";
  if (channel === "email") return "email";
  if (channel === "inapp") return "in-app";
  return "banner";
}

function audienceLabel(targetFilter: Record<string, unknown> | null, fallback: string): string {
  if (!targetFilter || Object.keys(targetFilter).length === 0) return fallback;
  return Object.entries(targetFilter)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" · ");
}

async function loadData(): Promise<BroadcastData> {
  const supabase = await getServerClient();
  const now = new Date();

  const { data: broadcasts } = await supabase
    .from("broadcasts")
    .select("id,title,channels,target_filter,status,scheduled_for,sent_at,created_at")
    .eq("scope", "platform")
    .order("created_at", { ascending: false })
    .limit(40);

  const ids = (broadcasts ?? []).map((b) => b.id as string);
  const reachByBroadcast = new Map<string, number>();
  if (ids.length > 0) {
    const { data: recipients } = await supabase
      .from("broadcast_recipients")
      .select("broadcast_id")
      .in("broadcast_id", ids);
    for (const r of recipients ?? []) {
      const bid = r.broadcast_id as string;
      reachByBroadcast.set(bid, (reachByBroadcast.get(bid) ?? 0) + 1);
    }
  }

  const sent: SentRow[] = [];
  const drafts: DraftRow[] = [];

  for (const b of broadcasts ?? []) {
    const channels = (b.channels as string[] | null) ?? ["inapp"];
    const kind = mapChannelToKind(channels[0]);
    const reach = reachByBroadcast.get(b.id as string) ?? 0;
    const audience = audienceLabel(
      b.target_filter as Record<string, unknown> | null,
      "Toda la plataforma",
    );

    if (b.status === "sent") {
      sent.push({
        id: b.id as string,
        t: (b.title as string) ?? "Sin título",
        kind,
        audience,
        reach: reach.toLocaleString("en-US"),
        open: "—",
        when: relativeTime((b.sent_at as string) ?? (b.created_at as string), now),
      });
    } else if (["draft", "scheduled", "sending"].includes(b.status as string)) {
      drafts.push({
        id: b.id as string,
        t: (b.title as string) ?? "Sin título",
        kind,
        audience,
        scheduled: (b.scheduled_for as string | null)
          ? new Date(b.scheduled_for as string).toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" })
          : b.status === "sending"
          ? "enviando"
          : "borrador",
        st: b.status === "scheduled" ? "scheduled" : "live",
      });
    }
  }

  return { sent, drafts };
}

export async function AdminBroadcastScreen() {
  const data = await loadData();
  return <AdminBroadcastScreenView data={data} />;
}
