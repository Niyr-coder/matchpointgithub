// Lectura de estado MFA (Supabase TOTP) y gate para roles staff.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { RoleKey } from "@/lib/roles";
import { MpError } from "@/lib/api/errors";
import {
  type MfaAssuranceLevel,
  type StaffMfaState,
  buildMfaRedirectPath,
  isStaffDashboardRole,
} from "@/lib/auth/mfa-policy";
import { isStaffMfaRequiredEnabled } from "@/server/flags/staff-mfa";

type TypedClient = SupabaseClient<Database>;

export type StaffMfaStatus = {
  state: StaffMfaState;
  currentLevel: MfaAssuranceLevel | null;
  nextLevel: MfaAssuranceLevel | null;
  verifiedFactorCount: number;
};

export type StaffMfaGateDecision =
  | { action: "allow" }
  | { action: "redirect"; mode: "enroll" | "verify"; next: string };

/** Estado MFA de la sesión actual (TOTP verificado + AAL). */
export async function getStaffMfaStatus(
  supabase: TypedClient,
): Promise<StaffMfaStatus> {
  const [{ data: factors, error: factorsError }, { data: aal, error: aalError }] =
    await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

  if (factorsError) {
    console.error("[mfa.getStaffMfaStatus] listFactors", factorsError.message);
  }
  if (aalError) {
    console.error("[mfa.getStaffMfaStatus] getAAL", aalError.message);
  }

  const verified =
    (factors?.totp ?? []).filter((f) => f.status === "verified").length +
    (factors?.phone ?? []).filter((f) => f.status === "verified").length;

  const currentLevel = (aal?.currentLevel as MfaAssuranceLevel | undefined) ?? null;
  const nextLevel = (aal?.nextLevel as MfaAssuranceLevel | undefined) ?? null;

  let state: StaffMfaState;
  if (verified === 0) {
    state = "enroll_required";
  } else if (currentLevel !== "aal2" && nextLevel === "aal2") {
    state = "verify_required";
  } else if (currentLevel === "aal2") {
    state = "satisfied";
  } else {
    state = "satisfied";
  }

  return {
    state,
    currentLevel,
    nextLevel,
    verifiedFactorCount: verified,
  };
}

/** Resuelve si el segmento `[role]` del dashboard puede renderizarse. */
export async function evaluateStaffMfaGate(opts: {
  urlRole: RoleKey;
  supabase: TypedClient;
  nextPath?: string;
}): Promise<StaffMfaGateDecision> {
  const { urlRole, supabase } = opts;
  const next = opts.nextPath ?? `/dashboard/${urlRole}`;

  if (!isStaffDashboardRole(urlRole)) {
    return { action: "allow" };
  }

  if (!(await isStaffMfaRequiredEnabled())) {
    return { action: "allow" };
  }

  const status = await getStaffMfaStatus(supabase);

  if (status.state === "enroll_required") {
    return { action: "redirect", mode: "enroll", next };
  }
  if (status.state === "verify_required") {
    return { action: "redirect", mode: "verify", next };
  }

  return { action: "allow" };
}

/**
 * Para server actions sensibles de staff. No-op si flag off o rol jugador.
 * Lanza MpError AUTH.MFA_REQUIRED con hint enroll|verify.
 */
export async function requireStaffMfaAal2(opts: {
  activeRole: RoleKey | null;
  supabase: TypedClient;
}): Promise<void> {
  const { activeRole, supabase } = opts;
  if (!activeRole || !isStaffDashboardRole(activeRole)) return;
  if (!(await isStaffMfaRequiredEnabled())) return;

  const status = await getStaffMfaStatus(supabase);
  if (status.state === "satisfied") return;

  const mode = status.state === "enroll_required" ? "enroll" : "verify";
  throw new MpError(
    "AUTH.MFA_REQUIRED",
    mode === "enroll"
      ? "Debes activar 2FA antes de continuar."
      : "Confirma tu código 2FA para continuar.",
    403,
    { mode: [mode], redirect: [buildMfaRedirectPath(mode, `/dashboard/${activeRole}`)] },
  );
}

/** Variante que exige sesión autenticada (mutaciones staff). */
export async function assertStaffMfaForSessionRole(
  supabase: TypedClient,
  activeRole: RoleKey | null,
): Promise<void> {
  try {
    await requireStaffMfaAal2({ activeRole, supabase });
  } catch (e) {
    if (e instanceof MpError && e.code === "AUTH.MFA_REQUIRED") throw e;
    throw e;
  }
}

export { buildMfaRedirectPath };
