import { getBrowserClient } from "@/lib/db/client.browser";
import type { ConvoLite } from "@/lib/messaging/convo-lite";

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  is_system: boolean | null;
};

type LastMsgRow = {
  conversation_id: string;
  message_id: string;
  body: string | null;
  sender_id: string;
  created_at: string;
};

/** Inbox completo desde el browser (paralelo). Alternativa rápida al server action inicial. */
export async function fetchConversationListClient(
  userId: string,
): Promise<{ ok: true; convos: ConvoLite[] } | { ok: false; message: string }> {
  const supabase = getBrowserClient();

  const { data: members, error: memberErr } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("left_at", null)
    .limit(100);

  if (memberErr) return { ok: false, message: memberErr.message };

  const convIds = (members ?? []).map((m) => m.conversation_id as string);
  if (convIds.length === 0) return { ok: true, convos: [] };

  const [
    { data: conversations, error: convErr },
    { data: allMembers, error: membersErr },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unreadRes,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastRes,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("id,kind,title,last_message_at,match_id,quedada_id")
      .in("id", convIds)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("conversation_members")
      .select("conversation_id,user_id")
      .in("conversation_id", convIds)
      .is("left_at", null),
    (supabase as any).rpc("fn_unread_messages_count"),
    (supabase as any).rpc("fn_last_messages_by_conversations", { p_conv_ids: convIds }),
  ]);

  if (convErr) return { ok: false, message: convErr.message };
  if (membersErr) return { ok: false, message: membersErr.message };

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

  const matchIds = (conversations ?? [])
    .map((c) => c.match_id as string | null)
    .filter((id): id is string => !!id);

  const quedadaIds = (conversations ?? [])
    .map((c) => c.quedada_id)
    .filter((id): id is string => !!id);

  const [{ data: profileRows }, matchRowsRes, quedadaRowsRes] = await Promise.all([
    allOtherIds.size > 0
      ? supabase
          .from("profiles")
          .select("id,display_name,username,is_system")
          .in("id", [...allOtherIds])
      : Promise.resolve({ data: [] as ProfileRow[] }),
    matchIds.length > 0
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("matches")
          .select("id,status,played_at,mode,team_a_player_ids,team_b_player_ids")
          .in("id", matchIds)
      : Promise.resolve({ data: [] }),
    quedadaIds.length > 0
      ? supabase
          .from("quedadas")
          .select("id,status,starts_at,location_text")
          .in("id", quedadaIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const matchById = new Map<
    string,
    {
      status: string;
      playedAt: string;
      mode: "singles" | "doubles";
      opponentName: string | null;
    }
  >();

  for (const m of (matchRowsRes.data ?? []) as Array<{
    id: string;
    status: string;
    played_at: string;
    mode: "singles" | "doubles";
    team_a_player_ids: string[];
    team_b_player_ids: string[];
  }>) {
    const rivalIds = [...m.team_a_player_ids, ...m.team_b_player_ids].filter((id) => id !== userId);
    const rivalNames = rivalIds
      .map((id) => profileMap.get(id)?.display_name?.trim())
      .filter((n): n is string => !!n);
    let opponentName: string | null = null;
    if (rivalNames.length === 1) opponentName = rivalNames[0];
    else if (rivalNames.length === 2) opponentName = `${rivalNames[0]} y ${rivalNames[1]}`;
    else if (rivalNames.length > 2) opponentName = `${rivalNames[0]} +${rivalNames.length - 1}`;

    matchById.set(m.id, {
      status: m.status,
      playedAt: m.played_at,
      mode: m.mode,
      opponentName,
    });
  }

  const quedadaById = new Map<
    string,
    { status: string; startsAt: string | null; locationText: string | null }
  >();
  for (const q of (quedadaRowsRes.data ?? []) as Array<{
    id: string;
    status: string;
    starts_at: string;
    location_text: string | null;
  }>) {
    quedadaById.set(q.id, {
      status: q.status,
      startsAt: q.starts_at ?? null,
      locationText: q.location_text ?? null,
    });
  }

  const lastByConv = new Map<string, LastMsgRow>();
  if (!lastRes.error) {
    for (const row of (lastRes.data ?? []) as LastMsgRow[]) {
      lastByConv.set(row.conversation_id, row);
    }
  } else {
    const { data: fallbackMsgs } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .in("conversation_id", convIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(convIds.length * 2, 120));
    const seen = new Set<string>();
    for (const m of fallbackMsgs ?? []) {
      const cid = m.conversation_id as string;
      if (seen.has(cid)) continue;
      seen.add(cid);
      lastByConv.set(cid, {
        conversation_id: cid,
        message_id: m.id as string,
        body: (m.body as string | null) ?? null,
        sender_id: m.sender_id as string,
        created_at: m.created_at as string,
      });
    }
  }

  const unreadByConv = new Map<string, number>(
    ((unreadRes.data ?? []) as Array<{ conversation_id: string; unread_count: number }>).map(
      (r) => [r.conversation_id, r.unread_count],
    ),
  );

  const convos: ConvoLite[] = (conversations ?? []).map((c) => {
    const cid = c.id as string;
    const otherIds = (membersByConv.get(cid) ?? []).filter((id) => id !== userId);
    const isGroup =
      c.kind === "group" || c.kind === "club_channel" || c.kind === "team_channel" || c.kind === "quedada";
    const isSystem = c.kind === "support" || c.kind === "club_channel";
    let name = (c.title as string | null) ?? "";
    if (!name && !isGroup && otherIds[0]) {
      name = profileMap.get(otherIds[0])?.display_name ?? "Conversación";
    }
    if (!name) name = isGroup ? "Grupo" : "Conversación";

    const last = lastByConv.get(cid);
    const otherProfile = otherIds[0] ? profileMap.get(otherIds[0]) : undefined;
    const matchId = (c.match_id as string | null) ?? null;
    const matchRow = matchId ? matchById.get(matchId) : undefined;
    const quedadaId = c.quedada_id ?? null;
    const quedadaRow = quedadaId ? quedadaById.get(quedadaId) : undefined;

    return {
      id: cid,
      name,
      kind: c.kind as ConvoLite["kind"],
      isGroup,
      isSystem,
      isOfficial: otherProfile?.is_system === true,
      memberCount: (membersByConv.get(cid) ?? []).length,
      lastBody: last?.body ?? null,
      lastSenderId: last?.sender_id ?? null,
      lastAt: last?.created_at ?? (c.last_message_at as string | null) ?? null,
      unreadCount: unreadByConv.get(cid) ?? 0,
      otherUserId: otherIds[0] ?? null,
      otherUsername: otherProfile?.username ?? null,
      matchSummary: matchRow
        ? {
            status: matchRow.status,
            playedAt: matchRow.playedAt,
            mode: matchRow.mode,
            opponentName: matchRow.opponentName,
            clubName: null,
            courtName: null,
          }
        : null,
      quedadaSummary: quedadaRow
        ? {
            status: quedadaRow.status,
            startsAt: quedadaRow.startsAt,
            locationText: quedadaRow.locationText,
          }
        : null,
    };
  });

  convos.sort((a, b) => {
    const ta = a.lastAt ? +new Date(a.lastAt).getTime() : 0;
    const tb = b.lastAt ? +new Date(b.lastAt).getTime() : 0;
    return tb - ta;
  });

  return { ok: true, convos };
}
