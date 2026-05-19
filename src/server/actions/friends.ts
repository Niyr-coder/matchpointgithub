"use server";

// Friend graph: requests + accept + remove.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  FriendRequestSchema,
  FriendSchema,
  SendFriendRequestSchema,
  type Friend,
  type FriendRequest,
} from "@/lib/schemas/social";
import { UuidSchema } from "@/lib/schemas/common";
import { notify } from "@/server/notifications/dispatch";

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

// ── listMyFriends ──────────────────────────────────────────────────────
export async function listMyFriends(): Promise<ActionResult<Friend[]>> {
  return runAction(z.undefined(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("friendships")
      .select("user_a,user_b,since")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);
    if (error) throw new MpError("FRIENDS.DB_ERROR", error.message, 500);

    const friendIds = (data ?? []).map((f) =>
      (f.user_a === userId ? f.user_b : f.user_a) as string,
    );
    if (friendIds.length === 0) return [];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,city")
      .in("id", friendIds);
    const sinceById = new Map<string, string>();
    for (const f of data ?? []) {
      const fid = (f.user_a === userId ? f.user_b : f.user_a) as string;
      sinceById.set(fid, f.since as string);
    }
    return (profiles ?? []).map((p) =>
      FriendSchema.parse({
        userId: p.id,
        displayName: p.display_name,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        city: (p.city as string | null) ?? null,
        since: sinceById.get(p.id as string)!,
      }),
    );
  });
}

// ── listFriendRequests ─────────────────────────────────────────────────
const DirectionSchema = z.object({
  direction: z.enum(["incoming", "outgoing", "all"]).default("incoming"),
});

export async function listFriendRequests(input: unknown): Promise<ActionResult<FriendRequest[]>> {
  return runAction(DirectionSchema, input, async ({ direction }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    let q = supabase.from("friend_requests").select("*").eq("status", "pending");
    if (direction === "incoming") q = q.eq("to_user_id", userId);
    else if (direction === "outgoing") q = q.eq("from_user_id", userId);
    else q = q.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw new MpError("FRIENDS.DB_ERROR", error.message, 500);
    return (data ?? []).map((r) =>
      FriendRequestSchema.parse({
        id: r.id,
        fromUserId: r.from_user_id,
        toUserId: r.to_user_id,
        status: r.status,
        createdAt: r.created_at,
        respondedAt: (r.responded_at as string | null) ?? null,
      }),
    );
  });
}

// ── sendFriendRequest ──────────────────────────────────────────────────
export async function sendFriendRequest(input: unknown): Promise<ActionResult<FriendRequest>> {
  return runAction(SendFriendRequestSchema, input, async ({ toUserId }) => {
    const fromUserId = await requireUserId();
    if (fromUserId === toUserId) {
      throw new MpError("FRIENDS.SELF", "Cannot friend yourself", 422);
    }
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("friend_requests")
      .insert({ from_user_id: fromUserId, to_user_id: toUserId, status: "pending" } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("FRIENDS.ALREADY_REQUESTED", "Request already exists", 409);
      }
      throw new MpError("FRIENDS.REQUEST_FAILED", error.message, 500);
    }
    await notify({
      userId: toUserId,
      role: "user",
      kind: "friend_request_new",
      title: "Nueva solicitud de amistad",
      body: null,
      payload: { requestId: data.id, fromUserId },
    });

    return FriendRequestSchema.parse({
      id: data.id,
      fromUserId: data.from_user_id,
      toUserId: data.to_user_id,
      status: data.status,
      createdAt: data.created_at,
      respondedAt: null,
    });
  });
}

// ── acceptFriendRequest ────────────────────────────────────────────────
export async function acceptFriendRequest(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ requestId: UuidSchema }), input, async ({ requestId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: req, error: rErr } = await supabase
      .from("friend_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    if (rErr || !req) throw new MpError("FRIENDS.NOT_FOUND", "Request not found", 404);
    if (req.to_user_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only the recipient can accept");
    }
    if (req.status !== "pending") {
      throw new MpError(
        "FRIENDS.NOT_PENDING",
        `Request status is '${req.status}'`,
        409,
      );
    }

    const [a, b] = (req.from_user_id as string) < (req.to_user_id as string)
      ? [req.from_user_id, req.to_user_id]
      : [req.to_user_id, req.from_user_id];

    await supabase
      .from("friendships")
      .insert({ user_a: a, user_b: b } as never, { defaultToNull: false });
    await supabase
      .from("friend_requests")
      .update({ status: "accepted", responded_at: new Date().toISOString() } as never)
      .eq("id", requestId);
    return { ok: true as const };
  });
}

// ── rejectFriendRequest ────────────────────────────────────────────────
export async function rejectFriendRequest(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ requestId: UuidSchema }), input, async ({ requestId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("friend_requests")
      .update({ status: "rejected", responded_at: new Date().toISOString() } as never)
      .eq("id", requestId)
      .eq("to_user_id", userId);
    if (error) throw new MpError("FRIENDS.REJECT_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── removeFriend ───────────────────────────────────────────────────────
export async function removeFriend(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ userId: UuidSchema }), input, async ({ userId: other }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const [a, b] = userId < other ? [userId, other] : [other, userId];
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("user_a", a)
      .eq("user_b", b);
    if (error) throw new MpError("FRIENDS.REMOVE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── searchPlayers ──────────────────────────────────────────────────────
// Búsqueda global de jugadores por display_name. Excluye:
//   - el propio user
//   - perfiles is_system (MatchPoint oficial)
//   - friendships ya activas
//   - friend_requests pendientes bidireccional (no spam de invites)
//
// Devuelve preview liviano con la relationship status para que el UI
// sepa qué CTA mostrar: "Enviar solicitud" / "Solicitud enviada" /
// "Acepta tu solicitud" / "Ya son amigos".
const SearchPlayersSchema = z.object({
  q: z.string().min(2).max(64),
  limit: z.number().int().min(1).max(50).default(20),
});

export type PlayerSearchResult = {
  userId: string;
  displayName: string;
  username: string | null;
  city: string | null;
  avatarUrl: string | null;
  // Relación con el viewer:
  //   none           — nada, puede enviar request
  //   request_sent   — viewer ya envió request pendiente
  //   request_received — viewer recibió request del other (puede aceptar)
  //   friends        — ya son amigos
  relationship: "none" | "request_sent" | "request_received" | "friends";
};

export async function searchPlayers(
  input: unknown,
): Promise<ActionResult<PlayerSearchResult[]>> {
  return runAction(SearchPlayersSchema, input, async ({ q, limit }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    // 1) Profiles que matchean el query (por display_name o username),
    // excluyendo self + perfiles de sistema (MATCHPOINT no se busca aquí).
    // Sanitizamos el query removiendo "@" prefix si el user lo tipea.
    const cleaned = q.trim().replace(/^@+/, "");
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id,display_name,username,city,avatar_url" as never)
      .or(`display_name.ilike.%${cleaned}%,username.ilike.%${cleaned}%`)
      .neq("id", userId)
      .eq("is_system" as never, false as never)
      .limit(limit);
    if (error) throw new MpError("FRIENDS.SEARCH_FAILED", error.message, 500);

    type ProfileRow = {
      id: string;
      display_name: string | null;
      username: string | null;
      city: string | null;
      avatar_url: string | null;
    };
    const visible = (rows ?? []) as unknown as ProfileRow[];
    if (visible.length === 0) return [];

    const visibleIds = visible.map((p) => p.id);

    // 2) Friendships del user con los candidates.
    const { data: friendshipsRaw } = await supabase
      .from("friendships")
      .select("user_a,user_b")
      .or(
        `and(user_a.eq.${userId},user_b.in.(${visibleIds.join(",")})),` +
        `and(user_b.eq.${userId},user_a.in.(${visibleIds.join(",")}))`,
      );
    const friendIds = new Set(
      ((friendshipsRaw ?? []) as Array<{ user_a: string; user_b: string }>).map((f) =>
        f.user_a === userId ? f.user_b : f.user_a,
      ),
    );

    // 3) Requests pendientes en ambas direcciones.
    const { data: reqsRaw } = await supabase
      .from("friend_requests")
      .select("from_user_id,to_user_id,status")
      .eq("status", "pending")
      .or(
        `and(from_user_id.eq.${userId},to_user_id.in.(${visibleIds.join(",")})),` +
        `and(to_user_id.eq.${userId},from_user_id.in.(${visibleIds.join(",")}))`,
      );
    const sentTo = new Set<string>();
    const receivedFrom = new Set<string>();
    for (const r of (reqsRaw ?? []) as Array<{ from_user_id: string; to_user_id: string }>) {
      if (r.from_user_id === userId) sentTo.add(r.to_user_id);
      else receivedFrom.add(r.from_user_id);
    }

    return visible.map<PlayerSearchResult>((p) => {
      let relationship: PlayerSearchResult["relationship"] = "none";
      if (friendIds.has(p.id)) relationship = "friends";
      else if (sentTo.has(p.id)) relationship = "request_sent";
      else if (receivedFrom.has(p.id)) relationship = "request_received";
      return {
        userId: p.id,
        displayName: p.display_name ?? "Jugador",
        username: p.username,
        city: p.city,
        avatarUrl: p.avatar_url,
        relationship,
      };
    });
  });
}
