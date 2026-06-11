import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { MpError } from "@/lib/api/errors";
import { SHOP_FLAG } from "@/lib/flags/shop";

export async function isShopEnabledForUser(): Promise<boolean> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("fn_my_effective_flags");
  if (error) return false;

  for (const row of (data ?? []) as { key: string; enabled: boolean }[]) {
    if (row.key === SHOP_FLAG) return Boolean(row.enabled);
  }
  return false;
}

export async function requireShopEnabled(): Promise<void> {
  if (!(await isShopEnabledForUser())) {
    throw new MpError(
      "FLAGS.SHOP_DISABLED",
      "La tienda no está disponible temporalmente.",
      503,
    );
  }
}
