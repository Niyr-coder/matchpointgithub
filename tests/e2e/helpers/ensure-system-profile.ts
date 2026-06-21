import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient & {
  auth: {
    admin: {
      createUser: (input: object) => Promise<{
        data: { user: { id: string } } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/** Garantiza fila profiles.is_system para tests de DM oficial (idempotente). */
export async function ensureMatchpointSystemProfile(admin: AdminClient): Promise<string> {
  const existing = await admin
    .from("profiles")
    .select("id")
    .eq("is_system", true)
    .limit(1)
    .maybeSingle();

  const id = existing.data?.id as string | undefined;

  if (!id) {
    const created = await admin.auth.admin.createUser({
      email: "matchpoint@system.local",
      password: `sys-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email_confirm: true,
      user_metadata: {
        username: "matchpoint",
        display_name: "MATCHPOINT",
        locale: "es",
      },
    });
    if (created.error || !created.data?.user) {
      throw new Error(
        `No se pudo crear perfil oficial MATCHPOINT: ${created.error?.message ?? "sin user"}`,
      );
    }

    const newId = created.data.user.id;
    const { error } = await admin
      .from("profiles")
      .update({ is_system: true, display_name: "MATCHPOINT", username: "matchpoint" } as never)
      .eq("id", newId);
    if (error) throw new Error(`No se pudo marcar is_system: ${error.message}`);
    await admin.from("role_assignments").delete().eq("user_id", newId);
    await syncSystemPlatformConfig(admin, newId);
    return newId;
  }

  await syncSystemPlatformConfig(admin, id);
  return id;
}

async function syncSystemPlatformConfig(admin: AdminClient, systemUserId: string) {
  await admin.from("platform_config").upsert(
    [
      { key: "system_user_id", value: systemUserId, description: "Perfil oficial MATCHPOINT" },
      { key: "system_messages_enabled", value: true, description: "DMs de sistema activos" },
    ] as never,
    { onConflict: "key" },
  );
}
