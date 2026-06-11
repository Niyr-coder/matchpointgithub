/** Kill switch global de Shop (jugador) y pro shop (empleado). */
export const SHOP_FLAG = "shop_enabled";

/** Solo encendido si el RPC devuelve explícitamente true (default en DB: off). */
export function isShopEnabled(flags: Record<string, boolean>): boolean {
  return flags[SHOP_FLAG] === true;
}
