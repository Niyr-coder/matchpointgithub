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

  // Conversations the user is a member of.
  const { data: members } = await supabase
    .from("conversation_members")
    .select("conversation_id,last_read_message_id")
    .eq("user_id", userId)
    .is("left_at", null);

  const convIds = (members ?? []).map((m) => m.conversation_id as string);
  if (convIds.length === 0) {
    return { convos: [], messages: [], activeConv: null, meUserId: userId };
  }

  const lastReadMap = new Map(
    (members ?? []).map((m) => [m.conversation_id as string, m.last_read_message_id as string | null]),
  );

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
          .select("id,display_name,city")
          .in("id", [...allOtherIds])
      : { data: [] };
  const profileMap = new Map((profileRows ?? []).map((p) => [p.id as string, p]));

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

  // ── Unread counts: 1 query para timestamps de last_read + N counts en paralelo.
  // No contamos mensajes propios. Para convs sin last_read, contamos todo.
  const lastReadIds = [...lastReadMap.values()].filter((x): x is string => !!x);
  const lastReadTs = new Map<string, string>();
  if (lastReadIds.length > 0) {
    const { data: lrRows } = await supabase
      .from("messages")
      .select("id,created_at")
      .in("id", lastReadIds);
    for (const r of lrRows ?? []) {
      lastReadTs.set(r.id as string, r.created_at as string);
    }
  }

  const unreadEntries = await Promise.all(
    convIds.map(async (cid) => {
      const lrId = lastReadMap.get(cid);
      let q = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", cid)
        .is("deleted_at", null)
        .neq("sender_id", userId);
      if (lrId) {
        const ts = lastReadTs.get(lrId);
        if (ts) q = q.gt("created_at", ts);
      }
      const { count } = await q;
      return [cid, count ?? 0] as const;
    }),
  );
  const unreadByConv = new Map(unreadEntries);

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
    return {
      id: cid,
      name,
      kind: c.kind as ConvoLite["kind"],
      isGroup,
      isSystem,
      memberCount: (membersByConv.get(cid) ?? []).length,
      lastBody: last?.body ?? null,
      lastSenderId: last?.sender_id ?? null,
      lastAt: last?.created_at ?? (c.last_message_at as string | null) ?? null,
      unreadCount: unreadByConv.get(cid) ?? 0,
      otherUserId: otherIds[0] ?? null,
    };
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
  return { convos, messages, activeConv, meUserId: userId };
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
