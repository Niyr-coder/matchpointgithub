// Membresías VIP por club — schemas. Ver docs/product/07-club-memberships.md.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { UuidSchema } from "./common";

extendZodWithOpenApi(z);

// Crear / editar un tier (si viene tierId, es edición). Lo gestiona el club.
export const SaveClubMembershipTierSchema = z
  .object({
    clubId: UuidSchema,
    tierId: UuidSchema.optional(),
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(280).nullable().optional(),
    priceCents: z.coerce.number().int().min(0).max(100_000_000),
    durationMonths: z.coerce.number().int().min(1).max(60),
    discountPct: z.coerce.number().int().min(0).max(100).default(0),
    benefits: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
    cardTemplateKey: z.string().trim().min(1).max(40),
    cardAccent: z.string().trim().max(40).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .openapi("SaveClubMembershipTier");

export const ClubMembershipTierIdSchema = z.object({ tierId: UuidSchema }).openapi("ClubMembershipTierId");

// El usuario compra una membresía de un tier (crea pending + tx pending_proof).
export const RequestClubMembershipSchema = z
  .object({ clubId: UuidSchema, tierId: UuidSchema })
  .openapi("RequestClubMembership");

export const ClubMembershipIdSchema = z.object({ membershipId: UuidSchema }).openapi("ClubMembershipId");

export const RejectClubMembershipSchema = z
  .object({ membershipId: UuidSchema, reason: z.string().trim().max(280).optional() })
  .openapi("RejectClubMembership");

export const RevokeClubMembershipSchema = z
  .object({ membershipId: UuidSchema, reason: z.string().trim().max(280).optional() })
  .openapi("RevokeClubMembership");

// Lecturas
export const ClubIdSchema = z.object({ clubId: UuidSchema }).openapi("ClubMembershipClubId");
export const MyClubMembershipsSchema = z.object({}).openapi("MyClubMemberships");
