import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";

export type PublicProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  preferred_sport: string | null;
  skill_level: string | null;
  created_at: string | null;
  is_system: boolean;
};

/** Perfiles públicos (v_public_profiles) — seguro con RLS estricto activo. */
export async function hydratePublicProfiles(
  ids: string[],
): Promise<Map<string, PublicProfileRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, PublicProfileRow>();
  if (unique.length === 0) return map;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("v_public_profiles")
    .select(
      "id,username,display_name,avatar_url,city,country,preferred_sport,skill_level,created_at,is_system" as never,
    )
    .in("id", unique);

  if (error) {
    console.warn("[profile-hydration] v_public_profiles:", error.message);
    return map;
  }

  for (const row of (data ?? []) as unknown as PublicProfileRow[]) {
    map.set(row.id, row);
  }
  return map;
}

/** Hidrata perfiles completos tras validar auth en server (service role). */
export async function hydrateProfilesAdmin(
  ids: string[],
  columns = "id,display_name,username,avatar_url,city,preferred_sport,is_system,plan_tier,plan_expires_at",
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, Record<string, unknown>>();
  if (unique.length === 0) return map;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(columns as never)
    .in("id", unique);

  if (error) {
    console.warn("[profile-hydration] profiles admin:", error.message);
    return map;
  }

  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    map.set(row.id as string, row);
  }
  return map;
}
