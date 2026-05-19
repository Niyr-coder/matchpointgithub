"use server";

// Server actions del wizard de onboarding post-signup.
// El wizard se muestra en /dashboard/* cuando `profiles.onboarded_at IS NULL`
// y recoge: deporte preferido, nivel y club favorito.
//
// Mapeo de columnas (ver migrations 003 y 051):
//   step 'sport'  → profiles.preferred_sport
//   step 'level'  → profiles.skill_level
//   step 'club'   → profiles.favorite_club_id
//   step 'finish' → profiles.onboarded_at = now()
import "server-only";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

const SportSchema = z.enum(["tennis", "padel", "pickleball"]);
const SkillSchema = z.enum(["beginner", "intermediate", "advanced", "pro"]);

export type OnboardingStatus = {
  completed: boolean;
  currentStep: 0 | 1 | 2 | 3;
  primarySport: z.infer<typeof SportSchema> | null;
  skillLevel: z.infer<typeof SkillSchema> | null;
  favoriteClubId: string | null;
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
// Lee el estado del onboarding del user actual. `currentStep` es el primer
// paso pendiente (0=sport, 1=level, 2=club, 3=finish). Si ya completó,
// `completed=true` y currentStep=3 (no se vuelve a mostrar).
export async function getOnboardingStatus(): Promise<ActionResult<OnboardingStatus>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    // Cast a unknown porque `favorite_club_id` se agrega en la migration 051
    // y los types generados por supabase aún no la conocen.
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarded_at, preferred_sport, skill_level, favorite_club_id" as never)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new MpError("ONBOARDING.READ_FAILED", error.message, 500);
    if (!data) throw new MpError("ONBOARDING.PROFILE_MISSING", "Profile not found", 404);

    const row = data as unknown as {
      onboarded_at: string | null;
      preferred_sport: z.infer<typeof SportSchema> | null;
      skill_level: z.infer<typeof SkillSchema> | null;
      favorite_club_id: string | null;
    };

    const completed = row.onboarded_at !== null;

    let currentStep: 0 | 1 | 2 | 3 = 0;
    if (row.preferred_sport) currentStep = 1;
    if (row.preferred_sport && row.skill_level) currentStep = 2;
    if (row.preferred_sport && row.skill_level && row.favorite_club_id !== undefined) {
      // El club es opcional: si hay sport+level, el siguiente paso visible es club (2).
      // Solo saltamos a 'finish' (3) si ya está completado.
      currentStep = 2;
    }
    if (completed) currentStep = 3;

    return {
      completed,
      currentStep,
      primarySport: row.preferred_sport,
      skillLevel: row.skill_level,
      favoriteClubId: row.favorite_club_id,
    };
  });
}

// ── saveOnboardingStep ─────────────────────────────────────────────────
// Persiste un solo campo por llamada. `finish` marca onboarded_at = now()
// y exige que sport y level ya estén seteados (club es opcional).
const SaveStepSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("sport"), primarySport: SportSchema }),
  z.object({ step: z.literal("level"), skillLevel: SkillSchema }),
  z.object({ step: z.literal("club"), favoriteClubId: UuidSchema.nullable() }),
  z.object({ step: z.literal("finish") }),
]);

export async function saveOnboardingStep(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SaveStepSchema, input, async (payload) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    if (payload.step === "finish") {
      // Validar que los pasos previos estén completos.
      const { data: prof, error: readErr } = await supabase
        .from("profiles")
        .select("preferred_sport, skill_level")
        .eq("id", userId)
        .maybeSingle();
      if (readErr) throw new MpError("ONBOARDING.READ_FAILED", readErr.message, 500);
      const r = (prof ?? {}) as {
        preferred_sport: string | null;
        skill_level: string | null;
      };
      if (!r.preferred_sport || !r.skill_level) {
        throw new MpError(
          "ONBOARDING.STEPS_INCOMPLETE",
          "Faltan pasos previos antes de finalizar el onboarding",
          400,
        );
      }
      const { error } = await supabase
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() } as never)
        .eq("id", userId);
      if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
      // updateTag (Next 16, server-action only) invalida y rehidrata el cache
      // de unstable_cache atado al tag (ver dashboard/layout.tsx) con semántica
      // read-your-own-writes para el próximo render del dashboard.
      updateTag(`onboarding:${userId}`);

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
    }

    const patch: Record<string, unknown> = {};
    if (payload.step === "sport") patch.preferred_sport = payload.primarySport;
    if (payload.step === "level") patch.skill_level = payload.skillLevel;
    if (payload.step === "club") patch.favorite_club_id = payload.favoriteClubId;

    const { error } = await supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", userId);
    if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── skipOnboarding ─────────────────────────────────────────────────────
// Marca onboarded_at sin tocar preferencias. Para users que no quieren
// responder ahora; no vuelve a aparecer en futuras sesiones.
export async function skipOnboarding(): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() } as never)
      .eq("id", userId);
    if (error) throw new MpError("ONBOARDING.UPDATE_FAILED", error.message, 500);
    // updateTag — invalida el cache del gate de onboarding (ver dashboard/layout.tsx).
    updateTag(`onboarding:${userId}`);
    return { ok: true as const };
  });
}
