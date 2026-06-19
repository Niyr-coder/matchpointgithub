// Server: feature flags + assignments + clubes para selector.
import { getServerClient } from "@/lib/db/client.server";
import {
  type FlagsData,
  type FlagRow,
  type FlagAssignment,
  type ClubLite,
} from "./AdminFlagsScreenView";
// Merge: el rediseño v2 (AdminFlagsView) consume los datos reales que carga este
// server component. AdminFlagsScreenView queda como fuente de tipos + respaldo.
import { AdminFlagsView } from "./AdminFlagsView";
import { sortFlagsByRegistry, uncreatedKnownFlags } from "@/lib/flags/registry";

function titleize(key: string): string {
  return key
    .split(/[_\-]/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function loadData(): Promise<FlagsData> {
  const supabase = await getServerClient();
  const [{ data: flags }, { data: assignments }, { data: clubs }] = await Promise.all([
    supabase
      .from("feature_flags")
      .select("key,description,enabled_default,rollout_pct,env,impact,owner,segment,label,updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("feature_flag_assignments")
      .select("flag_key,scope,scope_id,enabled,reason"),
    supabase.from("clubs").select("id,name").eq("status", "active").order("name"),
  ]);

  const assignByFlag = new Map<string, FlagAssignment[]>();
  for (const a of assignments ?? []) {
    const k = a.flag_key as string;
    if (!assignByFlag.has(k)) assignByFlag.set(k, []);
    assignByFlag.get(k)!.push({
      flagKey: k,
      scope: a.scope as "user" | "club" | "role",
      scopeId: a.scope_id as string,
      enabled: a.enabled as boolean,
      reason: (a.reason as string | null) ?? null,
    });
  }

  const rows: FlagRow[] = (flags ?? []).map((f) => {
    const enabled = f.enabled_default as boolean;
    const rollout = (f.rollout_pct as number) ?? 0;
    const state: FlagRow["state"] = !enabled ? "off" : rollout >= 100 ? "on" : "rollout";
    const assigns = assignByFlag.get(f.key as string) ?? [];
    return {
      k: f.key as string,
      t: titleize(f.key as string),
      desc: (f.description as string) ?? "—",
      state,
      enabled,
      rollout,
      env: ((f.env as string) ?? "prod") as FlagRow["env"],
      impact: ((f.impact as string) ?? "med") as FlagRow["impact"],
      owner: (f.owner as string | null) ?? null,
      segment: (f.segment as string | null) ?? null,
      label: (f.label as string | null) ?? null,
      updatedAt: (f.updated_at as string | null) ?? null,
      assignments: assigns,
    };
  });

  const clubsLite: ClubLite[] = (clubs ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  const sortedRows = sortFlagsByRegistry(rows);
  const missingKnownFlags = uncreatedKnownFlags(sortedRows.map((r) => r.k));

  return {
    rows: sortedRows,
    clubs: clubsLite,
    missingKnownFlags: missingKnownFlags.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      impact: f.impact,
    })),
    kpis: {
      activeCount: sortedRows.filter((r) => r.state === "on").length,
      rolloutCount: sortedRows.filter((r) => r.state === "rollout").length,
      totalCount: sortedRows.length,
      offCount: sortedRows.filter((r) => r.state === "off").length,
    },
  };
}

export async function AdminFlagsScreen() {
  const data = await loadData();
  return <AdminFlagsView data={data} />;
}
