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
    const [
      { data: convs },
      { data: allMembers },
      { data: lastMessages },
      { data: unreadRows },
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
      supabase
        .from("messages")
        .select("conversation_id,id")
        .in("conversation_id", convIds)
        .is("deleted_at", null),
    ]);

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

    const lastReadByConv = new Map<string, string | null>();
    for (const m of memberships ?? []) {
      lastReadByConv.set(
        m.conversation_id as string,
        (m.last_read_message_id as string | null) ?? null,
      );
    }
    const allMsgsByConv = new Map<string, string[]>();
    for (const r of unreadRows ?? []) {
      const arr = allMsgsByConv.get(r.conversation_id as string) ?? [];
      arr.push(r.id as string);
      allMsgsByConv.set(r.conversation_id as string, arr);
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
      const allMsgIds = allMsgsByConv.get(convId) ?? [];
      const lastReadId = lastReadByConv.get(convId);
      // Unread = messages whose id is after lastReadId. Since we don't have a
      // numeric ordinal, we approximate by counting messages whose created_at >
      // the last_read marker. For a simple MVP we approximate: if there's no
      // lastReadId, count everything not from me as unread.
      let unread = 0;
      if (!lastReadId) {
        unread = lastMsgRow && lastMsgRow.sender_id !== userId ? 1 : 0;
      } else {
        const idx = allMsgIds.indexOf(lastReadId);
        unread = idx === -1 ? 0 : idx; // newer messages came after lastRead in the ordered list
      }

      const memberIds = (membersByConv.get(convId) ?? []).filter((id) => id !== userId);
      const members = memberIds.map((id) => ({
        userId: id,
        displayName: (profileById.get(id)?.display_name as string) ?? "—",
        avatarUrl: (profileById.get(id)?.avatar_url as string | null) ?? null,
      }));

      return ConversationSummarySchema.parse({
        conversation: mapConv(c),
        lastMessage: lastMsgRow ? mapMessage(lastMsgRow) : null,
        unreadCount: unread,
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
    if (error) throw new MpError("MESSAGING.CREATE_FAILED", error.message, 500);

    const memberRows = [userId, ...data.memberIds.filter((id) => id !== userId)].map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
      role: uid === userId ? "admin" : "member",
    }));
    await supabase
      .from("conversation_members")
      .insert(memberRows as never, { defaultToNull: false });

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
