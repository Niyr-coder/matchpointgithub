// Lectura de la tabla key-value `platform_config`. Helpers tipados por key
// común. RLS solo permite leer al admin, así que en contextos no-admin (ej.
// server actions de partner que necesitan ver la comisión) usamos el admin
// client después de validar el caller — o mejor, fallback a defaults.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";

// Defaults seedeados también en migration 080 — los mantenemos aquí para que
// las pantallas no se queden en cero si la query falla.
const DEFAULTS = {
  take_rate_pct: 10,
  estelar_price_cents: 2000,
  refund_window_days: 7,
} as const;

type ConfigKey = keyof typeof DEFAULTS;

let cache: Partial<Record<ConfigKey, number>> | null = null;
let cacheExpires = 0;
const TTL_MS = 60 * 1000; // 1 minuto — cambios de config no necesitan ser instant

async function loadAll(): Promise<Record<ConfigKey, number>> {
  const now = Date.now();
  if (cache && now < cacheExpires) {
    return { ...DEFAULTS, ...cache } as Record<ConfigKey, number>;
  }
  const admin = getAdminClient();
  const { data } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("platform_config" as any)
    .select("key,value")
    .in("key", Object.keys(DEFAULTS));
  type Row = { key: string; value: unknown };
  const next: Partial<Record<ConfigKey, number>> = {};
  for (const row of (data ?? []) as unknown as Row[]) {
    const k = row.key as ConfigKey;
    // value es jsonb — puede venir como number o como objeto.
    const v = row.value;
    if (typeof v === "number") next[k] = v;
    else if (typeof v === "string" && !Number.isNaN(Number(v))) next[k] = Number(v);
  }
  cache = next;
  cacheExpires = now + TTL_MS;
  return { ...DEFAULTS, ...next } as Record<ConfigKey, number>;
}

export async function getTakeRatePct(): Promise<number> {
  const all = await loadAll();
  return all.take_rate_pct;
}

export async function getEstelarPriceCents(): Promise<number> {
  const all = await loadAll();
  return all.estelar_price_cents;
}

export async function getRefundWindowDays(): Promise<number> {
  const all = await loadAll();
  return all.refund_window_days;
}

export async function getAllPlatformConfig(): Promise<Record<ConfigKey, number>> {
  return loadAll();
}

// Lectura cruda (sin cache, sin coerción a number) de las keys que la pantalla
// admin de configuración expone para editar. Devuelve value jsonb tal cual +
// metadata de auditoría. Solo para uso server-side admin.
export type RawConfigRow = {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getRawPlatformConfig(keys: readonly string[]): Promise<Record<string, RawConfigRow>> {
  const admin = getAdminClient();
  const { data } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("platform_config" as any)
    .select("key,value,description,updated_at,updated_by")
    .in("key", keys as string[]);
  type Row = { key: string; value: unknown; description: string | null; updated_at: string | null; updated_by: string | null };
  const out: Record<string, RawConfigRow> = {};
  for (const row of (data ?? []) as unknown as Row[]) {
    out[row.key] = {
      key: row.key,
      value: row.value,
      description: row.description ?? null,
      updatedAt: row.updated_at ?? null,
      updatedBy: row.updated_by ?? null,
    };
  }
  return out;
}
