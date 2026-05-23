import "server-only";

// RBAC granular (Stage 1): enforcement por capacidad, respaldado por la matriz
// real `role_capabilities` + el helper SQL `mp_role_can` (mig 158). admin = todo
// (inmutable). Úsalo en server actions: `await assertCapability("pay.refund", { clubId })`.
// El enforcement profundo en RLS es Stage 3.
import { getServerClient } from "@/lib/db/client.server";
import { AuthError } from "@/lib/auth/session";

// Capacidades conocidas (catálogo en la tabla `capabilities`). Tipadas para evitar typos.
export type Capability =
  | "clubs.view" | "clubs.create" | "clubs.verify" | "clubs.suspend"
  | "users.view" | "users.suspend" | "users.impersonate"
  | "pay.process" | "pay.refund" | "pay.payout"
  | "mod.resolve" | "mod.ban" | "mod.appeal"
  | "sys.audit" | "sys.config" | "sys.flags" | "sys.roles";

type Opts = { clubId?: string | null };

// ¿El usuario actual tiene la capacidad (opcionalmente en un club)? No lanza.
export async function roleCan(cap: Capability, opts: Opts = {}): Promise<boolean> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("mp_role_can", {
    _uid: user.id,
    _cap: cap,
    _club: opts.clubId ?? undefined,
  });
  if (error) return false;
  return Boolean(data);
}

// Igual que roleCan pero lanza si falta. Devuelve el userId para encadenar.
export async function assertCapability(cap: Capability, opts: Opts = {}): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data, error } = await supabase.rpc("mp_role_can", {
    _uid: user.id,
    _cap: cap,
    _club: opts.clubId ?? undefined,
  });
  if (error || !data) {
    throw new AuthError("AUTH.ROLE_REQUIRED", `Falta la capacidad '${cap}' para esta acción`);
  }
  return user.id;
}
