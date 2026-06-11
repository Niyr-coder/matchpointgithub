"use server";

// Server actions de la sección Identidad del Club Config v2.
// Lee/escribe columnas de la tabla `clubs`. Campos legalName/whatsapp/website/
// instagram/tiktok/reference NO existen en DB todavía — se preservan en el
// loader como null y la action los acepta pero los descarta (TODO: migrar
// cuando producto decida).
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type { IdentidadData } from "@/components/dashboard/owner/config-sections/IdentidadSection";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

async function requireClubManagerUserId(clubId: string): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el staff del club puede editar");
  return userId;
}

// Calcula iniciales tipo "Club Norte" → "CN" (máx 2 letras).
function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export async function loadIdentidadData(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  clubId: string,
): Promise<IdentidadData | null> {
  const { data: club } = await (supabase as any)
    .from("clubs")
    .select(
      "id,name,description,logo_url,cover_url,country,city,address,phone,email,latitude,longitude,sports,slug,version",
    )
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return null;

  const { count: courtsCount } = await (supabase as any)
    .from("courts")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("active", true);

  const { data: reviews } = await (supabase as any)
    .from("club_reviews")
    .select("rating")
    .eq("club_id", clubId);
  const ratings = ((reviews ?? []) as Array<{ rating: number | null }>)
    .map((r) => r.rating)
    .filter((v): v is number => typeof v === "number");
  const ratingAvg = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : null;

  const sports = (club.sports as string[] | null) ?? [];
  const sportsLabel = sports.length ? sports.join(", ").toUpperCase() : "—";
  const courtsLabel = courtsCount != null ? `${courtsCount} ${courtsCount === 1 ? "CANCHA" : "CANCHAS"}` : "—";

  return {
    clubId: club.id as string,
    name: (club.name as string) ?? "",
    legalName: null,
    description: (club.description as string | null) ?? null,
    logoUrl: (club.logo_url as string | null) ?? null,
    coverUrl: (club.cover_url as string | null) ?? null,
    country: (club.country as string | null) ?? null,
    city: (club.city as string | null) ?? null,
    address: (club.address as string | null) ?? null,
    reference: null,
    phone: (club.phone as string | null) ?? null,
    whatsapp: null,
    email: (club.email as string | null) ?? null,
    website: null,
    instagram: null,
    tiktok: null,
    latitude: (club.latitude as number | null) ?? null,
    longitude: (club.longitude as number | null) ?? null,
    initials: buildInitials((club.name as string) ?? ""),
    sportsLabel,
    courtsLabel,
    ratingAvg,
    ratingCount: ratings.length || null,
    openLabel: "Abierto",
    slug: (club.slug as string | null) ?? null,
    version: (club.version as number | null) ?? 1,
  };
}

const UpdateIdentitySchema = z.object({
  clubId: UuidSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(280).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().or(z.literal("")).optional(),
});

export async function updateClubIdentity(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdateIdentitySchema, input, async (d) => {
    await requireClubManagerUserId(d.clubId);
    const supabase = await getServerClient();
    const patch: Record<string, unknown> = {
      name: d.name,
      description: d.description ?? null,
      address: d.address ?? null,
      phone: d.phone ?? null,
      email: d.email && d.email.length > 0 ? d.email : null,
    };
    if (d.country) patch.country = d.country;
    if (d.city) patch.city = d.city;

    const { error } = await (supabase as any).from("clubs").update(patch).eq("id", d.clubId);
    if (error) throw new MpError("CLUB_CONFIG.UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
