import { getBrowserClient } from "@/lib/db/client.browser";
import type { ThreadMessage } from "@/server/actions/messaging";

function mapRow(row: Record<string, unknown>): ThreadMessage {
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    body: (row.body as string | null) ?? "",
    kind: (row.kind as string) ?? "text",
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Lectura directa del hilo vía Supabase browser (RLS). Evita round-trip de server action. */
export async function fetchConversationMessagesClient(
  conversationId: string,
  limit = 80,
): Promise<{ ok: true; messages: ThreadMessage[] } | { ok: false; message: string }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id,sender_id,body,kind,payload,created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return { ok: false, message: error.message };
  const messages = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  return { ok: true, messages };
}

/** Insert directo (RLS). Evita server action → sin "Rendering" de Next al enviar. */
export async function sendMessageClient(input: {
  conversationId: string;
  body: string;
  kind?: string;
}): Promise<{ ok: true; message: ThreadMessage } | { ok: false; message: string }> {
  const supabase = getBrowserClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { ok: false, message: authErr?.message ?? "No autenticado" };

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      body: input.body,
      kind: input.kind ?? "text",
      payload: null,
    } as never)
    .select("id,sender_id,body,kind,payload,created_at")
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: mapRow(data as Record<string, unknown>) };
}

export async function markConversationReadClient(
  conversationId: string,
  lastMessageId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = getBrowserClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { ok: false, message: authErr?.message ?? "No autenticado" };

  const { error } = await supabase
    .from("conversation_members")
    .update({ last_read_message_id: lastMessageId } as never)
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
