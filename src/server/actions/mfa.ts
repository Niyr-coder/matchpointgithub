"use server";

// Server actions MFA (TOTP) — infraestructura para UI de enroll/verify.
// Supabase Dashboard: Authentication → Multi-Factor → App Authenticator ON.
import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/session";
import { getStaffMfaStatus } from "@/lib/auth/mfa";
import { resetStaffMfaFlagCache } from "@/server/flags/staff-mfa";

const FactorIdSchema = z.object({
  factorId: z.string().uuid(),
});

const VerifyCodeSchema = z.object({
  factorId: z.string().uuid(),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
});

const EnrollSchema = z.object({
  friendlyName: z.string().min(1).max(120).optional(),
});

const ChallengeAndVerifySchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
});

export type MfaFactorSummary = {
  id: string;
  friendlyName: string | null;
  factorType: string;
  status: string;
  createdAt: string;
};

export type TotpEnrollPayload = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

function mapFactors(data: Awaited<ReturnType<typeof listFactorsInternal>>) {
  return [...data.totp, ...data.phone];
}

async function listFactorsInternal(supabase: Awaited<ReturnType<typeof getServerClient>>) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new MpError("AUTH.MFA_LIST_FAILED", error.message, 502);
  return {
    totp: (data?.totp ?? []).map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      factorType: f.factor_type,
      status: f.status,
      createdAt: f.created_at,
    })),
    phone: (data?.phone ?? []).map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      factorType: f.factor_type,
      status: f.status,
      createdAt: f.created_at,
    })),
  };
}

export async function listMyMfaFactors(): Promise<
  ActionResult<{ factors: MfaFactorSummary[]; status: Awaited<ReturnType<typeof getStaffMfaStatus>> }>
> {
  return runAction(z.undefined(), undefined, async () => {
    await requireSession();
    const supabase = await getServerClient();
    const grouped = await listFactorsInternal(supabase);
    const status = await getStaffMfaStatus(supabase);
    return { factors: mapFactors(grouped), status };
  });
}

/** Paso 1 enrollment TOTP — devuelve QR/secret para la UI. */
export async function enrollTotpFactor(
  input: unknown,
): Promise<ActionResult<TotpEnrollPayload>> {
  return runAction(EnrollSchema, input, async (data) => {
    await requireSession();
    const supabase = await getServerClient();
    const { data: enrolled, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: data.friendlyName ?? "MATCHPOINT",
    });
    if (error || !enrolled) {
      throw new MpError(
        "AUTH.MFA_ENROLL_FAILED",
        "No pudimos iniciar el registro 2FA. Inténtalo de nuevo.",
        502,
      );
    }
    return {
      factorId: enrolled.id,
      qrCode: enrolled.totp.qr_code,
      secret: enrolled.totp.secret,
      uri: enrolled.totp.uri,
    };
  });
}

/** Enroll + challenge en un paso (QR listo para que el user ingrese el primer código). */
export async function beginTotpEnrollment(
  input: unknown,
): Promise<ActionResult<TotpEnrollPayload & { challengeId: string }>> {
  return runAction(EnrollSchema, input, async (data) => {
    await requireSession();
    const supabase = await getServerClient();
    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: data.friendlyName ?? "MATCHPOINT",
    });
    if (enrollError || !enrolled) {
      throw new MpError(
        "AUTH.MFA_ENROLL_FAILED",
        "No pudimos iniciar el registro 2FA. Inténtalo de nuevo.",
        502,
      );
    }
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrolled.id,
    });
    if (challengeError || !challenge) {
      throw new MpError(
        "AUTH.MFA_CHALLENGE_FAILED",
        challengeError?.message ?? "No pudimos preparar la verificación.",
        502,
      );
    }
    return {
      factorId: enrolled.id,
      qrCode: enrolled.totp.qr_code,
      secret: enrolled.totp.secret,
      uri: enrolled.totp.uri,
      challengeId: challenge.id,
    };
  });
}

/** Paso 2 enrollment — verifica el primer código del authenticator. */
export async function verifyTotpEnrollment(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(VerifyCodeSchema, input, async (data) => {
    await requireSession();
    const supabase = await getServerClient();
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: data.factorId,
      challengeId: data.challengeId,
      code: data.code,
    });
    if (verifyError) {
      throw new MpError(
        "AUTH.MFA_VERIFY_FAILED",
        "Código incorrecto o expirado. Revisa tu app e inténtalo de nuevo.",
        422,
        { code: ["Código inválido."] },
      );
    }
    await supabase.auth.refreshSession();
    revalidatePath("/auth/mfa", "layout");
    return { ok: true as const };
  });
}

/** Crea challenge TOTP (login step-up o unenroll). */
export async function challengeTotpFactor(
  input: unknown,
): Promise<ActionResult<{ challengeId: string }>> {
  return runAction(FactorIdSchema, input, async ({ factorId }) => {
    await requireSession();
    const supabase = await getServerClient();
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error || !data) {
      throw new MpError("AUTH.MFA_CHALLENGE_FAILED", error?.message ?? "Challenge falló", 502);
    }
    return { challengeId: data.id };
  });
}

/** Verifica código TOTP tras challenge (sube sesión a aal2). */
export async function verifyTotpChallenge(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(VerifyCodeSchema, input, async (data) => {
    await requireSession();
    const supabase = await getServerClient();
    const { error } = await supabase.auth.mfa.verify({
      factorId: data.factorId,
      challengeId: data.challengeId,
      code: data.code,
    });
    if (error) {
      throw new MpError(
        "AUTH.MFA_VERIFY_FAILED",
        "Código incorrecto o expirado.",
        422,
        { code: ["Código inválido."] },
      );
    }
    await supabase.auth.refreshSession();
    revalidatePath("/auth/mfa", "layout");
    return { ok: true as const };
  });
}

/** Atajo login step-up: challenge + verify en un paso. */
export async function challengeAndVerifyTotp(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(ChallengeAndVerifySchema, input, async ({ factorId, code }) => {
    await requireSession();
    const supabase = await getServerClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      throw new MpError(
        "AUTH.MFA_VERIFY_FAILED",
        "Código incorrecto o expirado.",
        422,
        { code: ["Código inválido."] },
      );
    }
    await supabase.auth.refreshSession();
    revalidatePath("/auth/mfa", "layout");
    return { ok: true as const };
  });
}

export async function unenrollTotpFactor(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(FactorIdSchema, input, async ({ factorId }) => {
    await requireSession();
    const supabase = await getServerClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      throw new MpError("AUTH.MFA_UNENROLL_FAILED", error.message, 502);
    }
    await supabase.auth.refreshSession();
    return { ok: true as const };
  });
}

/** Admin/testing: limpia cache del flag tras toggle en panel. */
export async function refreshStaffMfaFlagCache(): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.undefined(), undefined, async () => {
    resetStaffMfaFlagCache();
    return { ok: true as const };
  });
}
