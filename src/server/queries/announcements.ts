import "server-only";

// Lee el anuncio global activo (banner que ve todo el mundo). Lo usa el layout
// del dashboard. Respeta ventana de fechas (starts_at/ends_at). Uno a la vez.
import { getServerClient } from "@/lib/db/client.server";

export type ActiveAnnouncement = {
  message: string;
  level: "info" | "warn" | "critical";
  ctaLabel: string | null;
  ctaHref: string | null;
};

export async function getActiveAnnouncement(): Promise<ActiveAnnouncement | null> {
  const supabase = await getServerClient();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("announcements")
    .select("message,level,cta_label,cta_href,starts_at,ends_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(5);
  const row = (data ?? []).find(
    (r) => (!r.starts_at || (r.starts_at as string) <= nowIso) && (!r.ends_at || (r.ends_at as string) > nowIso),
  );
  if (!row) return null;
  return {
    message: row.message as string,
    level: ((row.level as string) ?? "info") as "info" | "warn" | "critical",
    ctaLabel: (row.cta_label as string | null) ?? null,
    ctaHref: (row.cta_href as string | null) ?? null,
  };
}
