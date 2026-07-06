// Capa 1 del patrón de refresh en 3 capas (ver docs/architecture/50-realtime.md):
//   1. revalidatePath en la server action (este helper) — cubre navegaciones
//      frescas y re-entradas server-side.
//   2. router.refresh() en el handler del cliente que mutó — quien hizo la
//      acción ve el cambio aunque el WebSocket esté caído.
//   3. Realtime (useRealtimeRefresh) — sincronía cross-user con debounce.
//
// Toda mutación que cambie ocupación de canchas (reservations, walkins,
// check_ins) DEBE llamar este helper en vez de mantener su propia lista de
// rutas. Las listas ad-hoc por action son la razón por la que las superficies
// de employee quedaron fuera de sync con las de owner/manager.
import "server-only";

import { revalidatePath } from "next/cache";

// Superficies staff que renderizan ocupación/colas: tiles de canchas,
// grid semanal de reservas, cola de walk-ins y panel de check-in.
const OCCUPANCY_PATHS = [
  "/dashboard/employee",
  "/dashboard/employee/e-checkin",
  "/dashboard/employee/e-walkins",
  "/dashboard/employee/e-calendario",
  "/dashboard/employee/e-reservas",
  "/dashboard/owner",
  "/dashboard/owner/club-canchas",
  "/dashboard/owner/club-reservas",
  "/dashboard/manager",
  "/dashboard/manager/club-canchas",
  "/dashboard/manager/club-reservas",
  "/dashboard/manager/club-walkins",
] as const;

// Superficies del jugador; solo aplican cuando la mutación toca una reserva
// visible para él (crear/cancelar/no-show/check-in), no para la cola interna
// de walk-ins.
const PLAYER_PATHS = ["/dashboard/user", "/dashboard/user/mis-reservas"] as const;

export function revalidateCourtOccupancy(opts: { includePlayer?: boolean } = {}): void {
  for (const path of OCCUPANCY_PATHS) revalidatePath(path);
  if (opts.includePlayer) {
    for (const path of PLAYER_PATHS) revalidatePath(path);
  }
}
