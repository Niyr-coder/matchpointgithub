// Server: campañas (broadcasts) + alcance del club. KPIs sin tracking propio
// (CTR, revenue de promos) caen al placeholder del mock.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import {
  ClubMarketingScreenView,
  type MarketingData,
  type CampaignCard,
  type ChannelStat,
} from "./ClubMarketingScreenView";

const PROMO_BGS = [
  "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
  "linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)",
  "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
];

// Payload meta opcional que los defaults seedeados traen para forzar
// presentación (code legible, tag custom, uses/max, etc.). Si está, gana
// sobre los derivados del status.
type CampaignPayload = {
  code?: string;
  tag?: string;
  kind?: string;
  accent?: string;
  bg?: string;
  uses?: number;
  max?: number;
  end?: string;
};
const STATUS_TAG: Record<string, { tag: string; accent: string }> = {
  draft: { tag: "BORRADOR", accent: "var(--muted-fg)" },
  scheduled: { tag: "PROGRAMADA", accent: "#ea580c" },
  sending: { tag: "EN VIVO", accent: "var(--primary)" },
  sent: { tag: "ENVIADA", accent: "var(--primary)" },
  cancelled: { tag: "CANCELADA", accent: "var(--muted-fg)" },
};

const CHANNEL_META: Record<string, { label: string; color: string; icon: string }> = {
  inapp: { label: "In-app", color: "var(--primary)", icon: "bell" },
  email: { label: "Email", color: "#0ea5e9", icon: "mail" },
  push: { label: "Push", color: "#fbbf24", icon: "smartphone" },
  sms: { label: "SMS", color: "#dc2626", icon: "smartphone" },
  whatsapp: { label: "WhatsApp", color: "#fbbf24", icon: "message-circle" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "Indefinido";
  const d = new Date(iso);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const dow = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  return `${dow[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

async function loadData(): Promise<MarketingData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return {
      clubId: null,
      clubName: "",
      campaigns: [],
      reachMonth: 0,
      sentCount: 0,
      channels: [],
    };
  }

  const supabase = await getServerClient();
  const { data: clubRow } = await supabase
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .maybeSingle();
  const clubName = (clubRow?.name as string | null) ?? "Tu club";
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: broadcasts } = await supabase
    .from("broadcasts")
    .select("id,title,status,channels,scheduled_for,sent_at,created_at,payload")
    .eq("scope", "club")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(20);

  const ids = (broadcasts ?? []).map((b) => b.id as string);
  const reachByBroadcast = new Map<string, number>();
  let monthRecipientsCount = 0;
  if (ids.length > 0) {
    const { data: recipients } = await supabase
      .from("broadcast_recipients")
      .select("broadcast_id")
      .in("broadcast_id", ids);
    for (const r of recipients ?? []) {
      const bid = r.broadcast_id as string;
      reachByBroadcast.set(bid, (reachByBroadcast.get(bid) ?? 0) + 1);
    }
    for (const b of broadcasts ?? []) {
      const sentAt = b.sent_at as string | null;
      if (sentAt && new Date(sentAt) >= monthStart) {
        monthRecipientsCount += reachByBroadcast.get(b.id as string) ?? 0;
      }
    }
  }

  // Sort: defaults seedeadas (payload.default_key presente) van primero
  // para que el owner vea ejemplos al toque; el resto en orden de creación
  // descendente.
  const sorted = [...(broadcasts ?? [])].sort((a, b) => {
    const aDef = (a.payload as CampaignPayload | null)?.tag != null ? 1 : 0;
    const bDef = (b.payload as CampaignPayload | null)?.tag != null ? 1 : 0;
    if (aDef !== bDef) return bDef - aDef;
    return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime();
  });
  const top3 = sorted.slice(0, 3);
  const campaigns: CampaignCard[] = top3.map((b, i) => {
    const status = (b.status as string) ?? "draft";
    const meta = STATUS_TAG[status] ?? STATUS_TAG.draft;
    const channels = (b.channels as string[] | null) ?? ["inapp"];
    const channelKind = CHANNEL_META[channels[0]]?.label ?? "Campaña";
    const reach = reachByBroadcast.get(b.id as string) ?? 0;
    const payload = (b.payload as CampaignPayload | null) ?? {};
    return {
      id: b.id as string,
      n: (b.title as string) ?? "Sin título",
      kind: payload.kind ?? channelKind,
      code: payload.code ?? (b.id as string).slice(0, 8).toUpperCase(),
      uses: payload.uses ?? reach,
      max: payload.max ?? Math.max(reach, 100),
      end: payload.end ?? fmtDate((b.scheduled_for as string | null) ?? (b.sent_at as string | null)),
      img: payload.bg ?? PROMO_BGS[i % PROMO_BGS.length],
      tag: payload.tag ?? meta.tag,
      accent: payload.accent ?? meta.accent,
    };
  });

  // Distribución de canales: contar cuántas broadcasts del mes usan cada canal,
  // ponderado por destinatarios alcanzados.
  const channelCounts = new Map<string, number>();
  for (const b of broadcasts ?? []) {
    const sentAt = b.sent_at as string | null;
    if (!sentAt || new Date(sentAt) < monthStart) continue;
    const reach = reachByBroadcast.get(b.id as string) ?? 0;
    const chs = (b.channels as string[] | null) ?? ["inapp"];
    for (const c of chs) {
      channelCounts.set(c, (channelCounts.get(c) ?? 0) + reach);
    }
  }
  const totalChannel = Array.from(channelCounts.values()).reduce((s, v) => s + v, 0);
  const channels: ChannelStat[] = Array.from(channelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code, count]) => {
      const meta = CHANNEL_META[code] ?? { label: code, color: "var(--primary)", icon: "bell" };
      return {
        code,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        value: count.toLocaleString("en-US"),
        pct: totalChannel > 0 ? Math.round((count / totalChannel) * 100) : 0,
      };
    });

  const sentCount = (broadcasts ?? []).filter((b) => b.status === "sent").length;

  return {
    clubId,
    clubName,
    campaigns,
    reachMonth: monthRecipientsCount,
    sentCount,
    channels,
  };
}

export async function ClubMarketingScreen() {
  const data = await loadData();
  return <ClubMarketingScreenView data={data} />;
}
