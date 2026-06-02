"use server";

// Messaging Server Actions. Reads are RLS-filtered to conversation members.
// Writes (sendMessage/markRead) are also RLS-gated.
// Realtime channels publish CDC on `messages` — see docs/architecture/50-realtime.md.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { assertRateLimit, RATE_LIMITS } from "@/lib/api/ratelimit";
import {
  ConversationDetailSchema,
  ConversationSchema,
  ConversationSummarySchema,
  MarkReadSchema,
  MessageSchema,
  SendMessageSchema,
  StartConversationSchema,
  type Conversation,
  type ConversationDetail,
  type ConversationSummary,
  type Message,
} from "@/lib/schemas/messaging";
import { UuidSchema } from "@/lib/schemas/common";
import { readMatchPlannedMeta } from "@/lib/matches/planned-meta";

function mapConv(row: Record<string, unknown>): Conversation {
  return ConversationSchema.parse({
    id: row.id,
    kind: row.kind,
    title: row.title ?? null,
    clubId: (row.club_id as string | null) ?? null,
    createdBy: row.created_by,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    createdAt: row.created_at,
  });
}

function mapMessage(row: Record<string, unknown>): Message {
  return MessageSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body ?? null,
    kind: row.kind,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    replyToId: (row.reply_to_id as string | null) ?? null,
    editedAt: (row.edited_at as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
    createdAt: row.created_at,
  });
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

type ServerClient = Awaited<ReturnType<typeof getServerClient>>;

async function assertConversationWritable(
  supabase: ServerClient,
  conversationId: string,
  userId: string,
): Promise<void> {
  const { data: members, error: membersError } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null);
  if (membersError) throw new MpError("MESSAGING.DB_ERROR", membersError.message, 500);

  const otherMemberIds = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== userId);
  if (otherMemberIds.length === 0) return;

  // Los types generados pueden no incluir profiles.is_system en algunas ramas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: systemProfiles, error: profilesError } = await (supabase as any)
    .from("profiles")
    .select("id")
    .in("id", otherMemberIds)
    .eq("is_system", true)
    .limit(1);
  if (profilesError) throw new MpError("MESSAGING.DB_ERROR", profilesError.message, 500);

  if ((systemProfiles ?? []).length > 0) {
    throw new MpError(
      "MESSAGING.READ_ONLY",
      "Este canal oficial es solo informativo. Para soporte, usa la sección Soporte.",
      403,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: convRow, error: convErr } = await (supabase as any)
    .from("conversations")
    .select("kind,match_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) throw new MpError("MESSAGING.DB_ERROR", convErr.message, 500);

  const kind = (convRow as { kind?: string } | null)?.kind;
  const matchId = (convRow as { match_id?: string | null } | null)?.match_id ?? null;
  if (kind === "match" && matchId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matchRow, error: matchErr } = await (supabase as any)
      .from("matches")
      .select("status")
      .eq("id", matchId)
      .maybeSingle();
    if (matchErr) throw new MpError("MESSAGING.DB_ERROR", matchErr.message, 500);
    if ((matchRow as { status?: string } | null)?.status === "cancelled") {
      throw new MpError(
        "MESSAGING.READ_ONLY",
        "Este partido fue cancelado. El chat quedó cerrado.",
        403,
      );
    }
  }
}

// ── listMyConversations (with last message + unread count + members) ───
export async function listMyConversations(): Promise<ActionResult<ConversationSummary[]>> {
  return runAction(z.undefined(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    // 1. Find conversations I'm in.
    const { data: memberships, error: mErr } = await supabase
      .from("conversation_members")
      .select("conversation_id,last_read_message_id")
      .eq("user_id", userId)
      .is("left_at", null);
    if (mErr) throw new MpError("MESSAGING.DB_ERROR", mErr.message, 500);
    const convIds = (memberships ?? []).map((m) => m.conversation_id as string);
    if (convIds.length === 0) return [];

    // 2. Conversation rows + members + last message + unread count in parallel.
    // El unread sale del RPC canónico para mantener la misma cuenta que el
    // badge del layout y MensajesScreen.
    const [
      { data: convs },
      { data: allMembers },
      { data: lastMessages },
      { data: unreadRows, error: unreadErr },
    ] = await Promise.all([
      supabase
        .from("conversations")
        .select("*")
        .in("id", convIds)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("conversation_members")
        .select("conversation_id,user_id")
        .in("conversation_id", convIds)
        .is("left_at", null),
      supabase
        .from("messages")
        .select("*")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(convIds.length * 3),
      supabase.rpc("fn_unread_messages_count"),
    ]);
    if (unreadErr) throw new MpError("MESSAGING.DB_ERROR", unreadErr.message, 500);

    // Build helpers
    const otherUserIds = new Set<string>();
    for (const m of allMembers ?? []) otherUserIds.add(m.user_id as string);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url")
      .in("id", Array.from(otherUserIds));
    const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

    const lastByConv = new Map<string, Record<string, unknown>>();
    for (const m of lastMessages ?? []) {
      if (!lastByConv.has(m.conversation_id as string)) {
        lastByConv.set(m.conversation_id as string, m);
      }
    }

    const unreadByConv = new Map<string, number>();
    for (const r of unreadRows ?? []) {
      unreadByConv.set(r.conversation_id as string, Number(r.unread_count ?? 0));
    }

    const membersByConv = new Map<string, string[]>();
    for (const m of allMembers ?? []) {
      const arr = membersByConv.get(m.conversation_id as string) ?? [];
      arr.push(m.user_id as string);
      membersByConv.set(m.conversation_id as string, arr);
    }

    return (convs ?? []).map((c) => {
      const convId = c.id as string;
      const lastMsgRow = lastByConv.get(convId);

      const memberIds = (membersByConv.get(convId) ?? []).filter((id) => id !== userId);
      const members = memberIds.map((id) => ({
        userId: id,
        displayName: (profileById.get(id)?.display_name as string) ?? "—",
        avatarUrl: (profileById.get(id)?.avatar_url as string | null) ?? null,
      }));

      return ConversationSummarySchema.parse({
        conversation: mapConv(c),
        lastMessage: lastMsgRow ? mapMessage(lastMsgRow) : null,
        unreadCount: unreadByConv.get(convId) ?? 0,
        members,
      });
    });
  });
}

// ── getConversation (members + last N messages) ────────────────────────
const GetSchema = z.object({
  id: UuidSchema,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ThreadMessage = {
  id: string;
  senderId: string;
  body: string;
  kind: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type ThreadMatchContext = {
  matchId: string;
  status: string;
  playedAt: string;
  sport: string;
  mode: string;
  durationMin: number;
  clubId: string | null;
  clubName: string | null;
  courtId: string | null;
  courtName: string | null;
  plannedBestOf: number | null;
  reservationId: string | null;
  reservationStartsAt: string | null;
  reservationEndsAt: string | null;
  reservationStatus: string | null;
  reliabilityEnabled: boolean;
  matchTimePassed: boolean;
  others: { id: string; name: string }[];
};

export type ConversationThread = {
  messages: ThreadMessage[];
  activeMatch: ThreadMatchContext | null;
};

const LoadThreadSchema = z.object({
  conversationId: UuidSchema,
  limit: z.coerce.number().int().min(1).max(200).default(60),
  /** Si true, no consulta mensajes (el cliente ya los trae por Supabase directo). */
  skipMessages: z.boolean().optional(),
});

function mapThreadMessage(row: Record<string, unknown>): ThreadMessage {
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    body: (row.body as string | null) ?? "",
    kind: row.kind as string,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// Hilo de una conversación (mensajes + barra de partido). Usado al cambiar de chat
// en cliente sin recargar la página.
export async function loadConversationThread(
  input: unknown,
): Promise<ActionResult<ConversationThread>> {
  return runAction(LoadThreadSchema, input, async ({ conversationId, limit, skipMessages }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: membership, error: memberErr } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .is("left_at", null)
      .maybeSingle();
    if (memberErr) throw new MpError("MESSAGING.DB_ERROR", memberErr.message, 500);
    if (!membership) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "No eres miembro de esta conversación");
    }

    let messages: ThreadMessage[] = [];
    if (!skipMessages) {
      const { data: msgRows, error: msgErr } = await supabase
        .from("messages")
        .select("id,sender_id,body,kind,payload,created_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (msgErr) throw new MpError("MESSAGING.DB_ERROR", msgErr.message, 500);
      messages = ((msgRows ?? []) as Record<string, unknown>[]).map(mapThreadMessage);
    }

    let activeMatch: ThreadMatchContext | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convRow } = await (supabase as any)
      .from("conversations")
      .select("kind,match_id")
      .eq("id", conversationId)
      .maybeSingle();
    const kind = (convRow as { kind?: string } | null)?.kind;
    const matchId = (convRow as { match_id?: string | null } | null)?.match_id ?? null;

    if (kind === "match" && matchId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: m } = await (supabase as any)
        .from("matches")
        .select(
          "id,status,played_at,sport,mode,duration_min,club_id,court_id,score,team_a_player_ids,team_b_player_ids",
        )
        .eq("id", matchId)
        .maybeSingle();
      if (m) {
        const allPlayers: string[] = [
          ...((m.team_a_player_ids as string[] | null) ?? []),
          ...((m.team_b_player_ids as string[] | null) ?? []),
        ];
        const otherIds = allPlayers.filter((id) => id !== userId);
        const { data: oProfiles } = otherIds.length
          ? await supabase.from("profiles").select("id,display_name").in("id", otherIds)
          : { data: [] as { id: string; display_name: string | null }[] };
        const nameById = new Map(
          ((oProfiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [
            p.id,
            p.display_name,
          ]),
        );
        const clubId = (m.club_id as string | null) ?? null;
        const courtId = (m.court_id as string | null) ?? null;
        const [{ data: clubRow }, { data: courtRow }] = await Promise.all([
          clubId
            ? supabase.from("clubs").select("name").eq("id", clubId).maybeSingle()
            : Promise.resolve({ data: null }),
          courtId
            ? supabase.from("courts").select("name,code").eq("id", courtId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        const planned = readMatchPlannedMeta(m.score);
        let reservationStartsAt: string | null = null;
        let reservationEndsAt: string | null = null;
        let reservationStatus: string | null = null;
        if (planned.reservationId) {
          const { data: rsv } = await supabase
            .from("reservations")
            .select("during,status")
            .eq("id", planned.reservationId)
            .maybeSingle();
          if (rsv?.during) {
            const range = String(rsv.during);
            const parts = /^[\[(]([^,]+),([^)\]]+)[\)\]]$/.exec(range);
            if (parts) {
              reservationStartsAt = new Date(parts[1]).toISOString();
              reservationEndsAt = new Date(parts[2]).toISOString();
            }
            reservationStatus = (rsv.status as string) ?? null;
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: flags } = await (supabase as any).rpc("fn_my_effective_flags");
        const reliabilityEnabled = ((flags ?? []) as { key: string; enabled: boolean }[]).some(
          (f) => f.key === "match_reliability_enabled" && f.enabled,
        );
        const courtName =
          (courtRow?.name as string | null)?.trim() ||
          (courtRow?.code ? `Cancha ${courtRow.code as string}` : null);
        activeMatch = {
          matchId: m.id as string,
          status: m.status as string,
          playedAt: m.played_at as string,
          sport: m.sport as string,
          mode: m.mode as string,
          durationMin: (m.duration_min as number) ?? 60,
          clubId,
          clubName: (clubRow?.name as string | null) ?? null,
          courtId,
          courtName,
          plannedBestOf: planned.bestOf ?? null,
          reservationId: planned.reservationId ?? null,
          reservationStartsAt,
          reservationEndsAt,
          reservationStatus,
          reliabilityEnabled,
          matchTimePassed: new Date(m.played_at as string).getTime() < Date.now(),
          others: otherIds.map((id) => ({ id, name: nameById.get(id) ?? "Jugador" })),
        };
      }
    }

    return { messages, activeMatch };
  });
}

export async function getConversation(input: unknown): Promise<ActionResult<ConversationDetail>> {
  return runAction(GetSchema, input, async ({ id, limit }) => {
    const supabase = await getServerClient();
    const [{ data: conv, error }, { data: members }, { data: messages }] = await Promise.all([
      supabase.from("conversations").select("*").eq("id", id).single(),
      supabase.from("conversation_members").select("*").eq("conversation_id", id),
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);
    if (error || !conv) throw new MpError("MESSAGING.NOT_FOUND", "Conversation not found", 404);

    const detail: ConversationDetail = {
      conversation: mapConv(conv),
      members: (members ?? []).map((m) => ({
        userId: m.user_id as string,
        role: m.role as "member" | "admin",
        joinedAt: m.joined_at as string,
        leftAt: (m.left_at as string | null) ?? null,
        lastReadMessageId: (m.last_read_message_id as string | null) ?? null,
      })),
      messages: ((messages ?? []) as Record<string, unknown>[]).reverse().map(mapMessage),
    };
    return ConversationDetailSchema.parse(detail);
  });
}

// ── startConversation ──────────────────────────────────────────────────
export async function startConversation(input: unknown): Promise<ActionResult<Conversation>> {
  return runAction(StartConversationSchema, input, async (data) => {
    const userId = await requireUserId();
    await assertRateLimit({ key: `msg:start:${userId}`, ...RATE_LIMITS.mutationsAuthn });
    const supabase = await getServerClient();

    // DMs are uniquely defined by the 2 participants. Reuse existing.
    if (data.kind === "dm" && data.memberIds.length === 1) {
      const other = data.memberIds[0];
      const { data: mine } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", userId);
      const myConvIds = (mine ?? []).map((m) => m.conversation_id as string);
      if (myConvIds.length) {
        const { data: theirsInMine } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", other)
          .in("conversation_id", myConvIds);
        const matchIds = (theirsInMine ?? []).map((r) => r.conversation_id as string);
        if (matchIds.length) {
          const { data: dms } = await supabase
            .from("conversations")
            .select("*")
            .in("id", matchIds)
            .eq("kind", "dm")
            .limit(1);
          if (dms && dms[0]) return mapConv(dms[0]);
        }
      }
    }

    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({
        kind: data.kind,
        title: data.title ?? null,
        club_id: data.clubId ?? null,
        created_by: userId,
      } as never)
      .select()
      .single();
    if (error || !conv) {
      throw new MpError("MESSAGING.CREATE_FAILED", error?.message ?? "No se pudo crear la conversación", 500);
    }

    const memberRows = [userId, ...data.memberIds.filter((id) => id !== userId)].map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
      role: uid === userId ? "admin" : "member",
    }));
    const { error: membersErr } = await supabase
      .from("conversation_members")
      .insert(memberRows as never, { defaultToNull: false });
    if (membersErr) {
      throw new MpError("MESSAGING.MEMBERS_FAILED", membersErr.message, 500);
    }

    return mapConv(conv);
  });
}

// ── sendMessage ────────────────────────────────────────────────────────
const SendInputSchema = z.object({
  id: UuidSchema,
  body: SendMessageSchema,
});

export async function sendMessage(input: unknown): Promise<ActionResult<Message>> {
  return runAction(SendInputSchema, input, async ({ id, body }) => {
    const userId = await requireUserId();
    await assertRateLimit({ key: `msg:send:${userId}`, ...RATE_LIMITS.mutationsAuthn });
    const supabase = await getServerClient();
    await assertConversationWritable(supabase, id, userId);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        sender_id: userId,
        body: body.body,
        kind: body.kind,
        payload: body.payload ?? null,
        reply_to_id: body.replyToId ?? null,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "42501") {
        throw new AuthError("AUTH.ROLE_REQUIRED", "Not a member of this conversation");
      }
      throw new MpError("MESSAGING.SEND_FAILED", error.message, 500);
    }
    return mapMessage(data);
  });
}

// ── markRead ───────────────────────────────────────────────────────────
const MarkInputSchema = z.object({
  id: UuidSchema,
  body: MarkReadSchema,
});

export async function markRead(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(MarkInputSchema, input, async ({ id, body }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("conversation_members")
      .update({ last_read_message_id: body.lastMessageId } as never)
      .eq("conversation_id", id)
      .eq("user_id", userId);
    if (error) throw new MpError("MESSAGING.MARK_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
