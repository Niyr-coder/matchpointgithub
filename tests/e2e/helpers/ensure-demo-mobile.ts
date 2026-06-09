// Provisiona cuentas demo mínimas para E2E móvil multi-rol (admin, partner, coach, manager).
// Idempotente vía service role — no depende de `npm run seed`.
import { createClient } from "@supabase/supabase-js";
import {
  E2E_ADMIN_EMAIL,
  E2E_COACH_EMAIL,
  E2E_DEMO_PASSWORD,
  E2E_MANAGER_EMAIL,
  E2E_PARTNER_EMAIL,
  getRequiredEnv,
} from "./env";
import { ensureSeed } from "./setup";
import { getServiceClient } from "./supabase";

const PARTNER_ORG_SLUG = "e2e-mobile-partner";

type SbAdmin = ReturnType<typeof getServiceClient> & {
  auth: {
    admin: {
      createUser: (o: object) => Promise<{
        data: { user: { id: string } | null } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

async function resolveUserId(email: string, password: string, username: string): Promise<string> {
  const env = getRequiredEnv();
  const anon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const existingSignIn = await anon.auth.signInWithPassword({ email, password });
  if (existingSignIn.data?.user) return existingSignIn.data.user.id;

  const sb = getServiceClient() as SbAdmin;
  const created = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: username,
      locale: "es",
    },
  });
  if (created.data?.user) return created.data.user.id;
  if (!created.error?.message?.includes("already")) {
    throw new Error(`createUser(${email}): ${created.error?.message ?? "sin user"}`);
  }

  const retry = await anon.auth.signInWithPassword({ email, password });
  if (retry.error || !retry.data?.user) {
    throw new Error(`signIn ${email}: ${retry.error?.message ?? "sin user"}`);
  }
  return retry.data.user.id;
}

async function upsertProfile(userId: string, username: string, displayName: string) {
  const sb = getServiceClient();
  await sb.from("profiles").upsert(
    {
      id: userId,
      username,
      display_name: displayName,
      country: "EC",
      onboarded_at: new Date().toISOString(),
    } as never,
    { onConflict: "id" },
  );
}

async function grantRole(
  userId: string,
  role: string,
  clubId?: string | null,
  partnerId?: string | null,
) {
  const sb = getServiceClient();
  let deleteQuery = sb
    .from("role_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  deleteQuery =
    clubId == null ? deleteQuery.is("club_id", null) : deleteQuery.eq("club_id", clubId);
  deleteQuery =
    partnerId == null
      ? deleteQuery.is("partner_id", null)
      : deleteQuery.eq("partner_id", partnerId);
  await deleteQuery;

  const { error } = await sb.from("role_assignments").insert({
    user_id: userId,
    role,
    club_id: clubId ?? null,
    partner_id: partnerId ?? null,
    granted_at: new Date().toISOString(),
  } as never);
  if (error) throw new Error(`grantRole ${role}: ${error.message}`);
}

/** Crea/asegura admin, partner, coach y manager para specs móvil multi-rol. */
export async function ensureDemoMobileRoles() {
  const seed = await ensureSeed();
  const sb = getServiceClient();

  const adminId = await resolveUserId(E2E_ADMIN_EMAIL, E2E_DEMO_PASSWORD, "e2emobileadmin");
  await upsertProfile(adminId, "e2emobileadmin", "E2E Mobile Admin");
  await grantRole(adminId, "admin");

  await sb.from("partner_orgs").upsert(
    {
      slug: PARTNER_ORG_SLUG,
      name: "E2E Mobile Partner Org",
      country: "EC",
      contact_email: E2E_PARTNER_EMAIL,
      status: "active",
    } as never,
    { onConflict: "slug" },
  );
  const { data: partnerOrg } = await sb
    .from("partner_orgs")
    .select("id")
    .eq("slug", PARTNER_ORG_SLUG)
    .single();
  if (!partnerOrg?.id) throw new Error("partner_org e2e-mobile-partner sin resolver");

  const partnerId = await resolveUserId(E2E_PARTNER_EMAIL, E2E_DEMO_PASSWORD, "e2emobilepartner");
  await upsertProfile(partnerId, "e2emobilepartner", "E2E Mobile Partner");
  await sb.from("partner_members").upsert(
    { partner_id: partnerOrg.id, user_id: partnerId, role: "owner" } as never,
    { onConflict: "partner_id,user_id", ignoreDuplicates: true },
  );
  await grantRole(partnerId, "partner", null, partnerOrg.id);

  const coachId = await resolveUserId(E2E_COACH_EMAIL, E2E_DEMO_PASSWORD, "e2emobilecoach");
  await upsertProfile(coachId, "e2emobilecoach", "E2E Mobile Coach");
  await grantRole(coachId, "coach", seed.clubId);

  const managerId = await resolveUserId(E2E_MANAGER_EMAIL, E2E_DEMO_PASSWORD, "e2emobilemanager");
  await upsertProfile(managerId, "e2emobilemanager", "E2E Mobile Manager");
  await grantRole(managerId, "manager", seed.clubId);
}
