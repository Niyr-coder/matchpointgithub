// Sales lead intake (formulario público "Hablar con ventas").
import { z } from "zod";

export const SalesLeadTypeSchema = z.enum(["club", "partner", "coach", "other"]);
export type SalesLeadType = z.infer<typeof SalesLeadTypeSchema>;

export const SALES_LEAD_TYPE_LABELS: Record<SalesLeadType, string> = {
  club: "Soy un club",
  partner: "Soy partner / organizador",
  coach: "Soy coach / profesor",
  other: "Otro",
};

// Honeypot: campo oculto que un humano nunca rellena. Si llega con valor,
// rechazamos como spam (silenciosamente desde el cliente, 400 desde la API).
export const SalesLeadCreateSchema = z.object({
  name: z.string().trim().min(2, "Ingresa tu nombre").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  leadType: SalesLeadTypeSchema,
  businessName: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  message: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  // Honeypot — debe llegar vacío.
  website: z
    .string()
    .max(200)
    .optional()
    .refine((v) => !v, { message: "spam" }),
});

export type SalesLeadCreate = z.infer<typeof SalesLeadCreateSchema>;

export const SalesLeadCreatedSchema = z.object({
  id: z.string().uuid(),
});

export type SalesLeadCreated = z.infer<typeof SalesLeadCreatedSchema>;
