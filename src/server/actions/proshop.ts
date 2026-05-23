"use server";

// Pro shop: product catalog reads + employee POS quick-sale.
// Quick-sale composes 3 writes in sequence: transaction → sale → sale_items + inventory.
// Postgres doesn't expose a JS transaction wrapper through supabase-js, so we rely on
// the upserts being independent enough that partial failures don't corrupt the model:
// the transaction row is the system of record for money; sales/items are reporting.
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { withIdempotency } from "@/lib/api/idempotency";
import { assertRateLimit, RATE_LIMITS } from "@/lib/api/ratelimit";
import {
  ProductCreateSchema,
  ProductListParamsSchema,
  ProductSchema,
  ProductStockAdjustSchema,
  ProductUpdateSchema,
  SaleCreateSchema,
  SaleSchema,
  type Product,
  type Sale,
} from "@/lib/schemas/proshop";
import { UuidSchema } from "@/lib/schemas/common";

function mapProduct(row: Record<string, unknown>): Product {
  return ProductSchema.parse({
    id: row.id,
    clubId: (row.club_id as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    sku: row.sku ?? null,
    name: row.name,
    description: row.description ?? null,
    priceCents: row.price_cents,
    currency: row.currency,
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
    active: row.active,
    coverUrl: row.cover_url ?? null,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapSale(row: Record<string, unknown>): Sale {
  return SaleSchema.parse({
    id: row.id,
    clubId: row.club_id,
    customerUserId: row.customer_user_id ?? null,
    cartId: row.cart_id ?? null,
    transactionId: row.transaction_id ?? null,
    totalCents: row.total_cents,
    currency: row.currency,
    soldBy: row.sold_by ?? null,
    createdAt: row.created_at,
  });
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function requireClubStaff(clubId: string): Promise<string> {
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
      (r.club_id === clubId &&
        (r.role === "owner" || r.role === "manager" || r.role === "employee")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
  return userId;
}

// ── listProducts (public) ──────────────────────────────────────────────
export async function listProducts(input: unknown): Promise<ActionResult<Product[]>> {
  return runAction(ProductListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let q = supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true })
      .range(from, to);
    if (params.activeOnly) q = q.eq("active", true);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.categoryId) q = q.eq("category_id", params.categoryId);
    if (params.q) q = q.ilike("name", `%${params.q}%`);

    const { data, error } = await q;
    if (error) throw new MpError("PROSHOP.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapProduct);
  });
}

// ── getProduct (public) ────────────────────────────────────────────────
export async function getProduct(input: unknown): Promise<ActionResult<Product>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) throw new MpError("PROSHOP.NOT_FOUND", "Product not found", 404);
    return mapProduct(data);
  });
}

// ── createProshopProduct (staff/employee) ──────────────────────────────
export async function createProshopProduct(input: unknown): Promise<ActionResult<Product>> {
  return runAction(ProductCreateSchema, input, async (data) => {
    await requireClubStaff(data.clubId);
    const supabase = await getServerClient();

    const { data: row, error } = await supabase
      .from("products")
      .insert({
        club_id: data.clubId,
        category_id: data.categoryId ?? null,
        sku: data.sku ?? null,
        name: data.name,
        description: data.description ?? null,
        price_cents: data.priceCents,
        currency: data.currency,
        stock: data.stock,
        low_stock_threshold: data.lowStockThreshold,
        active: data.active,
        cover_url: data.coverUrl ?? null,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("PROSHOP.DUPLICATE_SKU", "SKU already exists in this club", 409);
      }
      throw new MpError("PROSHOP.CREATE_FAILED", error.message, 500);
    }
    return mapProduct(row);
  });
}

// ── updateProshopProduct (staff/employee) ──────────────────────────────
export async function updateProshopProduct(input: unknown): Promise<ActionResult<Product>> {
  return runAction(ProductUpdateSchema, input, async ({ productId, patch }) => {
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("products")
      .select("club_id")
      .eq("id", productId)
      .single();
    if (!existing) throw new MpError("PROSHOP.NOT_FOUND", "Product not found", 404);
    if (existing.club_id) await requireClubStaff(existing.club_id as string);
    else await requireUserId();

    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.sku !== undefined) payload.sku = patch.sku;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.priceCents !== undefined) payload.price_cents = patch.priceCents;
    if (patch.currency !== undefined) payload.currency = patch.currency;
    if (patch.lowStockThreshold !== undefined) payload.low_stock_threshold = patch.lowStockThreshold;
    if (patch.categoryId !== undefined) payload.category_id = patch.categoryId;
    if (patch.coverUrl !== undefined) payload.cover_url = patch.coverUrl;
    if (patch.active !== undefined) payload.active = patch.active;

    const { data, error } = await supabase
      .from("products")
      .update(payload as never)
      .eq("id", productId)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("PROSHOP.DUPLICATE_SKU", "SKU already exists in this club", 409);
      }
      throw new MpError("PROSHOP.UPDATE_FAILED", error.message, 400);
    }
    return mapProduct(data);
  });
}

// ── adjustProshopStock (staff/employee, reason-coded inventory movement) ──
// Stock change para reposición / ajuste manual / merma. Las ventas usan la
// RPC `fn_create_sale` con reason='sale' y no pasan por aquí.
export async function adjustProshopStock(input: unknown): Promise<ActionResult<Product>> {
  return runAction(ProductStockAdjustSchema, input, async ({ productId, delta, reason }) => {
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("products")
      .select("club_id,stock")
      .eq("id", productId)
      .single();
    if (!existing) throw new MpError("PROSHOP.NOT_FOUND", "Product not found", 404);
    const clubId = existing.club_id as string | null;
    let userId: string;
    if (clubId) userId = await requireClubStaff(clubId);
    else userId = await requireUserId();

    const newStock = (existing.stock as number) + delta;
    if (newStock < 0) {
      throw new MpError("PROSHOP.OUT_OF_STOCK", "Stock cannot go negative", 422);
    }

    const { data: row, error } = await supabase
      .from("products")
      .update({ stock: newStock } as never)
      .eq("id", productId)
      .select()
      .single();
    if (error) throw new MpError("PROSHOP.UPDATE_FAILED", error.message, 500);

    const { error: movErr } = await supabase
      .from("inventory_movements")
      .insert({
        product_id: productId,
        delta,
        reason,
        created_by: userId,
      } as never);
    if (movErr) console.error("[adjustProshopStock] movement insert failed", movErr);

    return mapProduct(row);
  });
}

// ── createSale (employee POS, idempotent, atomic via RPC) ──────────────
// Delega la venta entera a `fn_create_sale` (migration 039), que corre
// transactions + sales + sale_items + UPDATE stock + inventory_movements
// dentro de una transacción Postgres con `SELECT ... FOR UPDATE` sobre
// products. Evita race conditions y deja todo consistente o nada.
export async function createSale(input: unknown): Promise<ActionResult<Sale>> {
  return runAction(SaleCreateSchema, input, async (data) => {
    const userId = await requireClubStaff(data.clubId);
    await assertRateLimit({ key: `proshop:sale:${userId}`, ...RATE_LIMITS.mutationsAuthn });
    const idemKey = (await headers()).get("idempotency-key") ?? undefined;

    return withIdempotency(
      { key: idemKey, scope: "createSale", userId, input: data },
      async () => {
        const supabase = await getServerClient();
        const items = data.items.map((i) => ({ product_id: i.productId, qty: i.qty }));

        // El generador de tipos marca p_customer_user_id / p_customer_name como
        // `string` (no nullable) pero la función PL/pgSQL los acepta NULL. Cast
        // a `never` evita inflar la firma con args opcionales artificiales.
        const { data: saleId, error } = await supabase.rpc("fn_create_sale", {
          p_club_id: data.clubId,
          p_user_id: userId,
          p_customer_user_id: (data.customerUserId ?? null) as unknown as string,
          p_customer_name: (data.customerName ?? null) as unknown as string,
          p_method: data.method,
          p_items: items,
        });
        if (error) {
          const msg = error.message ?? "";
          // Map raise exception 'CODE' → MpError tipado.
          if (msg.includes("PROSHOP.OUT_OF_STOCK")) {
            throw new MpError("PROSHOP.OUT_OF_STOCK", msg, 422);
          }
          if (msg.includes("PROSHOP.NOT_FOUND")) {
            throw new MpError("PROSHOP.NOT_FOUND", "Producto no encontrado", 404);
          }
          if (msg.includes("PROSHOP.INACTIVE")) {
            throw new MpError("PROSHOP.INACTIVE", "Producto inactivo", 422);
          }
          if (msg.includes("PROSHOP.CLUB_MISMATCH")) {
            throw new MpError("PROSHOP.CLUB_MISMATCH", "El producto no pertenece al club", 422);
          }
          if (msg.includes("PROSHOP.CURRENCY_MIXED")) {
            throw new MpError("PROSHOP.CURRENCY_MIXED", "Todos los items deben tener la misma moneda", 422);
          }
          if (msg.includes("PROSHOP.EMPTY") || msg.includes("PROSHOP.INVALID_QTY")) {
            throw new MpError("PROSHOP.EMPTY", "Items inválidos", 422);
          }
          if (msg.includes("CASH.SESSION_CLOSED")) {
            throw new MpError("CASH.SESSION_CLOSED", "Abre una sesión de caja antes de vender en efectivo", 422);
          }
          throw new MpError("PROSHOP.SALE_FAILED", msg, 500);
        }
        if (!saleId) throw new MpError("PROSHOP.SALE_FAILED", "Sale id missing", 500);

        // Hidratar sale para el caller (la RPC retorna solo el id por simplicidad).
        const { data: sale, error: fetchErr } = await supabase
          .from("sales")
          .select("*")
          .eq("id", saleId as string)
          .single();
        if (fetchErr || !sale) throw new MpError("PROSHOP.SALE_FAILED", "Fetch sale failed", 500);
        return mapSale(sale);
      },
    );
  });
}
