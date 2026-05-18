// Shared Zod primitives. Every domain schema imports from here so refs
// in the OpenAPI doc stay DRY.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const UuidSchema = z
  .string()
  .uuid()
  .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" });

export const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .openapi({ format: "date-time", example: "2026-05-16T15:30:00Z" });

export const SlugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and dashes only")
  .openapi({ example: "club-norte-pickleball" });

export const UsernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_.]+$/i, "letters, digits, underscore and dot only")
  .openapi({ example: "vicente" });

export const EmailSchema = z.string().email().openapi({ example: "you@matchpoint.app" });

export const PasswordSchema = z
  .string()
  .min(8, "Minimum 8 characters")
  .max(128)
  .openapi({ writeOnly: true, format: "password" });

export const PhoneSchema = z.string().min(7).max(20).optional();

export const LocaleSchema = z.enum(["es", "en", "pt"]).default("es");

export const MpRoleSchema = z
  .enum(["admin", "partner", "user", "owner", "manager", "coach", "employee"])
  .openapi("MpRole");

export const MpSportSchema = z.enum(["tennis", "padel", "pickleball"]).openapi("MpSport");

export const MpMatchModeSchema = z.enum(["singles", "doubles"]).openapi("MpMatchMode");

export const MpSkillLevelSchema = z
  .enum(["beginner", "intermediate", "advanced", "pro"])
  .openapi("MpSkillLevel");

export const MpCurrencySchema = z
  .enum(["USD", "MXN", "CLP", "ARS", "BRL", "EUR"])
  .openapi("MpCurrency");

export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  q: z.string().optional(),
});
export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

export type MpRole = z.infer<typeof MpRoleSchema>;
export type MpSport = z.infer<typeof MpSportSchema>;
export type MpMatchMode = z.infer<typeof MpMatchModeSchema>;
export type MpSkillLevel = z.infer<typeof MpSkillLevelSchema>;
export type MpCurrency = z.infer<typeof MpCurrencySchema>;
