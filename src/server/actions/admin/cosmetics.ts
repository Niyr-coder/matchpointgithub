"use server";

// Admin actions para bundles cosméticos: otorgar/revocar a un user.
//
// Flow esperado (fase 1, sin self-service de compra):
//   1. User contacta soporte / paga por transferencia / DeUna.
//   2. Admin entra a /dashboard/admin/admin-cosmetics, busca al user,
//      otorga el bundle con una nota (memo de pago).
//   3. Trigger system: user recibe DM de MATCHPOINT diciendo "Pack X
//      desbloqueado". Audit registra actor=admin.
//
// La self-service flow (user clickea Comprar → sube comprobante → admin
// aprueba en mismo panel) queda como placeholder Stage 4.

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { PROFILE_THEMES } from "@/lib/profile/customization-presets";

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

// ── grantBundleToUser ──────────────────────────────────────────────────
const GrantBundleSchema = z.object({
  userId: UuidSchema,
  bundleKey: z.string().trim().min(1).max(40),
  note: z.string().trim().max(280).optional(),
});

export async function grantBundleToUser(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(GrantBundleSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // Validar que el bundle existe y está activo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bundle, error: bErr } = await (admin as any)
      .from("cosmetic_bundles")
      .select("key,label,active")
      .eq("key", data.bundleKey)
      .maybeSingle();
    if (bErr) throw new MpError("COSMETICS.DB_ERROR", bErr.message, 500);
    if (!bundle) throw new MpError("COSMETICS.BUNDLE_NOT_FOUND", "Bundle no existe", 404);
    if (!bundle.active) throw new MpError("COSMETICS.BUNDLE_INACTIVE", "Bundle inactivo", 400);

    // Upsert del grant (si ya existe, no es error — idempotente).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: gErr } = await (admin as any)
      .from("profile_cosmetic_grants")
      .upsert(
        {
          user_id: data.userId,
          bundle_key: data.bundleKey,
          granted_by: adminId,
          note: data.note ?? null,
        },
        { onConflict: "user_id,bundle_key" },
      );
    if (gErr) throw new MpError("COSMETICS.GRANT_FAILED", gErr.message, 500);

    // DM al user. Fire-and-forget.
    try {
      const [{ sendSystemMessage, renderTemplate }, { getProfileSummary }] = await Promise.all([
        import("@/lib/messages/system"),
        import("@/lib/auth/profile"),
      ]);
      const profile = await getProfileSummary(data.userId);
      const firstName = (profile.displayName ?? "jugador").split(" ")[0];
      await sendSystemMessage({
        recipientUserId: data.userId,
        kind: "cosmetic_bundle_granted",
        body: renderTemplate("cosmetic_bundle_granted", {
          firstName,
          bundleLabel: bundle.label as string,
        }),
        payload: { bundleKey: data.bundleKey },
      });
    } catch (e) {
      console.error("[cosmetics.grant] system DM failed", e);
    }

    return { ok: true as const };
  });
}

// ── revokeBundleFromUser ───────────────────────────────────────────────
const RevokeBundleSchema = z.object({
  userId: UuidSchema,
  bundleKey: z.string().trim().min(1).max(40),
});

export async function revokeBundleFromUser(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RevokeBundleSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("profile_cosmetic_grants")
      .delete()
      .eq("user_id", data.userId)
      .eq("bundle_key", data.bundleKey);
    if (error) throw new MpError("COSMETICS.REVOKE_FAILED", error.message, 500);

    return { ok: true as const };
  });
}

// ── listGrantsForUser ──────────────────────────────────────────────────
const ListGrantsSchema = z.object({ userId: UuidSchema });

export type CosmeticGrantRow = {
  bundleKey: string;
  bundleLabel: string;
  grantedAt: string;
  grantedBy: string | null;
  note: string | null;
};

export async function listGrantsForUser(
  input: unknown,
): Promise<ActionResult<CosmeticGrantRow[]>> {
  return runAction(ListGrantsSchema, input, async (data) => {
    await requireAdminUserId();
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (admin as any)
      .from("profile_cosmetic_grants")
      .select("bundle_key,granted_at,granted_by,note,cosmetic_bundles!inner(label)")
      .eq("user_id", data.userId)
      .order("granted_at", { ascending: false });
    if (error) throw new MpError("COSMETICS.DB_ERROR", error.message, 500);

    return ((rows ?? []) as Array<{
      bundle_key: string;
      granted_at: string;
      granted_by: string | null;
      note: string | null;
      cosmetic_bundles: { label: string } | { label: string }[];
    }>).map((r) => {
      const cb = Array.isArray(r.cosmetic_bundles) ? r.cosmetic_bundles[0] : r.cosmetic_bundles;
      return {
        bundleKey: r.bundle_key,
        bundleLabel: cb?.label ?? r.bundle_key,
        grantedAt: r.granted_at,
        grantedBy: r.granted_by,
        note: r.note,
      };
    });
  });
}

// ── searchUsers (helper para el picker admin) ──────────────────────────
const SearchUsersSchema = z.object({ q: z.string().trim().min(2).max(60) });

export type CosmeticUserSearchRow = {
  userId: string;
  displayName: string;
  username: string | null;
  email: string | null;
};

export async function searchUsersForCosmetics(
  input: unknown,
): Promise<ActionResult<CosmeticUserSearchRow[]>> {
  return runAction(SearchUsersSchema, input, async (data) => {
    await requireAdminUserId();
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (admin as any)
      .from("profiles")
      .select("id,display_name,username")
      .or(`display_name.ilike.%${data.q}%,username.ilike.%${data.q}%`)
      .eq("is_system", false)
      .limit(15);
    if (error) throw new MpError("COSMETICS.DB_ERROR", error.message, 500);
    return ((rows ?? []) as Array<{ id: string; display_name: string; username: string | null }>).map((r) => ({
      userId: r.id,
      displayName: r.display_name,
      username: r.username,
      email: null,
    }));
  });
}

// ── setThemeActive ─────────────────────────────────────────────────────────
// Activa/desactiva un tema (tabla theme_settings, mig 129). Desactivar es un
// hard-kill: además de marcar inactive, revierte a Clásico (3 columnas null) a
// todos los perfiles que lo tengan aplicado. 'default' (Clásico) no se toca.
const SetThemeActiveSchema = z.object({
  key: z.string().trim().min(1).max(40),
  active: z.boolean(),
});

export async function setThemeActive(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetThemeActiveSchema, input, async ({ key, active }) => {
    if (key === "default") {
      throw new MpError("COSMETICS.THEME_PROTECTED", "El tema Clásico no se puede desactivar", 400);
    }
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (admin as any)
      .from("theme_settings")
      .upsert({ key, active, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (upErr) throw new MpError("COSMETICS.DB_ERROR", upErr.message, 500);

    // Hard-kill: revertir a Clásico a quien lo tenga puesto (themeColumns escribe
    // la key en las 3 columnas; basta matchear accent_color).
    if (!active) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: revErr } = await (admin as any)
        .from("profiles")
        .update({ accent_color: null, card_style: null, banner_preset: null })
        .eq("accent_color", key)
        .eq("is_system", false);
      if (revErr) throw new MpError("COSMETICS.DB_ERROR", revErr.message, 500);
    }
    return { ok: true as const };
  });
}

// ── listInactiveThemes ───────────────────────────────────────────────────────
// Para la UI admin: keys de temas actualmente inactivos.
export async function listInactiveThemes(): Promise<ActionResult<string[]>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("theme_settings")
      .select("key")
      .eq("active", false);
    if (error) throw new MpError("COSMETICS.DB_ERROR", error.message, 500);
    return ((data ?? []) as Array<{ key: string }>).map((r) => r.key);
  });
}

// ── setAllThemesActive ───────────────────────────────────────────────────────
// Bulk de los temas INCLUIDOS (mp_plus, no-pack — los que viven en la sección
// "Temas" del admin). Los temas de pack se gestionan desde su bundle. Desactivar
// es hard-kill (revierte a Clásico a quien use uno de esos temas).
const SetAllThemesSchema = z.object({ active: z.boolean() });

export async function setAllThemesActive(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetAllThemesSchema, input, async ({ active }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    const keys = PROFILE_THEMES.filter((t) => t.bundleKey === "mp_plus").map((t) => t.key);
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (admin as any)
      .from("theme_settings")
      .upsert(keys.map((key) => ({ key, active, updated_at: now })), { onConflict: "key" });
    if (upErr) throw new MpError("COSMETICS.DB_ERROR", upErr.message, 500);

    if (!active) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: revErr } = await (admin as any)
        .from("profiles")
        .update({ accent_color: null, card_style: null, banner_preset: null })
        .eq("is_system", false)
        .in("accent_color", keys);
      if (revErr) throw new MpError("COSMETICS.DB_ERROR", revErr.message, 500);
    }
    return { ok: true as const };
  });
}

// ── Bundles: listar + editar precio + activar/desactivar ─────────────────────
export type BundleAdminRow = {
  key: string;
  label: string;
  description: string | null;
  priceCents: number;
  active: boolean;
};

export async function listBundles(): Promise<ActionResult<BundleAdminRow[]>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("cosmetic_bundles")
      .select("key,label,description,price_cents,active,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new MpError("COSMETICS.DB_ERROR", error.message, 500);
    return (
      (data ?? []) as Array<{
        key: string;
        label: string;
        description: string | null;
        price_cents: number;
        active: boolean;
      }>
    ).map((b) => ({
      key: b.key,
      label: b.label,
      description: b.description,
      priceCents: b.price_cents,
      active: b.active,
    }));
  });
}

const SetBundlePriceSchema = z.object({
  key: z.string().trim().min(1).max(40),
  priceCents: z.number().int().min(0).max(1000000),
});

export async function setBundlePrice(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetBundlePriceSchema, input, async ({ key, priceCents }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("cosmetic_bundles")
      .update({ price_cents: priceCents, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) throw new MpError("COSMETICS.DB_ERROR", error.message, 500);
    return { ok: true as const };
  });
}

const SetBundleActiveSchema = z.object({
  key: z.string().trim().min(1).max(40),
  active: z.boolean(),
});

export async function setBundleActive(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetBundleActiveSchema, input, async ({ key, active }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("cosmetic_bundles")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) throw new MpError("COSMETICS.DB_ERROR", error.message, 500);
    return { ok: true as const };
  });
}
