import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";

export type ClubVerifiedPartner = { id: string; name: string };

/** Partners activos vinculados al club (admin client: RLS de partner_orgs bloquea al staff del club). */
export async function listVerifiedPartnersForClub(
  clubId: string,
): Promise<ClubVerifiedPartner[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("partner_club_links")
    .select("partner_id,partner_orgs(id,name,status)")
    .eq("club_id", clubId);
  if (error) return [];

  return (data ?? [])
    .map((link) => {
      const org = link.partner_orgs as { id: string; name: string; status: string } | null;
      if (!org || org.status !== "active") return null;
      return { id: org.id, name: org.name };
    })
    .filter((p): p is ClubVerifiedPartner => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Nombres de partners por id (p. ej. torneos ya asignados). */
export async function mapPartnerNamesById(
  partnerIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(partnerIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const admin = getAdminClient();
  const { data } = await admin.from("partner_orgs").select("id,name").in("id", unique);
  return new Map((data ?? []).map((o) => [o.id as string, o.name as string]));
}
