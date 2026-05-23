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

export const ProductCreateSchema = z
  .object({
    clubId: UuidSchema,
    name: z.string().trim().min(1).max(120),
    sku: z.string().trim().max(64).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    priceCents: z.number().int().min(0),
    currency: MpCurrencySchema,
    stock: z.number().int().min(0).default(0),
    lowStockThreshold: z.number().int().min(0).default(5),
    categoryId: UuidSchema.nullable().optional(),
    coverUrl: z.string().url().nullable().optional(),
    active: z.boolean().default(true),
  })
  .openapi("ProductCreate");

export const ProductUpdateSchema = z
  .object({
    productId: UuidSchema,
    patch: z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        sku: z.string().trim().max(64).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        priceCents: z.number().int().min(0).optional(),
        currency: MpCurrencySchema.optional(),
        lowStockThreshold: z.number().int().min(0).optional(),
        categoryId: UuidSchema.nullable().optional(),
        coverUrl: z.string().url().nullable().optional(),
        active: z.boolean().optional(),
      })
      .refine((p) => Object.keys(p).length > 0, "patch cannot be empty"),
  })
  .openapi("ProductUpdate");

export const ProductStockAdjustSchema = z
  .object({
    productId: UuidSchema,
    delta: z.number().int().refine((n) => n !== 0, "delta must be non-zero"),
    reason: z.enum(["purchase", "adjustment", "return", "damaged"]),
  })
  .openapi("ProductStockAdjust");

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
export type ProductCreate = z.infer<typeof ProductCreateSchema>;
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;
