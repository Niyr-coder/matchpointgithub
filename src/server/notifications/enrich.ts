import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Notification } from "@/lib/schemas/notifications";

type Db = SupabaseClient<Database>;

function payloadId(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function formatQuedadaWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function quedadaContextLine(row: {
  title: string;
  starts_at: string;
  location_text: string | null;
}): string {
  return [row.title, formatQuedadaWhen(row.starts_at), row.location_text].filter(Boolean).join(" · ");
}

/** Completa body/payload de notifs históricas con datos de BD (batch). */
export async function enrichNotifications(
  supabase: Db,
  rows: Notification[],
): Promise<Notification[]> {
  if (rows.length === 0) return rows;

  const quedadaIds = new Set<string>();
  const friendUserIds = new Set<string>();

  for (const n of rows) {
    const p = n.payload ?? {};
    if (n.kind.startsWith("quedada")) {
      const id = payloadId(p, "quedadaId", "quedada_id");
      if (id) quedadaIds.add(id);
    }
    if (n.kind.startsWith("friend_request")) {
      const uid = payloadId(p, "fromUserId", "from_user_id", "friendUserId");
      if (uid) friendUserIds.add(uid);
    }
  }

  const quedadaById = new Map<
    string,
    { title: string; starts_at: string; location_text: string | null; status: string }
  >();
  if (quedadaIds.size > 0) {
    const { data } = await supabase
      .from("quedadas")
      .select("id,title,starts_at,location_text,status")
      .in("id", Array.from(quedadaIds));
    for (const q of data ?? []) {
      quedadaById.set(q.id as string, {
        title: q.title as string,
        starts_at: q.starts_at as string,
        location_text: (q.location_text as string | null) ?? null,
        status: q.status as string,
      });
    }
  }

  const profileById = new Map<string, string>();
  if (friendUserIds.size > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id,display_name,username")
      .in("id", Array.from(friendUserIds));
    for (const p of data ?? []) {
      profileById.set(
        p.id as string,
        ((p.display_name as string | null) ?? (p.username as string | null) ?? "Un jugador").trim(),
      );
    }
  }

  return rows.map((n) => {
    const p = { ...(n.payload ?? {}) };
    let body = n.body;
    let title = n.title;

    if (n.kind.startsWith("quedada")) {
      const id = payloadId(p, "quedadaId", "quedada_id");
      const q = id ? quedadaById.get(id) : undefined;
      if (q) {
        if (!p.quedada_title) p.quedada_title = q.title;
        if (!p.starts_label) p.starts_label = formatQuedadaWhen(q.starts_at);
        if (!p.location_text && q.location_text) p.location_text = q.location_text;
        if (!body) body = quedadaContextLine(q);
        if (n.kind === "quedada_cancelled" && title === "Se canceló una quedada") {
          title = `Se canceló «${q.title}»`;
        }
      }
    }

    if (n.kind.startsWith("friend_request")) {
      const uid = payloadId(p, "fromUserId", "from_user_id", "friendUserId");
      const name = uid ? profileById.get(uid) : null;
      if (name) {
        if (!p.fromUserName) p.fromUserName = name;
        if (!body) body = name;
        if (n.kind === "friend_request_new" && title === "Nueva solicitud de amistad") {
          title = `${name} te envió una solicitud`;
        }
      }
    }

    if (body === n.body && title === n.title && JSON.stringify(p) === JSON.stringify(n.payload ?? {})) {
      return n;
    }
    return { ...n, title, body, payload: p };
  });
}

/** Contexto estándar al encolar notifs de quedada. */
export function quedadaNotifyContext(q: {
  id: string;
  title: string;
  starts_at: string;
  location_text?: string | null;
}): { body: string; payload: Record<string, unknown> } {
  const startsLabel = formatQuedadaWhen(q.starts_at);
  const body = [q.title, startsLabel, q.location_text].filter(Boolean).join(" · ");
  return {
    body,
    payload: {
      quedadaId: q.id,
      quedada_id: q.id,
      quedada_title: q.title,
      starts_label: startsLabel,
      ...(q.location_text ? { location_text: q.location_text } : {}),
    },
  };
}
