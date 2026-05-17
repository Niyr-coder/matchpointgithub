// Cash / POS schemas. Sessions are opened by employees; transactions get
// attached to whichever session is currently `open` for the club at insert time.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpCurrencySchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const PaymentMethodSchema = z
  .enum(["cash", "card", "transfer", "wallet", "free"])
  .openapi("PaymentMethod");

export const PaymentStatusSchema = z
  .enum(["pending", "authorized", "captured", "refunded", "failed", "disputed"])
  .openapi("PaymentStatus");

export const TransactionKindSchema = z
  .enum(["reservation", "class", "proshop_sale", "event", "tournament", "custom"])
  .openapi("TransactionKind");

export const CashSessionStatusSchema = z
  .enum(["open", "closed", "reconciled"])
  .openapi("CashSessionStatus");

export const CashSessionSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    openedBy: UuidSchema,
    openedAt: IsoDateTimeSchema,
    openingFloatCents: z.number().int(),
    closedBy: UuidSchema.nullable(),
    closedAt: IsoDateTimeSchema.nullable(),
    closingCountedCents: z.number().int().nullable(),
    expectedCents: z.number().int().nullable(),
    varianceCents: z.number().int().nullable(),
    notes: z.string().nullable(),
    status: CashSessionStatusSchema,
  })
  .openapi("CashSession");

export const TransactionSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    cashSessionId: UuidSchema.nullable(),
    kind: TransactionKindSchema,
    refId: UuidSchema.nullable(),
    customerUserId: UuidSchema.nullable(),
    customerName: z.string().nullable(),
    amountCents: z.number().int(),
    currency: MpCurrencySchema,
    method: PaymentMethodSchema,
    status: PaymentStatusSchema,
    provider: z.string().nullable(),
    providerPaymentId: z.string().nullable(),
    receiptUrl: z.string().nullable(),
    createdBy: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Transaction");

export const CashSessionOpenSchema = z
  .object({
    clubId: UuidSchema,
    openingFloatCents: z.number().int().min(0).default(0),
  })
  .openapi("CashSessionOpen");

export const CashSessionCloseSchema = z
  .object({
    closingCountedCents: z.number().int().min(0),
    notes: z.string().max(500).optional(),
  })
  .openapi("CashSessionClose");

export const TransactionCreateSchema = z
  .object({
    clubId: UuidSchema,
    kind: TransactionKindSchema,
    refId: UuidSchema.nullable().optional(),
    customerUserId: UuidSchema.nullable().optional(),
    customerName: z.string().max(120).nullable().optional(),
    amountCents: z.number().int(),
    currency: MpCurrencySchema,
    method: PaymentMethodSchema,
  })
  .openapi("TransactionCreate");

export const TransactionListParamsSchema = z
  .object({
    clubId: UuidSchema,
    sessionId: UuidSchema.optional(),
    kind: TransactionKindSchema.optional(),
    method: PaymentMethodSchema.optional(),
    from: IsoDateTimeSchema.optional(),
    to: IsoDateTimeSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .openapi("TransactionListParams");

export type CashSession = z.infer<typeof CashSessionSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionCreate = z.infer<typeof TransactionCreateSchema>;
