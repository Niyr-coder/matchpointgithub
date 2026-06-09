"use server";

// Admin: timeline de auditoría filtrada por evento o torneo.
// Lee de la tabla pública `audit_log` (singular en este schema) y combina
// los registros del recurso principal con los de tablas relacionadas
// (event_registrations / registrations / transactions) que referencian el id.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { summarizeAuditEvent } from "@/lib/audit/labels";

// ── Shape público ──────────────────────────────────────────────────────
export type AuditEntry = {
  id: string;
  action: string; // raw: "INSERT" | "UPDATE" | "DELETE"
  entity: string; // raw table name (events, event_registrations, ...)
  entityId: string | null;
  actorId: string | null;
  actorRole: string | null;
  actorName: string; // display_name o "@username" o "sistema"
  createdAt: string;
  summary: string; // string legible corto, derivado de entity+action+diff
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawDiff: any;
};

// ── Helpers ────────────────────────────────────────────────────────────
async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

type AuditRow = {
  id: number | string;
  actor_id: string | null;
  actor_role: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diff: any;
  created_at: string;
};

async function hydrateActors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: AuditRow[],
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v))),
  );
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,username")
    .in("id", ids);
  for (const p of (data ?? []) as Array<{
    id: string;
    display_name: string | null;
    username: string | null;
  }>) {
    const label = p.display_name?.trim() || (p.username ? `@${p.username}` : null) || "Usuario";
    map.set(p.id, label);
  }
  return map;
}

function toEntries(rows: AuditRow[], actorNames: Map<string, string>): AuditEntry[] {
  return rows
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => ({
      id: String(r.id),
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      actorId: r.actor_id,
      actorRole: r.actor_role,
      actorName: r.actor_id
        ? actorNames.get(r.actor_id) ?? "Usuario"
        : r.actor_role === "system"
          ? "Sistema"
          : "—",
      createdAt: r.created_at,
      summary: summarizeAuditEvent(r.entity, r.action),
      rawDiff: r.diff,
    }));
}

// ── getEventAuditLog ───────────────────────────────────────────────────
const EventAuditParams = z.object({
  eventId: UuidSchema,
  limit: z.number().int().min(1).max(200).default(50),
});

export async function getEventAuditLog(
  input: unknown,
): Promise<ActionResult<AuditEntry[]>> {
  return runAction(EventAuditParams, input, async ({ eventId, limit }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();

    const cols = "id,actor_id,actor_role,entity,entity_id,action,diff,created_at";

    // 1) Cambios directos sobre la fila del evento.
    const evPromise = supabase
      .from("audit_log")
      .select(cols)
      .eq("entity", "events")
      .eq("entity_id", eventId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // 2) Inscripciones del evento (event_registrations.event_id == eventId).
    const regPromise = supabase
      .from("audit_log")
      .select(cols)
      .eq("entity", "event_registrations")
      .eq("diff->>event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // 3) Transacciones ligadas: kind='event' y ref_id == eventId.
    const txPromise = supabase
      .from("audit_log")
      .select(cols)
      .eq("entity", "transactions")
      .eq("diff->>kind", "event")
      .eq("diff->>ref_id", eventId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const [{ data: ev, error: e1 }, { data: regs, error: e2 }, { data: txs, error: e3 }] =
      await Promise.all([evPromise, regPromise, txPromise]);

    if (e1 || e2 || e3) {
      throw new MpError(
        "AUDIT.DB_ERROR",
        e1?.message ?? e2?.message ?? e3?.message ?? "Error leyendo auditoría",
        500,
      );
    }

    const merged: AuditRow[] = [
      ...((ev ?? []) as AuditRow[]),
      ...((regs ?? []) as AuditRow[]),
      ...((txs ?? []) as AuditRow[]),
    ];

    const actorNames = await hydrateActors(supabase, merged);
    return toEntries(merged, actorNames).slice(0, limit);
  });
}

// ── getTournamentAuditLog ──────────────────────────────────────────────
const TournamentAuditParams = z.object({
  tournamentId: UuidSchema,
  limit: z.number().int().min(1).max(200).default(50),
});

export async function getTournamentAuditLog(
  input: unknown,
): Promise<ActionResult<AuditEntry[]>> {
  return runAction(TournamentAuditParams, input, async ({ tournamentId, limit }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();

    const cols = "id,actor_id,actor_role,entity,entity_id,action,diff,created_at";

    const tPromise = supabase
      .from("audit_log")
      .select(cols)
      .eq("entity", "tournaments")
      .eq("entity_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const regPromise = supabase
      .from("audit_log")
      .select(cols)
      .eq("entity", "registrations")
      .eq("diff->>tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const txPromise = supabase
      .from("audit_log")
      .select(cols)
      .eq("entity", "transactions")
      .eq("diff->>kind", "tournament")
      .eq("diff->>ref_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const [{ data: tr, error: e1 }, { data: regs, error: e2 }, { data: txs, error: e3 }] =
      await Promise.all([tPromise, regPromise, txPromise]);

    if (e1 || e2 || e3) {
      throw new MpError(
        "AUDIT.DB_ERROR",
        e1?.message ?? e2?.message ?? e3?.message ?? "Error leyendo auditoría",
        500,
      );
    }

    const merged: AuditRow[] = [
      ...((tr ?? []) as AuditRow[]),
      ...((regs ?? []) as AuditRow[]),
      ...((txs ?? []) as AuditRow[]),
    ];

    const actorNames = await hydrateActors(supabase, merged);
    return toEntries(merged, actorNames).slice(0, limit);
  });
}
