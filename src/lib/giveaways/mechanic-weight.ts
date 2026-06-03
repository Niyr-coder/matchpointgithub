import "server-only";

import type { MechanicKind } from "@/lib/giveaways/mechanics";
import type { MechanicVerifyContext } from "@/lib/giveaways/mechanic-verify";
import { verifyGiveawayMechanic } from "@/lib/giveaways/mechanic-verify";

const MAX_PAY_TICKETS = 10;

async function countCapturedPayTickets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  ctx: MechanicVerifyContext,
  since: string,
  until: string | null,
): Promise<number> {
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
  return count ?? 0;
}

/** Entradas a aplicar por mecánica (0 = no completada). */
export async function resolveMechanicWeightApplied(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  kind: MechanicKind,
  ctx: MechanicVerifyContext,
  flags: { isFollower: boolean },
  configuredWeight: number,
): Promise<number> {
  const since = ctx.opensAt ?? new Date(0).toISOString();
  const until = ctx.closesAt;

  if (kind === "pay") {
    const tickets = await countCapturedPayTickets(admin, ctx, since, until);
    if (tickets <= 0) return 0;
    return Math.min(tickets, MAX_PAY_TICKETS) * configuredWeight;
  }

  if (kind === "share") {
    const { data: sub } = await admin
      .from("club_giveaway_manual_submissions")
      .select("status")
      .eq("giveaway_id", ctx.giveawayId)
      .eq("user_id", ctx.userId)
      .eq("kind", "share")
      .maybeSingle();
    if (sub?.status !== "approved") return 0;
    return configuredWeight;
  }

  const done = await verifyGiveawayMechanic(admin, kind, ctx, flags);
  return done ? configuredWeight : 0;
}

export { MAX_PAY_TICKETS };
