// Identity / auth schemas.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  EmailSchema,
  IsoDateTimeSchema,
  LocaleSchema,
  MpRoleSchema,
  MpSkillLevelSchema,
  MpSportSchema,
  PasswordSchema,
  UsernameSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const MpDominantHandSchema = z.enum(["left", "right"]).openapi("MpDominantHand");

export const ProfileSchema = z
  .object({
    id: UuidSchema,
    username: UsernameSchema,
    displayName: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    bio: z.string().nullable(),
    country: z.string().nullable(),
    city: z.string().nullable(),
    birthdate: z.string().nullable(),
    phone: z.string().nullable(),
    dominantHand: MpDominantHandSchema.nullable(),
    preferredSport: MpSportSchema.nullable(),
    skillLevel: MpSkillLevelSchema.nullable(),
    // Customización de perfil (MP+ exclusivo). Keys del catálogo en
    // src/lib/profile/customization-presets.ts. Validación contra el catálogo
    // vive en server action, no en schema (para que sumar un preset nuevo no
    // requiera redeploy del schema OpenAPI).
    accentColor: z.string().nullable(),
    bannerPreset: z.string().nullable(),
    cardStyle: z.string().nullable(),
    locale: z.string().default("es"),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Profile");

export const ProfileUpdateSchema = ProfileSchema.pick({
  displayName: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  bio: true,
  country: true,
  city: true,
  birthdate: true,
  phone: true,
  dominantHand: true,
  preferredSport: true,
  skillLevel: true,
  accentColor: true,
  bannerPreset: true,
  cardStyle: true,
  locale: true,
})
  .partial()
  .openapi("ProfileUpdate");

export const SignUpSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    username: UsernameSchema,
    displayName: z.string().min(2).max(80),
    locale: LocaleSchema.optional(),
  })
  .openapi("SignUp");

export const SignInSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1),
  })
  .openapi("SignIn");

export const SwitchRoleSchema = z
  .object({
    role: MpRoleSchema,
    clubId: UuidSchema.optional(),
    partnerId: UuidSchema.optional(),
  })
  .openapi("SwitchRole");

export const RoleAssignmentSchema = z
  .object({
    role: MpRoleSchema,
    clubId: UuidSchema.nullable(),
    partnerId: UuidSchema.nullable(),
    grantedAt: IsoDateTimeSchema,
  })
  .openapi("RoleAssignment");

export const SessionResponseSchema = z
  .object({
    user: ProfileSchema,
    activeRole: MpRoleSchema.nullable(),
    activeClubId: UuidSchema.nullable(),
    roles: z.array(RoleAssignmentSchema),
  })
  .openapi("Session");

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
export type SignUpInput = z.infer<typeof SignUpSchema>;
export type SignInInput = z.infer<typeof SignInSchema>;
export type SwitchRoleInput = z.infer<typeof SwitchRoleSchema>;
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
