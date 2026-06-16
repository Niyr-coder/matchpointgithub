// Server: audit_log real de la plataforma (admin scope) → rediseño AdminAuditView.
// Resuelve actores, deriva categoría/severidad desde entity+action (no son
// columnas), y arma el shape AuditEvent. Ver docs/security/03-audit-log.md.
import { getServerClient } from "@/lib/db/client.server";
import { AdminAuditView, type AuditEvent } from "./AdminAuditView";

// entity → categoría del pill (auth/mod/pagos/config/club). Default 'config'.
function categoryOf(entity: string): string {
  const e = entity.toLowerCase();
  if (["role_assignments", "role_requests", "profiles"].includes(e)) return "auth";
  if (["reports", "message_reports", "messages", "user_bans"].includes(e)) return "mod";
  if (["payment_proofs", "transactions", "player_subscriptions", "club_featuring", "payouts", "refunds"].includes(e)) return "pagos";
  if (["feature_flags", "feature_flag_assignments", "platform_config", "audit_log"].includes(e)) return "config";
  if (["clubs", "courts", "court_pricing", "club_memberships", "club_membership_tiers", "sponsors", "events", "tournaments", "quedadas"].includes(e)) return "club";
  return "config";
}

// severidad derivada: critical (acciones sensibles), warn (pagos/mod), info (resto).
function severityOf(entity: string, op: string): AuditEvent["sev"] {
  const e = entity.toLowerCase();
  const o = op.toLowerCase();
  if (o === "delete") return "critical";
  if (o === "audit_chain.rebackfill") return "critical";
  if (["feature_flags", "feature_flag_assignments", "platform_config", "role_assignments"].includes(e)) return "critical";
  if (["payment_proofs", "transactions", "player_subscriptions", "club_featuring", "payouts", "refunds"].includes(e)) return "warn";
  if (["reports", "message_reports", "user_bans"].includes(e)) return "warn";
  return "info";
}

const AV_PALETTE = [
  "linear-gradient(135deg,#dc2626,#b91c1c)",
  "linear-gradient(135deg,#0ea5e9,#0369a1)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#0c4a6e,#0ea5e9)",
];
function avBgFor(who: string): string {
  let h = 0;
  for (let i = 0; i < who.length; i++) h = (h * 31 + who.charCodeAt(i)) >>> 0;
  return who === "sistema" ? "linear-gradient(135deg,#0a0a0a,#374151)" : AV_PALETTE[h % AV_PALETTE.length];
}
function initialsOf(who: string): string {
  if (who === "sistema") return "SY";
  const clean = who.replace(/^@/, "").replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const parts = clean.split(/[\s.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}
function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function diffList(diff: unknown): AuditEvent["diff"] {
  if (!diff || typeof diff !== "object") return null;
  const d = diff as Record<string, unknown>;
  const before = d.before as Record<string, unknown> | undefined;
  const after = d.after as Record<string, unknown> | undefined;
  if (before && after && typeof before === "object" && typeof after === "object") {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const out: { k: string; a: string; b: string }[] = [];
    for (const k of keys) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out.push({ k, a: fmtVal(before[k]), b: fmtVal(after[k]) });
    }
    return out.length ? out : null;
  }
  return null;
}

async function loadEvents(): Promise<{ events: AuditEvent[]; now: number; chainedCount: number }> {
  const now = Date.now();
  const supabase = await getServerClient();
  const [{ data: logs }, { count: chainedCount }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id,actor_id,actor_role,entity,entity_id,action,ip,ua,diff,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("audit_log").select("id", { count: "exact", head: true }).not("row_hash", "is", null),
  ]);

  const actorIds = Array.from(new Set((logs ?? []).map((l) => l.actor_id as string | null).filter(Boolean) as string[]));
  const actorName = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id,username,display_name").in("id", actorIds);
    for (const p of profs ?? []) actorName.set(p.id as string, `@${(p.username as string) ?? (p.display_name as string)}`);
  }

  const events: AuditEvent[] = (logs ?? []).map((l) => {
    const entity = (l.entity as string) ?? "—";
    const op = (l.action as string) ?? "—";
    const who = l.actor_id ? actorName.get(l.actor_id as string) ?? "—" : "sistema";
    const ip = (l.ip as string | null) ?? null;
    return {
      t: l.created_at as string,
      who,
      actorId: (l.actor_id as string | null) ?? null,
      av: initialsOf(who),
      avBg: avBgFor(who),
      actorType: ((l.actor_role as string | null) ?? (l.actor_id ? "admin" : "system")).toLowerCase(),
      action: `${entity}.${op.toLowerCase()}`,
      cat: categoryOf(entity),
      target: (l.entity_id as string | null) ?? "—",
      sev: severityOf(entity, op),
      ip: ip ? String(ip) : null,
      geo: "—",
      ua: (l.ua as string | null) ?? "—",
      reqId: String(l.id),
      diff: diffList(l.diff),
    };
  });
  return { events, now, chainedCount: chainedCount ?? 0 };
}

export async function AdminAuditScreen() {
  const { events, now, chainedCount } = await loadEvents();
  return <AdminAuditView events={events} now={now} chainedCount={chainedCount} />;
}
