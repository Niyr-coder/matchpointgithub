import "server-only";

import type { MechanicKind } from "@/lib/giveaways/mechanics";

export type MechanicVerifyContext = {
  giveawayId: string;
  clubId: string;
  userId: string;
  opensAt: string | null;
  closesAt: string | null;
};

function windowStart(opensAt: string | null): string {
  return opensAt ?? new Date(0).toISOString();
}

/** Comprueba si el usuario cumple una mecánica auto-verificable. */
export async function verifyGiveawayMechanic(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  kind: MechanicKind,
  ctx: MechanicVerifyContext,
  flags: { isFollower: boolean },
): Promise<boolean> {
  const since = windowStart(ctx.opensAt);
  const until = ctx.closesAt;

  switch (kind) {
    case "follow":
      return flags.isFollower;

    case "reserve": {
      let q = admin
        .from("reservations")
        .select("id")
        .eq("club_id", ctx.clubId)
        .eq("organizer_id", ctx.userId)
        .in("status", ["booked", "confirmed", "checked_in", "completed"])
        .gte("created_at", since)
        .limit(1);
      if (until) q = q.lte("created_at", until);
      const { data } = await q;
      return (data?.length ?? 0) > 0;
    }

    case "play": {
      let matchQuery = admin
        .from("matches")
        .select("id")
        .eq("club_id", ctx.clubId)
        .or(`team_a_player_ids.cs.{${ctx.userId}},team_b_player_ids.cs.{${ctx.userId}}`)
        .gte("played_at", since)
        .limit(1);
      if (until) matchQuery = matchQuery.lte("played_at", until);
      const { data: matchHit } = await matchQuery;
      if ((matchHit?.length ?? 0) > 0) return true;

      const { data: tournaments } = await admin.from("tournaments").select("id").eq("club_id", ctx.clubId);
      const ids = (tournaments ?? []).map((t: { id: string }) => t.id);
      if (ids.length > 0) {
        let regQ = admin
          .from("registrations")
          .select("id")
          .eq("user_id", ctx.userId)
          .in("tournament_id", ids)
          .gte("created_at", since)
          .limit(1);
        if (until) regQ = regQ.lte("created_at", until);
        const { data: regHit } = await regQ;
        if ((regHit?.length ?? 0) > 0) return true;
      }

      const { data: qRows } = await admin
        .from("quedada_participants")
        .select("created_at,quedadas(club_id)")
        .eq("user_id", ctx.userId)
        .in("status", ["joined", "checked_in"])
        .gte("created_at", since)
        .limit(20);
      for (const row of qRows ?? []) {
        const qd = row.quedadas as { club_id?: string } | { club_id?: string }[] | null;
        const clubId = Array.isArray(qd) ? qd[0]?.club_id : qd?.club_id;
        if (clubId !== ctx.clubId) continue;
        if (until && row.created_at && String(row.created_at) > until) continue;
        return true;
      }
      return false;
    }

    case "invite": {
      let q = admin
        .from("profile_referrals")
        .select("referred_user_id", { count: "exact", head: true })
        .eq("referrer_user_id", ctx.userId)
        .gte("created_at", since);
      if (until) q = q.lte("created_at", until);
      const { count } = await q;
      return (count ?? 0) > 0;
    }

    case "buy": {
      let q = admin
        .from("transactions")
        .select("amount_cents")
        .eq("club_id", ctx.clubId)
        .eq("customer_user_id", ctx.userId)
        .eq("kind", "proshop_sale")
        .eq("status", "captured")
        .gte("created_at", since)
        .limit(5);
      if (until) q = q.lte("created_at", until);
      const { data } = await q;
      return (data ?? []).some((t: { amount_cents?: number }) => (Number(t.amount_cents) || 0) >= 2000);
    }

    case "pay": {
      let q = admin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("club_id", ctx.clubId)
        .eq("customer_user_id", ctx.userId)
        .eq("kind", "custom")
        .eq("ref_id", ctx.giveawayId)
        .eq("status", "captured")
        .gte("created_at", since);
      if (until) q = q.lte("created_at", until);
      const { count } = await q;
      return (count ?? 0) > 0;
    }

    case "share":
      return false;

    default:
      return false;
  }
}
