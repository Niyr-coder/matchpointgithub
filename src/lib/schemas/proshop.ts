// Pro shop schemas. Quick-sale flow (employee POS) is the priority; user-facing
// cart checkout comes later.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpCurrencySchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const ProductSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema.nullable(),
    categoryId: UuidSchema.nullable(),
    sku: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    priceCents: z.number().int(),
    currency: MpCurrencySchema,
    stock: z.number().int(),
    lowStockThreshold: z.number().int(),
    active: z.boolean(),
    coverUrl: z.string().url().nullable(),
    attributes: z.record(z.string(), z.unknown()).default({}),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Product");

export const ProductListParamsSchema = z
  .object({
    clubId: UuidSchema.optional(),
    q: z.string().optional(),
    categoryId: UuidSchema.optional(),
    activeOnly: z.coerce.boolean().default(true),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(40),
  })
  .openapi("ProductListParams");

export const SaleItemInputSchema = z
  .object({
    productId: UuidSchema,
    qty: z.number().int().min(1).max(50),
  })
  .openapi("SaleItemInput");

export const SaleCreateSchema = z
  .object({
    clubId: UuidSchema,
    items: z.array(SaleItemInputSchema).min(1).max(50),
    method: z.enum(["cash", "card", "transfer", "wallet"]),
    customerUserId: UuidSchema.nullable().optional(),
    customerName: z.string().max(120).nullable().optional(),
  })
  .openapi("SaleCreate");

export const SaleSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    customerUserId: UuidSchema.nullable(),
    cartId: UuidSchema.nullable(),
    transactionId: UuidSchema.nullable(),
    totalCents: z.number().int(),
    currency: MpCurrencySchema,
    soldBy: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Sale");

export type Product = z.infer<typeof ProductSchema>;
export type Sale = z.infer<typeof SaleSchema>;
export type SaleCreate = z.infer<typeof SaleCreateSchema>;
