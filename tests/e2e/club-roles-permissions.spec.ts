import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ensureSeed } from "./helpers/setup";
import { getServiceClient } from "./helpers/supabase";
import { getRequiredEnv } from "./helpers/env";

test.describe("roles de club · permisos financieros", () => {
  test("employee no puede mutar una transacción arbitraria del club", async () => {
    const seed = await ensureSeed();
    const admin = getServiceClient() as ReturnType<typeof getServiceClient> & {
      auth: {
        admin: {
          createUser: (o: object) => Promise<{ data: { user: { id: string } } | null; error: { message: string } | null }>;
          deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const env = getRequiredEnv();
    const stamp = Date.now().toString(36);
    const email = `e2e-employee-${stamp}@matchpoint.demo`;
    const password = "MatchPoint-e2e-2026";
    let employeeId: string | null = null;
    let transactionId: string | null = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: `e2eemployee${stamp}`.slice(0, 28),
          display_name: "E2E Employee",
          locale: "es",
        },
      });
      if (created.error || !created.data?.user) {
        throw new Error(`No se pudo crear employee E2E: ${created.error?.message ?? "sin user"}`);
      }
      employeeId = created.data.user.id;

      await admin.from("profiles").upsert(
        {
          id: employeeId,
          username: `e2eemployee${stamp}`.slice(0, 28),
          display_name: "E2E Employee",
          country: "EC",
          onboarded_at: new Date().toISOString(),
        } as never,
        { onConflict: "id" },
      );
      await admin.from("role_assignments").insert({
        user_id: employeeId,
        role: "employee",
        club_id: seed.clubId,
        partner_id: null,
        granted_at: new Date().toISOString(),
      } as never);

      const tx = await admin
        .from("transactions")
        .insert({
          club_id: seed.clubId,
          kind: "reservation",
          customer_name: "Cliente E2E",
          amount_cents: 1200,
          currency: "USD",
          method: "transfer",
          status: "captured",
          created_by: seed.ownerId,
        } as never)
        .select("id,status")
        .single();
      if (tx.error || !tx.data) throw new Error(`No se pudo crear transacción E2E: ${tx.error?.message}`);
      transactionId = tx.data.id as string;

      const employeeClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signin = await employeeClient.auth.signInWithPassword({ email, password });
      expect(signin.error, "signin employee E2E").toBeNull();

      const attempted = await employeeClient
        .from("transactions")
        .update({ status: "refunded" } as never)
        .eq("id", transactionId)
        .select("id,status");

      expect(attempted.error, attempted.error?.message).toBeNull();
      expect(attempted.data ?? []).toHaveLength(0);

      const check = await admin
        .from("transactions")
        .select("status")
        .eq("id", transactionId)
        .single();
      expect(check.data?.status).toBe("captured");
    } finally {
      if (transactionId) {
        await admin.from("transactions").delete().eq("id", transactionId);
      }
      if (employeeId) {
        await admin.from("role_assignments").delete().eq("user_id", employeeId);
        await admin.from("profiles").delete().eq("id", employeeId);
        await admin.auth.admin.deleteUser(employeeId);
      }
    }
  });
});
