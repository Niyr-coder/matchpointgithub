import "server-only";

import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/db/client.admin";
import { MP_REF_COOKIE } from "@/lib/referrals/constants";

export type ClaimReferralResult =
  | { claimed: false; reason?: string }
  | { claimed: true; referrerUserId: string };

/** Registra un referido si el username es válido y no hay conflicto. Idempotente. */
export async function claimReferralForUser(
  referredUserId: string,
  refUsername: string,
): Promise<ClaimReferralResult> {
  const slug = refUsername.trim().toLowerCase();
  if (!slug || slug.length < 3) return { claimed: false, reason: "invalid_ref" };

  const admin = getAdminClient();

  const { data: referrer, error: refErr } = await admin
    .from("profiles")
    .select("id, username")
    .ilike("username", slug)
    .maybeSingle();
  if (refErr || !referrer?.id) return { claimed: false, reason: "referrer_not_found" };

  const referrerUserId = referrer.id as string;
  if (referrerUserId === referredUserId) return { claimed: false, reason: "self_ref" };

  const { data: existing } = await (admin as any)
    .from("profile_referrals")
    .select("referrer_user_id")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();
  if (existing) return { claimed: false, reason: "already_referred" };

  const { error: insErr } = await (admin as any).from("profile_referrals").insert({
    referred_user_id: referredUserId,
    referrer_user_id: referrerUserId,
  } as never);
  if (insErr) {
    if (insErr.code === "23505") return { claimed: false, reason: "already_referred" };
    console.error("[claimReferralForUser]", insErr.message);
    return { claimed: false, reason: "insert_failed" };
  }

  return { claimed: true, referrerUserId };
}

/** Lee mp_ref de cookies, reclama y limpia la cookie. */
export async function claimPendingReferralFromCookie(
  referredUserId: string,
): Promise<ClaimReferralResult> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(MP_REF_COOKIE)?.value;
  if (!raw) return { claimed: false };

  const refUsername = decodeURIComponent(raw).trim();
  const result = await claimReferralForUser(referredUserId, refUsername);

  if (result.claimed) {
    cookieStore.delete(MP_REF_COOKIE);
    try {
      const { syncActiveGiveawayMechanicsForReferrer } = await import(
        "@/server/actions/giveaways"
      );
      await syncActiveGiveawayMechanicsForReferrer(result.referrerUserId);
    } catch (e) {
      console.error("[claimPendingReferralFromCookie] giveaway sync failed", e);
    }
  }

  return result;
}
