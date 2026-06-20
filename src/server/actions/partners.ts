"use server";

// Partner federations: list, get, create (admin only).
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import {
  PartnerCreateSchema,
  PartnerDetailSchema,
  PartnerMemberSchema,
  PartnerOrgSchema,
  type PartnerOrg,
} from "@/lib/schemas/ops";
import { UuidSchema } from "@/lib/schemas/common";

function mapPartner(row: Record<string, unknown>): PartnerOrg {
  return PartnerOrgSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    logoUrl: row.logo_url ?? null,
    country: row.country ?? null,
    contactEmail: row.contact_email ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listPartners(): Promise<ActionResult<PartnerOrg[]>> {
  return runAction(z.undefined(), undefined, async () => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("partner_orgs")
      .select("*")
      .order("name");
    if (error) throw new MpError("PARTNERS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapPartner);
  });
}

export async function getPartner(
  input: unknown,
): Promise<ActionResult<z.infer<typeof PartnerDetailSchema>>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const [{ data: partner, error }, { data: members }, { count }] = await Promise.all([
      supabase.from("partner_orgs").select("*").eq("id", id).single(),
      supabase.from("partner_members").select("*").eq("partner_id", id),
      supabase
        .from("partner_club_links")
        .select("*", { count: "exact", head: true })
        .eq("partner_id", id),
    ]);
    if (error || !partner) throw new MpError("PARTNERS.NOT_FOUND", "Partner not found", 404);
    return PartnerDetailSchema.parse({
      partner: mapPartner(partner),
      members: (members ?? []).map((m) =>
        PartnerMemberSchema.parse({
          partnerId: m.partner_id,
          userId: m.user_id,
          role: m.role,
          joinedAt: m.joined_at,
        }),
      ),
      clubLinkCount: count ?? 0,
    });
  });
}

async function requirePartnerAdmin(partnerId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data: m } = await supabase
    .from("partner_members")
    .select("role")
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (m && ["owner", "admin"].includes(m.role as string)) return user.id;
  // Admin platform can also act on any partner.
  const { data: adm } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (adm) return user.id;
  throw new AuthError("AUTH.ROLE_REQUIRED", "Partner-admin required");
}

const LinkSchema = z.object({
  partnerId: UuidSchema,
  clubId: UuidSchema,
  revenueSharePct: z.number().min(0).max(100).default(0),
});

export async function linkClubToPartner(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(LinkSchema, input, async ({ partnerId, clubId, revenueSharePct }) => {
    await requirePartnerAdmin(partnerId);
    const supabase = await getServerClient();
    const { error } = await supabase.from("partner_club_links").upsert(
      {
        partner_id: partnerId,
        club_id: clubId,
        revenue_share_pct: revenueSharePct,
      } as never,
      { onConflict: "partner_id,club_id" },
    );
    if (error) throw new MpError("PARTNERS.LINK_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function unlinkClubFromPartner(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({ partnerId: UuidSchema, clubId: UuidSchema }),
    input,
    async ({ partnerId, clubId }) => {
      await requirePartnerAdmin(partnerId);
      const supabase = await getServerClient();
      const { error } = await supabase
        .from("partner_club_links")
        .delete()
        .eq("partner_id", partnerId)
        .eq("club_id", clubId);
      if (error) throw new MpError("PARTNERS.UNLINK_FAILED", error.message, 500);
      return { ok: true as const };
    },
  );
}

export async function createPartner(input: unknown): Promise<ActionResult<PartnerOrg>> {
  return runAction(PartnerCreateSchema, input, async (data) => {
    const adminUserId = await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("partner_orgs")
      .insert({
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        country: data.country ?? null,
        contact_email: data.contactEmail ?? null,
        status: "active",
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("PARTNERS.SLUG_TAKEN", "Partner slug already in use", 409);
      }
      throw new MpError("PARTNERS.CREATE_FAILED", error.message, 500);
    }
    await supabase.from("partner_members").insert(
      { partner_id: row.id, user_id: data.ownerUserId, role: "owner" } as never,
    );

    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { error: roleErr } = await admin.from("role_assignments").insert({
      user_id: data.ownerUserId,
      role: "partner",
      partner_id: row.id,
      granted_by: adminUserId,
    } as never);
    if (roleErr && roleErr.code !== "23505") {
      throw new MpError("PARTNERS.ROLE_ASSIGN_FAILED", roleErr.message, 500);
    }

    return mapPartner(row);
  });
}
