"use server";

// Acciones admin sobre platform_config. Por ahora solo el switch multideporte.
// Ver docs/product/05-multisport.md.
import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireAdminUserId } from "@/lib/auth/session";
import { EDITABLE_CONFIG, type EditableConfigKey } from "@/lib/config/editable-config";

// ── Editor genérico de platform_config (pantalla admin-config) ──────────────
// Allowlist de keys editables desde la UI con su tipo esperado. Cualquier key
// fuera de esta lista se rechaza (no se inventan rows arbitrarias). Cada tipo
// define cómo se coacciona/valida el value jsonb antes de persistir.
const UpdateConfigSchema = z.object({
  key: z.string().min(1).max(80),
  // value llega como string desde el input de la UI; lo parseamos por tipo.
  value: z.union([z.string(), z.number(), z.boolean()]),
});

function coerceValue(key: EditableConfigKey, raw: string | number | boolean): number | boolean {
  const spec = EDITABLE_CONFIG[key];
  if (spec.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    const s = String(raw).trim().toLowerCase();
    return s === "true" || s === "sí" || s === "si" || s === "1" || s === "on";
  }
  // number
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) throw new MpError("CONFIG.INVALID_VALUE", `Valor inválido para ${key}`, 422);
  if (spec.min !== undefined && n < spec.min) throw new MpError("CONFIG.INVALID_VALUE", `${key} debe ser ≥ ${spec.min}`, 422);
  if (spec.max !== undefined && n > spec.max) throw new MpError("CONFIG.INVALID_VALUE", `${key} debe ser ≤ ${spec.max}`, 422);
  return n;
}

// Persiste un valor de configuración real en platform_config. Admin-only,
// auditado vía setAuditActor (service role + RLS bypass tras validar rol).
export async function updatePlatformConfig(input: unknown): Promise<ActionResult<{ key: string; value: number | boolean }>> {
  return runAction(UpdateConfigSchema, input, async ({ key, value }) => {
    if (!(key in EDITABLE_CONFIG)) {
      throw new MpError("CONFIG.KEY_NOT_EDITABLE", `La key "${key}" no es editable desde esta pantalla`, 422);
    }
    const typedKey = key as EditableConfigKey;
    const coerced = coerceValue(typedKey, value);

    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    const { error } = await admin
      .from("platform_config")
      .update({ value: coerced, updated_at: new Date().toISOString(), updated_by: adminId } as never)
      .eq("key", typedKey);
    if (error) throw new MpError("CONFIG.UPDATE_FAILED", error.message, 500);
    return { key: typedKey, value: coerced };
  });
}
