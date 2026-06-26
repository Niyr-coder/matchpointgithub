"use server";

import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, runMutation, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireUserId } from "@/lib/auth/session";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/legal/entity";
import { buildUserDataExport } from "@/server/account/export-user-data";
import { executeAccountDeletion } from "@/server/account/execute-account-deletion";

const ConfirmUsernameSchema = z.object({
  confirmUsername: z.string().trim().min(3).max(24),
  reason: z.string().trim().max(500).optional(),
});

type ProfilePrivacyRow = {
  username: string;
  scheduled_deletion_at: string | null;
};

// ── getAccountPrivacyStatus ─────────────────────────────────────────────
export async function getAccountPrivacyStatus(): Promise<
  ActionResult<{
    username: string;
    scheduledDeletionAt: string | null;
    graceDays: number;
  }>
> {
  return runAction(z.object({}), {}, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();
    if (error || !data) {
      throw new MpError("PROFILE.NOT_FOUND", "No encontramos tu perfil.", 404);
    }
    const { data: privacyRow } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    const row = privacyRow as unknown as ProfilePrivacyRow;
    return {
      username: data.username,
      scheduledDeletionAt: row?.scheduled_deletion_at ?? null,
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    };
  });
}

// ── exportMyData ────────────────────────────────────────────────────────
export async function exportMyData(): Promise<ActionResult<{ export: Awaited<ReturnType<typeof buildUserDataExport>> }>> {
  return runAction(z.object({}), {}, async () => {
    const userId = await requireUserId();
    const exportPayload = await buildUserDataExport(userId);
    return { export: exportPayload };
  });
}

// ── requestAccountClosure ───────────────────────────────────────────────
export async function requestAccountClosure(
  input: unknown,
): Promise<ActionResult<{ scheduledDeletionAt: string }>> {
  return runMutation(ConfirmUsernameSchema, input, async ({ confirmUsername, reason }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const admin = getAdminClient();

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (profileErr || !profile) {
      throw new MpError("PROFILE.NOT_FOUND", "No encontramos tu perfil.", 404);
    }
    const row = profile as unknown as ProfilePrivacyRow;
    if (row.username !== confirmUsername) {
      throw new MpError(
        "ACCOUNT.USERNAME_MISMATCH",
        "El usuario de confirmación no coincide con tu cuenta.",
        400,
        { confirmUsername: ["No coincide con tu @usuario"] },
      );
    }
    if (row.scheduled_deletion_at) {
      return { scheduledDeletionAt: row.scheduled_deletion_at };
    }

    const { data: ownerRoles } = await admin
      .from("role_assignments")
      .select("club_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .is("revoked_at", null);

    const clubIds = (ownerRoles ?? []).map((r) => r.club_id).filter(Boolean) as string[];
    let activeOwnedClubNames: string[] = [];
    if (clubIds.length > 0) {
      const { data: clubs } = await admin
        .from("clubs")
        .select("name, status")
        .in("id", clubIds);
      activeOwnedClubNames = (clubs ?? [])
        .filter((c) => c.status === "active" || c.status === "pending")
        .map((c) => c.name)
        .filter(Boolean);
    }
    if (activeOwnedClubNames.length > 0) {
      throw new MpError(
        "ACCOUNT.OWNER_CLUBS_BLOCK",
        `Transfiere la propiedad de tus clubes antes de cerrar la cuenta (${activeOwnedClubNames.join(", ")}).`,
        400,
      );
    }

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + ACCOUNT_DELETION_GRACE_DAYS);
    const scheduledDeletionAt = scheduledAt.toISOString();

    await setAuditActor(admin, userId, "user");

    const nowIso = new Date().toISOString();

    await admin
      .from("role_assignments")
      .update({ revoked_at: nowIso } as never)
      .eq("user_id", userId)
      .is("revoked_at", null);

    await admin
      .from("player_subscriptions")
      .update({ status: "cancelled" } as never)
      .eq("user_id", userId)
      .in("status", ["active", "pending", "pending_proof"]);

    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        scheduled_deletion_at: scheduledDeletionAt,
        deletion_reason: reason?.trim() || null,
      } as never)
      .eq("id", userId);
    if (updateErr) {
      throw new MpError("ACCOUNT.CLOSE_FAILED", updateErr.message, 500);
    }

    revalidatePath("/dashboard/user/perfil");
    return { scheduledDeletionAt };
  });
}

// ── cancelAccountClosure ────────────────────────────────────────────────
export async function cancelAccountClosure(): Promise<ActionResult<{ ok: true }>> {
  return runMutation(z.object({}), {}, async () => {
    const userId = await requireUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "user");

    const { error } = await admin
      .from("profiles")
      .update({
        scheduled_deletion_at: null,
        deletion_reason: null,
      } as never)
      .eq("id", userId);
    if (error) {
      throw new MpError("ACCOUNT.CANCEL_CLOSE_FAILED", error.message, 500);
    }

    revalidatePath("/dashboard/user/perfil");
    return { ok: true as const };
  });
}
