"use server";

// Server actions de customización de perfil (MP+ exclusivo).
//
// El path normal del user (panel Personalizar) pasa por acá. updateProfile
// genérico (src/server/actions/auth.ts) acepta los mismos campos pero NO
// chequea MP+ — está reservado para admin/legacy. Cualquier UI nueva del
// user debe llamar setProfileCustomization, no updateProfile directo.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { getPlanForUser } from "@/lib/auth/plan";
import {
  ACCENT_KEYS,
  BANNER_KEYS,
  CARD_STYLE_KEYS,
  findAccent,
  findBanner,
  findCardStyle,
  findTheme,
  themeColumns,
} from "@/lib/profile/customization-presets";
import { canUsePreset } from "@/lib/profile/bundles";
import { getInactiveThemeKeys } from "@/lib/profile/theme-settings.server";

const PresetKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .nullable()
  .optional();

const SetCustomizationSchema = z
  .object({
    accentColor: PresetKeySchema,
    bannerPreset: PresetKeySchema,
    cardStyle: PresetKeySchema,
  })
  .refine(
    (v) => v.accentColor !== undefined || v.bannerPreset !== undefined || v.cardStyle !== undefined,
    { message: "Especifica al menos un campo a actualizar" },
  );

// ── setTheme ──────────────────────────────────────────────────────────────
// Path nuevo del panel Personalizar: el user elige UN tema curado, que setea
// accent_color + card_style + banner_preset coherentes. Reemplaza la mezcla
// libre (que salía fea). Valida ownership del bundle del tema.
const SetThemeSchema = z.object({ theme: z.string().trim().min(1).max(40) });

export async function setTheme(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetThemeSchema, input, async ({ theme }) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

    const t = findTheme(theme);
    if (!t) throw new MpError("PROFILE.THEME_INVALID", "Tema no válido", 422);

    // Tema desactivado por admin (theme_settings, mig 129). 'default' nunca se
    // desactiva, así que no hace falta exceptuarlo acá.
    const inactive = await getInactiveThemeKeys(supabase);
    if (inactive.has(t.key)) {
      throw new MpError("PROFILE.THEME_INACTIVE", "Este tema no está disponible", 409);
    }

    // 'free' (Clásico) siempre disponible; el resto requiere ownership.
    if (t.bundleKey !== "free") {
      const plan = await getPlanForUser(supabase, user.id);
      const isPremium = plan.tier === "premium";
      const { data: grantRows, error: grantErr } = await supabase
        .from("profile_cosmetic_grants")
        .select("bundle_key")
        .eq("user_id", user.id);
      if (grantErr) throw new MpError("PROFILE.READ_FAILED", grantErr.message, 500);
      const myGrants = new Set(
        ((grantRows ?? []) as Array<{ bundle_key: string }>).map((g) => g.bundle_key),
      );
      if (!canUsePreset(t.bundleKey, { isPremium, myGrants })) {
        // Cualquier tema no-free requiere MP+ activo primero.
        if (!isPremium) {
          throw new MpError("PROFILE.PREMIUM_REQUIRED", "Este tema requiere MatchPoint+", 402);
        }
        // MP+ activo pero falta el grant del pack.
        throw new MpError("PROFILE.PRESET_LOCKED", `Este tema requiere desbloquear ${t.bundleKey}`, 403);
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update(themeColumns(t) as never)
      .eq("id", user.id);
    if (error) throw new MpError("PROFILE.UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function setProfileCustomization(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetCustomizationSchema, input, async (data) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

    // Plan tier (define qué presets 'mp_plus' puede usar).
    const plan = await getPlanForUser(supabase, user.id);
    const isPremium = plan.tier === "premium";

    // Cargar grants pagos del user (para presets que viven en bundles).
    const { data: grantRows, error: grantErr } = await supabase
      .from("profile_cosmetic_grants")
      .select("bundle_key")
      .eq("user_id", user.id);
    if (grantErr) throw new MpError("PROFILE.READ_FAILED", grantErr.message, 500);
    const myGrants = new Set(
      ((grantRows ?? []) as Array<{ bundle_key: string }>).map((g) => g.bundle_key),
    );

    // Validar keys contra el catálogo. null = limpiar el preset (volver a
    // default). Si el key no es null, debe existir en el catálogo Y el user
    // debe tener ownership (MP+ activo para 'mp_plus', o grant para bundles).
    const fields: Record<string, string[]> = {};
    function checkOwnership(
      kind: "accentColor" | "bannerPreset" | "cardStyle",
      key: string,
      bundleKey: string,
    ) {
      if (canUsePreset(bundleKey, { isPremium, myGrants })) return;
      if (bundleKey === "mp_plus") {
        fields[kind] = ["Requiere MatchPoint+ activo"];
      } else {
        fields[kind] = [`Requiere desbloquear ${bundleKey}`];
      }
    }
    if (data.accentColor != null) {
      const obj = findAccent(data.accentColor);
      if (!obj || !ACCENT_KEYS.has(data.accentColor)) {
        fields.accentColor = ["Preset no válido"];
      } else {
        checkOwnership("accentColor", data.accentColor, obj.bundleKey);
      }
    }
    if (data.bannerPreset != null) {
      const obj = findBanner(data.bannerPreset);
      if (!obj || !BANNER_KEYS.has(data.bannerPreset)) {
        fields.bannerPreset = ["Preset no válido"];
      } else {
        checkOwnership("bannerPreset", data.bannerPreset, obj.bundleKey);
      }
    }
    if (data.cardStyle != null) {
      const obj = findCardStyle(data.cardStyle);
      if (!obj || !CARD_STYLE_KEYS.has(data.cardStyle)) {
        fields.cardStyle = ["Preset no válido"];
      } else {
        checkOwnership("cardStyle", data.cardStyle, obj.bundleKey);
      }
    }
    if (Object.keys(fields).length > 0) {
      // Si el único motivo de fallo es "requiere MP+" en TODOS los campos
      // intentados, devolver PREMIUM_REQUIRED (más actionable que VALIDATION).
      const allMpPlus = Object.values(fields).every((arr) =>
        arr[0]?.includes("MatchPoint+"),
      );
      if (allMpPlus) {
        throw new MpError(
          "PROFILE.PREMIUM_REQUIRED",
          "La customización de perfil requiere MatchPoint+",
          402,
          fields,
        );
      }
      throw new MpError("PROFILE.PRESET_LOCKED", "Preset no desbloqueado", 403, fields);
    }

    const patch: Record<string, unknown> = {};
    if (data.accentColor !== undefined) patch.accent_color = data.accentColor;
    if (data.bannerPreset !== undefined) patch.banner_preset = data.bannerPreset;
    if (data.cardStyle !== undefined) patch.card_style = data.cardStyle;

    const { error } = await supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", user.id);
    if (error) throw new MpError("PROFILE.UPDATE_FAILED", error.message, 500);

    return { ok: true as const };
  });
}
