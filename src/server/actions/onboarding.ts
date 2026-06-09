"use server";

// Server actions del wizard de onboarding post-signup.
// El wizard se muestra cuando `profiles.onboarded_at IS NULL` y recoge:
// nombre/apellido/username, fecha de nacimiento, teléfono (opcional) y mano hábil.
//
// Mapeo de columnas:
//   step 'identity' → profiles.first_name, last_name, username, display_name
//   step 'personal' → profiles.birthdate, phone
//   step 'hand'     → profiles.dominant_hand
//   step 'finish'   → profiles.onboarded_at = now()
//
// El sport/skill/club ya no se piden acá; quedan editables desde el perfil.
import "server-only";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UsernameSchema } from "@/lib/schemas/common";
import { MpDominantHandSchema } from "@/lib/schemas/identity";

const NameSchema = z.string().trim().min(1, "Requerido").max(40);
// Birthdate: ISO YYYY-MM-DD; mayor de 13 años (política básica).
const BirthdateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(s);
    if (isNaN(d.getTime())) return false;
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 13 && age < 120;
  }, "Debes tener al menos 13 años");
// Teléfono opcional. Acepta dígitos, espacios, +, -, (, ).
const PhoneSchema = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s()-]{6,19}$/, "Teléfono inválido")
  .optional()
  .or(z.literal("").transform(() => undefined));

export type OnboardingStatus = {
  completed: boolean;
  currentStep: 0 | 1 | 2 | 3;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  birthdate: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  dominantHand: "left" | "right" | null;
};

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

// ── getOnboardingStatus ────────────────────────────────────────────────
// Lee el estado del wizard. currentStep arranca en 0 (identity); avanza
// según qué campos ya tienen valor. Se cachea bien con el tag
// `onboarding:<userId>` que invalidamos al finalizar.
export async function getOnboardingStatus(): Promise<ActionResult<OnboardingStatus>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "onboarded_at, first_name, last_name, username, birthdate, phone, country, city, dominant_hand" as never,
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new MpError("ONBOARDING.READ_FAILED", error.message, 500);
    if (!data) throw new MpError("ONBOARDING.PROFILE_MISSING", "Profile not found", 404);

    const row = data as unknown as {
      onboarded_at: string | null;
      first_name: string | null;
      last_name: string | null;
      username: string | null;
      birthdate: string | null;
      phone: string | null;
      country: string | null;
      city: string | null;
      dominant_hand: "left" | "right" | null;
    };

    const completed = row.onboarded_at !== null;

    // currentStep = primer paso pendiente. Personal incluye país/ciudad
    // ahora, así que se considera done solo si birthdate Y city Y country.
    let currentStep: 0 | 1 | 2 | 3 = 0;
    const identityDone = !!(row.first_name && row.last_name && row.username);
    const personalDone = !!(row.birthdate && row.country && row.city);
    const handDone = !!row.dominant_hand;
    if (identityDone) currentStep = 1;
    if (identityDone && personalDone) currentStep = 2;
    if (identityDone && personalDone && handDone) currentStep = 3;
    if (completed) currentStep = 3;

    return {
      completed,
      currentStep,
      firstName: row.first_name,
      lastName: row.last_name,
      username: row.username,
      birthdate: row.birthdate,
      phone: row.phone,
      country: row.country,
      city: row.city,
      dominantHand: row.dominant_hand,
    };
  });
}

// ── saveOnboardingStep ─────────────────────────────────────────────────
const SaveStepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("identity"),
    firstName: NameSchema,
    lastName: NameSchema,
    username: UsernameSchema,
  }),
  z.object({
    step: z.literal("personal"),
    birthdate: BirthdateSchema,
    phone: PhoneSchema,
    country: z.string().trim().min(2).max(60),
    province: z.string().trim().min(1).max(80),
    cityName: z.string().trim().min(1).max(80),
  }),
  z.object({ step: z.literal("hand"), dominantHand: MpDominantHandSchema }),
  z.object({ step: z.literal("finish") }),
]);

export async function saveOnboardingStep(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SaveStepSchema, input, async (payload) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    if (payload.step === "identity") {
      // Validar username único (case-insensitive). Si el user ya lo tenía
      // (mismo id) no es conflicto.
      const { data: clash, error: chkErr } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", payload.username)
        .neq("id", userId)
        .maybeSingle();
      if (chkErr) throw new MpError("ONBOARDING.READ_FAILED", chkErr.message, 500);
      if (clash) {
        throw new MpError("ONBOARDING.USERNAME_TAKEN", "Ese username ya está en uso", 409, {
          username: ["Ese username ya está en uso"],
        });
      }
      const display = `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim();
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: payload.firstName.trim(),
          last_name: payload.lastName.trim(),
          username: payload.username,
          display_name: display,
        } as never)
        .eq("id", userId);
      if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
      return { ok: true as const };
    }

    if (payload.step === "personal") {
      // Persistimos city como "Provincia / Ciudad" para mantener ambos
      // niveles sin agregar columna province (decisión de schema). El
      // selector cascade en el wizard split de vuelta al leer.
      const cityComposite = `${payload.province} / ${payload.cityName}`;
      const { error } = await supabase
        .from("profiles")
        .update({
          birthdate: payload.birthdate,
          phone: payload.phone ?? null,
          country: payload.country,
          city: cityComposite,
        } as never)
        .eq("id", userId);
      if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
      return { ok: true as const };
    }

    if (payload.step === "hand") {
      const { error } = await supabase
        .from("profiles")
        .update({ dominant_hand: payload.dominantHand } as never)
        .eq("id", userId);
      if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
      return { ok: true as const };
    }

    // step === "finish"
    const { data: prof, error: readErr } = await supabase
      .from("profiles")
      .select("first_name, last_name, username, birthdate, country, city, dominant_hand")
      .eq("id", userId)
      .maybeSingle();
    if (readErr) throw new MpError("ONBOARDING.READ_FAILED", readErr.message, 500);
    const r = (prof ?? {}) as {
      first_name: string | null;
      last_name: string | null;
      username: string | null;
      birthdate: string | null;
      country: string | null;
      city: string | null;
      dominant_hand: string | null;
    };
    if (
      !r.first_name ||
      !r.last_name ||
      !r.username ||
      !r.birthdate ||
      !r.country ||
      !r.city ||
      !r.dominant_hand
    ) {
      throw new MpError(
        "ONBOARDING.STEPS_INCOMPLETE",
        "Faltan pasos previos antes de finalizar",
        400,
      );
    }
    const { error } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() } as never)
      .eq("id", userId);
    if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
    updateTag(`onboarding:${userId}`);

    try {
      const { claimPendingReferralFromCookie } = await import("@/server/referrals/claim-referral");
      await claimPendingReferralFromCookie(userId);
    } catch (e) {
      console.error("[onboarding.finish] referral claim failed", e);
    }

    // Welcome DM post-onboarding. Fire-and-forget.
    try {
      const [{ getProfileSummary }, { sendSystemMessage, renderTemplate }] = await Promise.all([
        import("@/lib/auth/profile"),
        import("@/lib/messages/system"),
      ]);
      const profile = await getProfileSummary(userId);
      const firstName = (profile.displayName ?? "jugador").split(" ")[0];
      await sendSystemMessage({
        recipientUserId: userId,
        kind: "welcome_onboarding_completed",
        body: renderTemplate("welcome_onboarding_completed", {
          firstName,
          city: profile.city ?? "tu ciudad",
        }),
      });
    } catch (e) {
      console.error("[onboarding.finish] welcome message failed", e);
    }

    return { ok: true as const };
  });
}

// ── skipOnboarding ─────────────────────────────────────────────────────
// Marca onboarded_at sin tocar campos. Solo accesible desde mode='modal'
// del wizard; el flow page lo deshabilita.
export async function skipOnboarding(): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() } as never)
      .eq("id", userId);
    if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
    updateTag(`onboarding:${userId}`);
    try {
      const { claimPendingReferralFromCookie } = await import("@/server/referrals/claim-referral");
      await claimPendingReferralFromCookie(userId);
    } catch (e) {
      console.error("[skipOnboarding] referral claim failed", e);
    }
    return { ok: true as const };
  });
}
