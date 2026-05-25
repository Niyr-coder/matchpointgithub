// Helpers de suspensión / ban de usuarios. Ver mig 173.
//
// Convenciones:
// - Un usuario está "suspendido" si tiene fila en user_suspensions con
//   reactivated_at IS NULL.
// - Suspendido NO equivale a borrado: el perfil sigue visible (con badge) y
//   los datos históricos (matches, reservas, etc.) se preservan.
// - Los efectos del estado suspendido se aplican en 4 puntos:
//     1) signIn (auth.ts) — rechaza login.
//     2) proxy.ts — invalida sesión activa en próximo request.
//     3) server actions de mutación crítica — `assertNotSuspended`.
//     4) UI pública — badge "Cuenta suspendida".
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { MpError } from "@/lib/api/errors";

type TypedClient = SupabaseClient<Database>;

export type SuspensionInfo = {
  id: string;
  reason: string;
  suspendedAt: string;
  suspendedBy: string | null;
};

// ── isUserSuspended ────────────────────────────────────────────────────
// Lookup mínimo. Devuelve true si hay una fila activa en user_suspensions.
// Fail open: si la query falla por cualquier razón, devolvemos false para no
// bloquear el sistema entero por un error en la tabla de suspensiones.
export async function isUserSuspended(
  supabase: TypedClient,
  userId: string,
): Promise<boolean> {
  // TODO: regenerar src/lib/db/types.ts para que user_suspensions tipee.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("user_suspensions")
    .select("id")
    .eq("user_id", userId)
    .is("reactivated_at", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

// ── getSuspensionInfo ──────────────────────────────────────────────────
// Para mostrar en UI admin / página de "cuenta suspendida" / badges.
export async function getSuspensionInfo(
  supabase: TypedClient,
  userId: string,
): Promise<SuspensionInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("user_suspensions")
    .select("id, reason, suspended_at, suspended_by")
    .eq("user_id", userId)
    .is("reactivated_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    reason: data.reason as string,
    suspendedAt: data.suspended_at as string,
    suspendedBy: (data.suspended_by as string | null) ?? null,
  };
}

// ── assertNotSuspended ─────────────────────────────────────────────────
// Para usar en server actions críticas (inscripciones, reservas, pagos,
// creación de teams/torneos). Lanza ACCOUNT.SUSPENDED si el usuario está
// suspendido. Código 403 (forbidden) — no es upgrade-required ni auth.
//
// Uso típico:
//   const userId = await requireUserId();
//   const supabase = await getServerClient();
//   await assertNotSuspended(supabase, userId);
export async function assertNotSuspended(
  supabase: TypedClient,
  userId: string,
): Promise<void> {
  if (await isUserSuspended(supabase, userId)) {
    throw new MpError(
      "ACCOUNT.SUSPENDED",
      "Tu cuenta está suspendida. Contacta a soporte para más información.",
      403,
    );
  }
}
