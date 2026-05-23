import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { isClubMembershipActive } from "@/lib/clubs/membership";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * % de descuento que da la membresía VIP activa del usuario en ESE club (0 si
 * no es miembro activo o no tiene tier con descuento). Lectura cross-tabla con
 * admin client (datos del propio user + tier del club). Solo lectura → sin audit.
 */
export async function getActiveClubDiscountPct(userId: string, clubId: string): Promise<number> {
  if (!userId || !clubId) return 0;
  const admin = getAdminClient();
  const { data } = await (admin as any)
    .from("club_memberships")
    .select("status,expires_at,club_membership_tiers(discount_pct)")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return 0;
  if (!isClubMembershipActive({ status: data.status, expires_at: data.expires_at })) return 0;
  const pct = data.club_membership_tiers?.discount_pct ?? 0;
  return Math.max(0, Math.min(100, pct));
}

/** Aplica el descuento (en %) a un monto en centavos, redondeando. */
export function applyDiscount(amountCents: number, pct: number): number {
  if (pct <= 0) return amountCents;
  return Math.round(amountCents * (1 - pct / 100));
}

/** ¿El usuario tiene una membresía VIP activa en ese club? (gate de acceso) */
export async function hasActiveClubMembership(userId: string, clubId: string): Promise<boolean> {
  if (!userId || !clubId) return false;
  const admin = getAdminClient();
  const { data } = await (admin as any)
    .from("club_memberships")
    .select("status,expires_at")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data && isClubMembershipActive({ status: data.status, expires_at: data.expires_at });
}
