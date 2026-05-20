// Lectura server-side del switch multideporte. Cacheado por request.
// platform_config tiene RLS admin-only → usamos el RPC público
// fn_multisport_enabled (mig 123). Ver docs/product/05-multisport.md.
import "server-only";

import { cache } from "react";
import { getServerClient } from "@/lib/db/client.server";
import { enabledSports, type Sport } from "@/lib/sports";

export const getMultisportEnabled = cache(async (): Promise<boolean> => {
  try {
    const supabase = await getServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("fn_multisport_enabled");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
});

export async function getEnabledSports(): Promise<Sport[]> {
  return enabledSports(await getMultisportEnabled());
}
