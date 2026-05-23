// Server: carga las campañas REALES (broadcasts scope=platform) + conteo de
// destinatarios, y alimenta el rediseño AdminBroadcastView. El composer envía de
// verdad (createBroadcast/dispatchBroadcast) y el canal Banner publica anuncios.
// Funnel de aperturas/clicks queda demo (sin tracking aún). Ver 04-placeholders.md.
import { getServerClient } from "@/lib/db/client.server";
import { listBroadcasts } from "@/server/actions/marketing";
import { AdminBroadcastView, type BroadcastData } from "./AdminBroadcastView";

function kindFromChannels(channels: string[]): "push" | "email" | "in-app" {
  const c = channels?.[0];
  if (c === "push") return "push";
  if (c === "email") return "email";
  return "in-app";
}

function audienceSummary(tf: Record<string, unknown>): string {
  const parts: string[] = [];
  if (tf.city) parts.push(String(tf.city));
  if (tf.sport) parts.push(String(tf.sport));
  if (tf.plan === "premium") parts.push("MP+");
  if (tf.role === "owner") parts.push("Owners");
  return parts.length ? parts.join(" · ") : "Todos los usuarios";
}

function relWhen(status: string, sentAt: string | null, scheduledFor: string | null): string {
  if (status === "sent" || status === "sending") {
    if (!sentAt) return "enviada";
    const d = Math.floor((Date.now() - new Date(sentAt).getTime()) / 86400000);
    return d < 1 ? "hoy" : `hace ${d}d`;
  }
  if (status === "scheduled" && scheduledFor) {
    return new Date(scheduledFor).toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  return "borrador";
}

async function loadData(): Promise<BroadcastData> {
  const res = await listBroadcasts({ scope: "platform", limit: 50 });
  const broadcasts = (res.ok ? res.data : []).filter((b) => b.status !== "cancelled");

  const ids = broadcasts.map((b) => b.id);
  const recCount = new Map<string, number>();
  const openCount = new Map<string, number>();
  if (ids.length > 0) {
    const supabase = await getServerClient();
    const { data } = await supabase.from("broadcast_recipients").select("broadcast_id,opened_at").in("broadcast_id", ids);
    for (const r of (data ?? []) as unknown as { broadcast_id: string; opened_at: string | null }[]) {
      recCount.set(r.broadcast_id, (recCount.get(r.broadcast_id) ?? 0) + 1);
      if (r.opened_at) openCount.set(r.broadcast_id, (openCount.get(r.broadcast_id) ?? 0) + 1);
    }
  }

  const campaigns = broadcasts.map((b) => {
    const recipients = recCount.get(b.id) ?? null;
    const sentLike = b.status === "sent" || b.status === "sending";
    const st: "sent" | "scheduled" | "draft" = sentLike ? "sent" : b.status === "scheduled" ? "scheduled" : "draft";
    return {
      id: b.id,
      kind: kindFromChannels(b.channels as string[]),
      t: b.title,
      audience: audienceSummary((b.targetFilter ?? {}) as Record<string, unknown>),
      reach: recipients,
      sent: sentLike ? recipients : null,
      opened: sentLike ? openCount.get(b.id) ?? 0 : null,
      clicked: null,
      converted: null,
      when: relWhen(b.status, b.sentAt, b.scheduledFor),
      st,
    };
  });

  // Plantillas reales (mig 163).
  const supabase2 = await getServerClient();
  const { data: tpls } = await supabase2
    .from("broadcast_templates")
    .select("id,name,channel,title,body,cta_label,target_filter,uses")
    .order("created_at", { ascending: false })
    .limit(24);
  const templates = (tpls ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    channel: (t.channel as string) ?? "inapp",
    title: (t.title as string) ?? "",
    body: (t.body as string) ?? "",
    ctaLabel: (t.cta_label as string | null) ?? null,
    targetFilter: (t.target_filter ?? {}) as Record<string, unknown>,
    uses: (t.uses as number) ?? 0,
  }));

  return { campaigns, templates };
}

export async function AdminBroadcastScreenServer() {
  const data = await loadData();
  return <AdminBroadcastView data={data} />;
}
