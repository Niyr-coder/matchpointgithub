"use server";

// Mutaciones sobre el propio perfil del usuario autenticado.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireUserId } from "@/lib/auth/session";

// ── completeOnboarding ─────────────────────────────────────────────────
// Marca al user como onboarded. Si pasa city / preferredSport / skillLevel,
// los aplica al profile. Idempotente: no falla si ya estaba onboarded.
const SkillLevelSchema = z.enum(["beginner", "intermediate", "advanced", "pro"]);
const SportSchema = z.enum(["tennis", "padel", "pickleball"]);

const CompleteOnboardingSchema = z.object({
  city: z.string().min(2).max(80).optional(),
  preferredSport: SportSchema.optional(),
  skillLevel: SkillLevelSchema.optional(),
});

export async function completeOnboarding(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(CompleteOnboardingSchema, input, async (patch) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const payload: Record<string, unknown> = {
      onboarded_at: new Date().toISOString(),
    };
    if (patch.city !== undefined) payload.city = patch.city.trim();
    if (patch.preferredSport !== undefined) payload.preferred_sport = patch.preferredSport;
    if (patch.skillLevel !== undefined) payload.skill_level = patch.skillLevel;
    const { error } = await supabase
      .from("profiles")
      .update(payload as never)
      .eq("id", userId);
    if (error) throw new MpError("PROFILE.UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── updateMyAvatar ─────────────────────────────────────────────────────
// Recibe la URL pública del avatar ya subido a storage por el cliente.
// El cliente sube via @supabase/storage-js (que respeta RLS), aquí solo
// reflejamos la URL en `profiles.avatar_url`.
const UpdateAvatarSchema = z.object({
  avatarUrl: z.string().url().nullable(),
});

export async function updateMyAvatar(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdateAvatarSchema, input, async ({ avatarUrl }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl } as never)
      .eq("id", userId);
    if (error) throw new MpError("PROFILE.UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
