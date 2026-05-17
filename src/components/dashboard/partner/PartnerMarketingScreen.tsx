// Server: marketing del partner — broadcasts scope=partner + canales agregados.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import {
  PartnerMarketingScreenView,
  type MarketingData,
  type CampaignRow,
  type ChannelRow,
} from "./PartnerMarketingScreenView";

const CHANNEL_LABEL: Record<string, string> = {
  inapp: "In-app",
  push: "Push",
  email: "Email",
  sms: "SMS",
};

const CHANNEL_COLOR: Record<string, string> = {
  inapp: "var(--primary)",
  push: "#0a0a0a",
  email: "#0ea5e9",
  sms: "#fbbf24",
};

async function loadData(): Promise<MarketingData> {
  const partnerId = await resolveActivePartnerId();
  if (!partnerId) {
    return {
      partnerId: null,
      totalAlcance: 0,
      inscritosFromAds: 0,
      campaigns: [],
      channels: [],
    };
  }

  const supabase = await getServerClient();

  const { data: broadcasts } = await supabase
    .from("broadcasts")
    .select("id,title,channels,status,scheduled_for,sent_at,created_at")
    .eq("scope", "partner")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Reach via broadcast_recipients
  const ids = (broadcasts ?? []).map((b) => b.id as string);
  const reachByBroadcast = new Map<string, number>();
  let totalAlcance = 0;
  const channelCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: recipients } = await supabase
      .from("broadcast_recipients")
      .select("broadcast_id")
      .in("broadcast_id", ids);
    for (const r of recipients ?? []) {
      const bid = r.broadcast_id as string;
      reachByBroadcast.set(bid, (reachByBroadcast.get(bid) ?? 0) + 1);
      totalAlcance++;
    }
  }
  for (const b of broadcasts ?? []) {
    const chans = (b.channels as string[] | null) ?? [];
    const reach = reachByBroadcast.get(b.id as string) ?? 0;
    for (const c of chans) {
      channelCounts.set(c, (channelCounts.get(c) ?? 0) + reach);
    }
  }

  const campaigns: CampaignRow[] = (broadcasts ?? [])
    .filter((b) => ["scheduled", "sending", "sent"].includes(b.status as string))
    .slice(0, 5)
    .map((b) => {
      const chans = (b.channels as string[] | null) ?? [];
      const reach = reachByBroadcast.get(b.id as string) ?? 0;
      return {
        id: b.id as string,
        n: (b.title as string) ?? "Sin título",
        cost: "$—", // no hay tracking de costo aún
        ch:
          chans.length > 0
            ? chans.map((c) => CHANNEL_LABEL[c] ?? c).join(" + ") +
              (reach > 0 ? ` · ${reach.toLocaleString("en-US")} inbox` : "")
            : "—",
      };
    });

  const totalChan = Array.from(channelCounts.values()).reduce((s, v) => s + v, 0);
  const channels: ChannelRow[] = Array.from(channelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code, count]) => ({
      l: CHANNEL_LABEL[code] ?? code,
      pct: totalChan > 0 ? Math.round((count / totalChan) * 100) : 0,
      c: CHANNEL_COLOR[code] ?? "var(--muted-fg)",
    }));

  return {
    partnerId,
    totalAlcance,
    inscritosFromAds: 0, // no hay attribution model todavía
    campaigns,
    channels,
  };
}

export async function PartnerMarketingScreen() {
  const data = await loadData();
  return <PartnerMarketingScreenView data={data} />;
}
