// Server: fetch conversations + messages de la activa (selected via ?conv=).
// El send + realtime quedan para una tanda dedicada.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { MensajesScreenView, type ConvoLite, type MessageLite } from "./MensajesScreenView";

const MAX_MESSAGES = 60;

async function loadData(activeConvId: string | null) {
  const session = await getSession();
  const supabase = await getServerClient();

  if (!session.authenticated) {
    return { convos: [], messages: [], activeConv: null, meUserId: null };
  }

  const userId = session.session.userId;

  // Conversations the user is a member of. Limit defensivo a 100 convs
  // activas: el UI no muestra más y la query downstream multiplica por N.
  const { data: members } = await supabase
    .from("conversation_members")
    .select("conversation_id,last_read_message_id")
    .eq("user_id", userId)
    .is("left_at", null)
    .limit(100);

  const convIds = (members ?? []).map((m) => m.conversation_id as string);
  if (convIds.length === 0) {
    return { convos: [], messages: [], activeConv: null, meUserId: userId };
  }

  // Conversations + last message + member count.
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id,kind,title,club_id,last_message_at,created_by")
    .in("id", convIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  // For DMs, find the "other" user per convo.
  const { data: allMembers } = await supabase
    .from("conversation_members")
    .select("conversation_id,user_id")
    .in("conversation_id", convIds)
    .is("left_at", null);

  const membersByConv = new Map<string, string[]>();
  for (const m of allMembers ?? []) {
    const cid = m.conversation_id as string;
    const arr = membersByConv.get(cid) ?? [];
    arr.push(m.user_id as string);
    membersByConv.set(cid, arr);
  }

  const allOtherIds = new Set<string>();
  for (const ids of membersByConv.values()) {
    for (const id of ids) if (id !== userId) allOtherIds.add(id);
  }

  const { data: profileRows } =
    allOtherIds.size > 0
      ? await supabase
          .from("profiles")
          .select("id,display_name,city,is_system")
          .in("id", [...allOtherIds])
      : { data: [] };
  // Cast por stale types (is_system se agregó en migration 104).
  const profileMap = new Map(
    ((profileRows ?? []) as unknown as Array<{
      id: string;
      display_name: string | null;
      city: string | null;
      is_system: boolean | null;
    }>).map((p) => [p.id, p]),
  );

  // Last message preview per conversation.
  const { data: lastMessages } = await supabase
    .from("messages")
    .select("id,conversation_id,sender_id,body,kind,created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(convIds.length * 3); // best-effort window

  const seenConv = new Set<string>();
  const lastByConv = new Map<string, { id: string; body: string | null; sender_id: string; created_at: string }>();
  for (const m of lastMessages ?? []) {
    const cid = m.conversation_id as string;
    if (seenConv.has(cid)) continue;
    seenConv.add(cid);
    lastByConv.set(cid, {
      id: m.id as string,
      body: (m.body as string | null) ?? null,
      sender_id: m.sender_id as string,
      created_at: m.created_at as string,
    });
  }

  // Unread counts: RPC fn_unread_messages_count devuelve unread por
  // conversación en 1 sola query (ver migration 100). Antes era N+1.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: unreadRows } = await (supabase as any).rpc("fn_unread_messages_count");
  const unreadByConv = new Map<string, number>(
    ((unreadRows as Array<{ conversation_id: string; unread_count: number }> | null) ?? [])
      .map((r) => [r.conversation_id, r.unread_count]),
  );

  const convos: ConvoLite[] = (conversations ?? []).map((c) => {
    const cid = c.id as string;
    const otherIds = (membersByConv.get(cid) ?? []).filter((id) => id !== userId);
    const isGroup = c.kind === "group" || c.kind === "club_channel";
    const isSystem = c.kind === "support" || c.kind === "club_channel";
    let name = (c.title as string | null) ?? "";
    if (!name && !isGroup && otherIds[0]) {
      const p = profileMap.get(otherIds[0]);
      name = (p?.display_name as string | undefined) ?? "Conversación";
    }
    if (!name) name = isGroup ? "Grupo" : "Conversación";

    const last = lastByConv.get(cid);
    // Si el "otro" del DM es el perfil oficial MatchPoint, marcamos isOfficial
    // para badge verified + pin top en MensajesScreenView.
    const otherProfile = otherIds[0] ? profileMap.get(otherIds[0]) : undefined;
    const isOfficial = otherProfile?.is_system === true;
    return {
      id: cid,
      name,
      kind: c.kind as ConvoLite["kind"],
      isGroup,
      isSystem,
      isOfficial,
      memberCount: (membersByConv.get(cid) ?? []).length,
      lastBody: last?.body ?? null,
      lastSenderId: last?.sender_id ?? null,
      lastAt: last?.created_at ?? (c.last_message_at as string | null) ?? null,
      unreadCount: unreadByConv.get(cid) ?? 0,
      otherUserId: otherIds[0] ?? null,
    };
  });

  // Pin del DM MatchPoint al top de la lista.
  convos.sort((a, b) => {
    if (a.isOfficial && !b.isOfficial) return -1;
    if (b.isOfficial && !a.isOfficial) return 1;
    return 0;
  });

  const activeId = activeConvId && convIds.includes(activeConvId) ? activeConvId : convos[0]?.id ?? null;
  let messages: MessageLite[] = [];
  if (activeId) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("id,sender_id,body,kind,created_at")
      .eq("conversation_id", activeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES);
    messages = (msgRows ?? []).map((m) => ({
      id: m.id as string,
      senderId: m.sender_id as string,
      body: (m.body as string | null) ?? "",
      kind: m.kind as string,
      createdAt: m.created_at as string,
    }));
  }

  const activeConv = convos.find((c) => c.id === activeId) ?? null;

  // Si la conversación activa es de un partido, traemos el estado del match
  // para renderizar el action-bar (cancelar/reprogramar). El user es miembro
  // de la conversación ⇒ participante del match (trigger mig 118).
  let activeMatch:
    | {
        matchId: string;
        status: string;
        playedAt: string;
        reliabilityEnabled: boolean;
        matchTimePassed: boolean;
        others: { id: string; name: string }[];
      }
    | null = null;
  if (activeConv?.kind === "match" && activeId) {
    // match_id de conversations no está en los Database types (mig 118) → loose.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convRow } = await (supabase as any)
      .from("conversations")
      .select("match_id")
      .eq("id", activeId)
      .maybeSingle();
    const matchId = (convRow as { match_id?: string | null } | null)?.match_id ?? null;
    if (matchId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: m } = await (supabase as any)
        .from("matches")
        .select("id,status,played_at,team_a_player_ids,team_b_player_ids")
        .eq("id", matchId)
        .maybeSingle();
      if (m) {
        const allPlayers: string[] = [
          ...((m.team_a_player_ids as string[] | null) ?? []),
          ...((m.team_b_player_ids as string[] | null) ?? []),
        ];
        const otherIds = allPlayers.filter((id) => id !== userId);
        // Nombres de los otros participantes (para el botón de inasistencia).
        const { data: oProfiles } = otherIds.length
          ? await supabase.from("profiles").select("id,display_name").in("id", otherIds)
          : { data: [] as { id: string; display_name: string | null }[] };
        const nameById = new Map(
          ((oProfiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]),
        );
        // Flag de fiabilidad (gate del reporte de inasistencias).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: flags } = await (supabase as any).rpc("fn_my_effective_flags");
        const reliabilityEnabled = ((flags ?? []) as { key: string; enabled: boolean }[]).some(
          (f) => f.key === "match_reliability_enabled" && f.enabled,
        );
        activeMatch = {
          matchId: m.id,
          status: m.status,
          playedAt: m.played_at,
          reliabilityEnabled,
          matchTimePassed: new Date(m.played_at as string).getTime() < Date.now(),
          others: otherIds.map((id) => ({ id, name: nameById.get(id) ?? "Jugador" })),
        };
      }
    }
  }

  return { convos, messages, activeConv, activeMatch, meUserId: userId };
}

export async function MensajesScreen({
  searchParams,
}: {
  searchParams?: Promise<{ conv?: string }>;
} = {}) {
  const params = (await searchParams) ?? {};
  const data = await loadData(params.conv ?? null);
  return <MensajesScreenView {...data} />;
}
