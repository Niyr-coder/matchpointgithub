import { getAdminClient } from "@/lib/db/client.admin";

const SEED_FEED: {
  seedKey: string;
  kind: string;
  badge: string;
  title: string;
  body: string;
  ctaLabel?: string;
  hoursAgo: number;
}[] = [
  {
    seedKey: "handoff_p1",
    kind: "giveaway",
    badge: "GIVEAWAY",
    title: "¡Sorteamos un paddle Selkirk Vanguard!",
    body: "Una semana para entrar. Sigue al club + reserva una hora cualquiera este mes. Sorteo en vivo el 30 de junio.",
    ctaLabel: "Participar",
    hoursAgo: 2,
  },
  {
    seedKey: "handoff_p2",
    kind: "event",
    badge: "TORNEO",
    title: "Verano Open · Singles · 14 jun",
    body: "Inscripciones abiertas hasta el viernes. 32 cupos. Premio: $300 + medalla + ranking +50.",
    ctaLabel: "Inscribirme",
    hoursAgo: 5,
  },
  {
    seedKey: "handoff_p3",
    kind: "result",
    badge: "RESULTADO",
    title: "Final dramática de la liga Mayo",
    body: "Lucía Vélez se queda con la liga después de 8 jornadas invicta. Felicitaciones desde toda la comunidad.",
    hoursAgo: 26,
  },
  {
    seedKey: "handoff_p4",
    kind: "photo",
    badge: "FOTO",
    title: "5am en el club",
    body: "Las canchas vacías antes del primer turno. La hora más linda del día.",
    hoursAgo: 72,
  },
  {
    seedKey: "handoff_p5",
    kind: "notice",
    badge: "AVISO",
    title: "Cierre técnico · canchas 5 y 6",
    body: "Mantenimiento de piso. Sábado 25 de mayo, 9am–3pm. El resto de canchas operan normal.",
    hoursAgo: 168,
  },
  {
    seedKey: "handoff_p6",
    kind: "spotlight",
    badge: "SPOTLIGHT",
    title: "Conoce a Mateo Rivas",
    body: "De #84 a top 10 del club en tres meses. Su rutina, sus paddles, y por qué llegó al pickleball desde el squash.",
    hoursAgo: 216,
  },
];

const SEED_GIVEAWAYS: {
  seedKey: string;
  title: string;
  subtitle: string;
  prizeLabel: string;
  description: string;
  closesInDays: number;
  closesInHours: number;
  totalEntryWeight: number;
  feedSeedKey: string;
}[] = [
  {
    seedKey: "handoff_gw1",
    title: "Paddle Selkirk Vanguard Pro",
    subtitle: "Edición Aniversario · valorado en $260",
    prizeLabel: "Paddle Selkirk Vanguard Pro",
    description:
      "Una semana para entrar. Sigue al club + reserva una hora cualquiera este mes. Sorteo en vivo el 30 de junio.",
    closesInDays: 4,
    closesInHours: 12,
    totalEntryWeight: 312,
    feedSeedKey: "handoff_p1",
  },
  {
    seedKey: "handoff_gw4",
    title: "Camiseta + Gorra Pickle Club",
    subtitle: "Kit merch edición limitada",
    prizeLabel: "Camiseta + Gorra Pickle Club",
    description: "Participa siguiendo al club. Sorteo al cierre del mes.",
    closesInDays: 18,
    closesInHours: 1,
    totalEntryWeight: 56,
    feedSeedKey: "handoff_p1",
  },
];

const DEFAULT_OPEN_HOURS: Record<string, { open: string; close: string }> = {
  monday: { open: "06:00", close: "22:00" },
  tuesday: { open: "06:00", close: "22:00" },
  wednesday: { open: "06:00", close: "22:00" },
  thursday: { open: "06:00", close: "22:00" },
  friday: { open: "06:00", close: "22:00" },
  saturday: { open: "06:00", close: "22:00" },
  sunday: { open: "06:00", close: "22:00" },
};

function isEmptyOpenHours(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true;
  return Object.keys(raw as object).length === 0;
}

async function resolvePublisherId(clubId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("role_assignments")
    .select("user_id")
    .eq("club_id", clubId)
    .in("role", ["owner", "manager"])
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

async function ensureAnnouncementConversation(clubId: string): Promise<string> {
  const admin = getAdminClient();
  const { data: rows, error: rpcErr } = await (admin as any).rpc("fn_ensure_club_channels", {
    p_club_id: clubId,
  });
  if (rpcErr) throw new Error(rpcErr.message);
  const annId = (rows?.[0]?.announcements_id as string | undefined) ?? null;
  if (annId) return annId;
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("club_id", clubId)
    .eq("kind", "club_announcements")
    .maybeSingle();
  if (conv?.id) return conv.id as string;
  throw new Error("Canal de anuncios no disponible");
}

async function ensureDefaultOpenHours(clubId: string): Promise<void> {
  const admin = getAdminClient();
  const { data: settings } = await admin
    .from("club_settings")
    .select("club_id,open_hours")
    .eq("club_id", clubId)
    .maybeSingle();

  if (!settings) {
    await admin.from("club_settings").insert({
      club_id: clubId,
      open_hours: DEFAULT_OPEN_HOURS,
    } as never);
    return;
  }

  if (isEmptyOpenHours(settings.open_hours)) {
    await admin
      .from("club_settings")
      .update({ open_hours: DEFAULT_OPEN_HOURS })
      .eq("club_id", clubId);
  }
}

async function ensureSeedFeedPosts(clubId: string, publisherId: string): Promise<void> {
  const admin = getAdminClient();
  const now = Date.now();

  for (const post of SEED_FEED) {
    const { data: existing } = await admin
      .from("club_feed_posts")
      .select("id")
      .eq("club_id", clubId)
      .eq("payload->>seed_key", post.seedKey)
      .maybeSingle();
    if (existing?.id) continue;

    const publishedAt = new Date(now - post.hoursAgo * 3_600_000).toISOString();
    await admin.from("club_feed_posts").insert({
      club_id: clubId,
      kind: post.kind,
      ref_id: null,
      title: post.title,
      body: post.body,
      media_url: null,
      badge: post.badge,
      cta_label: post.ctaLabel ?? null,
      cta_href: null,
      payload: { seed_key: post.seedKey },
      published_by: publisherId,
      published_at: publishedAt,
    } as never);
  }
}

async function ensureSeedGiveaways(clubId: string, publisherId: string): Promise<void> {
  const admin = getAdminClient();
  const convId = await ensureAnnouncementConversation(clubId);
  const now = Date.now();

  for (const gw of SEED_GIVEAWAYS) {
    const { data: existing } = await admin
      .from("club_giveaways")
      .select("id")
      .eq("club_id", clubId)
      .eq("title", gw.title)
      .maybeSingle();
    if (existing?.id) continue;

    const closesAt = new Date(now + gw.closesInDays * 86_400_000 + gw.closesInHours * 3_600_000).toISOString();
    const drawAt = new Date(now + (gw.closesInDays + 2) * 86_400_000).toISOString();
    const opensAt = new Date(now - 86_400_000).toISOString();

    const { data: feedPost } = await admin
      .from("club_feed_posts")
      .select("id")
      .eq("club_id", clubId)
      .eq("payload->>seed_key", gw.feedSeedKey)
      .maybeSingle();

    const { data: row, error } = await (admin as any)
      .from("club_giveaways")
      .insert({
        club_id: clubId,
        conversation_id: convId,
        created_by: publisherId,
        title: gw.title,
        subtitle: gw.subtitle,
        prize_label: gw.prizeLabel,
        description: gw.description,
        eligibility: "followers",
        status: "open",
        max_winners: 1,
        opens_at: opensAt,
        closes_at: closesAt,
        draw_at: drawAt,
        owner_type: "club",
        mechanics: [
          { kind: "follow", enabled: true, weight: 1 },
          { kind: "reserve", enabled: true, weight: 1 },
        ],
        rules: ["1 entrada por jugador que cumple todos los requisitos."],
        max_entries_per_user: 1,
        total_entry_weight: gw.totalEntryWeight,
        feed_post_id: feedPost?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !row) {
      console.error("[ensureClubProfileContent] giveaway seed failed:", gw.title, error?.message);
      continue;
    }

    const giveawayId = row.id as string;
    const ctaHref = `/dashboard/clubes/giveaways/${giveawayId}`;
    if (feedPost?.id) {
      await admin
        .from("club_feed_posts")
        .update({
          ref_id: giveawayId,
          cta_href: ctaHref,
        })
        .eq("id", feedPost.id);
    }
  }

  await backfillFeedGiveawayLinks(clubId);
}

/** Enlaza posts seedeados con sorteos ya existentes (reparación idempotente). */
async function backfillFeedGiveawayLinks(clubId: string): Promise<void> {
  const admin = getAdminClient();
  for (const gw of SEED_GIVEAWAYS) {
    const { data: giveaway } = await admin
      .from("club_giveaways")
      .select("id")
      .eq("club_id", clubId)
      .eq("title", gw.title)
      .maybeSingle();
    if (!giveaway?.id) continue;

    await admin
      .from("club_feed_posts")
      .update({
        ref_id: giveaway.id,
        cta_href: `/dashboard/clubes/giveaways/${giveaway.id}`,
      })
      .eq("club_id", clubId)
      .eq("payload->>seed_key", gw.feedSeedKey)
      .is("ref_id", null);
  }
}

/** Seed idempotente del contenido demo del handoff cuando el club está vacío. */
export async function ensureClubProfileContent(
  clubId: string,
  opts?: { seedGiveaways?: boolean },
): Promise<void> {
  const publisherId = await resolvePublisherId(clubId);
  if (!publisherId) return;

  await ensureDefaultOpenHours(clubId);
  await ensureSeedFeedPosts(clubId, publisherId);
  if (opts?.seedGiveaways !== false) {
    await ensureSeedGiveaways(clubId, publisherId);
  }
}
