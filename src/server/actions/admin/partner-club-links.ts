"use server";

import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

const SearchSchema = z.object({ q: z.string().min(1).max(100) });

const LinkSchema = z.object({
  partnerId: UuidSchema,
  clubId: UuidSchema,
  revenueSharePct: z.number().min(0).max(100),
});

const UnlinkSchema = z.object({
  partnerId: UuidSchema,
  clubId: UuidSchema,
});

export type ClubSearchResult = {
  id: string;
  name: string;
  city: string | null;
  slug: string;
};

export async function adminSearchClubs(
  input: unknown,
): Promise<ActionResult<ClubSearchResult[]>> {
  return runAction(SearchSchema, input, async ({ q }) => {
    await requireAdminUserId();
    const admin = getAdminClient();
    const pattern = `%${q}%`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("clubs")
      .select("id,name,city,slug")
      .eq("status", "active")
      .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
      .order("name")
      .limit(20);
    if (error) throw new MpError("ADMIN_PARTNERS.SEARCH_FAILED", error.message, 500);
    return (data ?? []) as ClubSearchResult[];
  });
}

export async function adminLinkClubToPartner(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(LinkSchema, input, async ({ partnerId, clubId, revenueSharePct }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: club, error: clubErr } = await (admin as any)
      .from("clubs")
      .select("id,status")
      .eq("id", clubId)
      .maybeSingle();
    if (clubErr) throw new MpError("ADMIN_PARTNERS.SEARCH_FAILED", clubErr.message, 500);
    if (!club) throw new MpError("ADMIN_PARTNERS.CLUB_NOT_FOUND", "Club no encontrado.", 404);
    if ((club.status as string) !== "active") {
      throw new MpError("ADMIN_PARTNERS.CLUB_INACTIVE", "El club no está activo.", 409);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: partner, error: partnerErr } = await (admin as any)
      .from("partner_orgs")
      .select("id")
      .eq("id", partnerId)
      .maybeSingle();
    if (partnerErr) throw new MpError("ADMIN_PARTNERS.SEARCH_FAILED", partnerErr.message, 500);
    if (!partner) throw new MpError("ADMIN_PARTNERS.PARTNER_NOT_FOUND", "Partner no encontrado.", 404);

    await setAuditActor(admin, adminId, "admin");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("partner_club_links").upsert(
      { partner_id: partnerId, club_id: clubId, revenue_share_pct: revenueSharePct },
      { onConflict: "partner_id,club_id" },
    );
    if (error) throw new MpError("ADMIN_PARTNERS.LINK_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function adminUnlinkClubFromPartner(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(UnlinkSchema, input, async ({ partnerId, clubId }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("partner_club_links")
      .delete()
      .eq("partner_id", partnerId)
      .eq("club_id", clubId);
    if (error) throw new MpError("ADMIN_PARTNERS.UNLINK_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
