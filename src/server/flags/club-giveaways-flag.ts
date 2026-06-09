import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { MpError } from "@/lib/api/errors";
import { CLUB_GIVEAWAYS_FLAG } from "@/lib/flags/club-giveaways";

export async function isClubGiveawaysEnabledForUser(): Promise<boolean> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("fn_my_effective_flags");
  if (error) return true;

  for (const row of (data ?? []) as { key: string; enabled: boolean }[]) {
    if (row.key === CLUB_GIVEAWAYS_FLAG) return Boolean(row.enabled);
  }
  return true;
}

export async function requireClubGiveawaysEnabled(): Promise<void> {
  if (!(await isClubGiveawaysEnabledForUser())) {
    throw new MpError(
      "FLAGS.GIVEAWAYS_DISABLED",
      "Los sorteos no están disponibles temporalmente.",
      503,
    );
  }
}
