// Server: feature flags + assignments + clubes para selector.
import { getServerClient } from "@/lib/db/client.server";
import {
  AdminFlagsScreenView,
  type FlagsData,
  type FlagRow,
  type FlagAssignment,
  type ClubLite,
} from "./AdminFlagsScreenView";

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
      .select("key,description,enabled_default,rollout_pct,updated_at")
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
      assignments: assigns,
    };
  });

  const clubsLite: ClubLite[] = (clubs ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  return {
    rows,
    clubs: clubsLite,
    kpis: {
      activeCount: rows.filter((r) => r.state === "on").length,
      rolloutCount: rows.filter((r) => r.state === "rollout").length,
      totalCount: rows.length,
      offCount: rows.filter((r) => r.state === "off").length,
    },
  };
}

export async function AdminFlagsScreen() {
  const data = await loadData();
  return <AdminFlagsScreenView data={data} />;
}
