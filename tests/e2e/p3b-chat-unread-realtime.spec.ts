import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "./helpers/env";
import { getServiceClient } from "./helpers/supabase";
import { ensureMatchpointSystemProfile } from "./helpers/ensure-system-profile";

type TestUser = {
  id: string;
  email: string;
  password: string;
};

type AdminClient = SupabaseClient & {
  auth: {
    admin: {
      createUser: (input: object) => Promise<{
        data: { user: { id: string } } | null;
        error: { message: string } | null;
      }>;
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

const TEST_PASSWORD = "MatchPoint-e2e-2026";

function uniqueLabel(label: string) {
  return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createTestUser(admin: AdminClient, label: string): Promise<TestUser> {
  const slug = uniqueLabel(label);
  const username = `p3b${slug.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`.toLowerCase();
  const email = `e2e-p3b-${slug}@matchpoint.demo`;
  const created = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: `P3B ${label}`,
      locale: "es",
    },
  });
  if (created.error || !created.data?.user) {
    throw new Error(`No se pudo crear usuario P3-B: ${created.error?.message ?? "sin user"}`);
  }

  const id = created.data.user.id;
  await admin.from("profiles").upsert(
    {
      id,
      username,
      display_name: `P3B ${label}`,
      country: "EC",
      onboarded_at: new Date().toISOString(),
    } as never,
    { onConflict: "id" },
  );

  return { id, email, password: TEST_PASSWORD };
}

async function signInApi(request: APIRequestContext, user: TestUser) {
  const response = await request.post("/api/v1/auth/sign-in", {
    data: { email: user.email, password: user.password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function deleteUsers(admin: AdminClient, users: TestUser[]) {
  for (const user of users) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

test.describe("P3-B · chat/unread/realtime/notificaciones", () => {
  test("fn_unread_messages_count cuenta no leídos y respeta last_read_message_id", async () => {
    const admin = getServiceClient() as AdminClient;
    const env = getRequiredEnv();
    const users: TestUser[] = [];
    const conversationIds: string[] = [];

    try {
      const alice = await createTestUser(admin, "alice");
      const bob = await createTestUser(admin, "bob");
      users.push(alice, bob);

      const conv = await admin
        .from("conversations")
        .insert({ kind: "dm", created_by: alice.id } as never)
        .select("id")
        .single();
      if (conv.error || !conv.data) throw new Error(`No se pudo crear conversación: ${conv.error?.message}`);
      const conversationId = conv.data.id as string;
      conversationIds.push(conversationId);

      await admin.from("conversation_members").insert([
        { conversation_id: conversationId, user_id: alice.id, role: "admin" },
        { conversation_id: conversationId, user_id: bob.id, role: "member" },
      ] as never);

      const firstBobMessage = await admin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: bob.id,
          body: "Primer mensaje de Bob",
          kind: "text",
          created_at: new Date(Date.now() - 180_000).toISOString(),
        } as never)
        .select("id")
        .single();
      if (firstBobMessage.error || !firstBobMessage.data) {
        throw new Error(`No se pudo crear mensaje inicial: ${firstBobMessage.error?.message}`);
      }

      await admin.from("messages").insert({
        conversation_id: conversationId,
        sender_id: alice.id,
        body: "Respuesta propia",
        kind: "text",
        created_at: new Date(Date.now() - 120_000).toISOString(),
      } as never);

      const secondBobMessage = await admin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: bob.id,
          body: "Segundo mensaje de Bob",
          kind: "text",
          created_at: new Date(Date.now() - 60_000).toISOString(),
        } as never)
        .select("id")
        .single();
      if (secondBobMessage.error || !secondBobMessage.data) {
        throw new Error(`No se pudo crear segundo mensaje: ${secondBobMessage.error?.message}`);
      }

      const aliceClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signin = await aliceClient.auth.signInWithPassword({
        email: alice.email,
        password: alice.password,
      });
      expect(signin.error, signin.error?.message).toBeNull();

      const initial = await aliceClient.rpc("fn_unread_messages_count");
      expect(initial.error, initial.error?.message).toBeNull();
      expect(
        ((initial.data ?? []) as Array<{ conversation_id: string; unread_count: number }>)
          .find((row) => row.conversation_id === conversationId)?.unread_count,
      ).toBe(2);

      await admin
        .from("conversation_members")
        .update({ last_read_message_id: firstBobMessage.data.id } as never)
        .eq("conversation_id", conversationId)
        .eq("user_id", alice.id);

      const afterFirstRead = await aliceClient.rpc("fn_unread_messages_count");
      expect(afterFirstRead.error, afterFirstRead.error?.message).toBeNull();
      expect(
        ((afterFirstRead.data ?? []) as Array<{ conversation_id: string; unread_count: number }>)
          .find((row) => row.conversation_id === conversationId)?.unread_count,
      ).toBe(1);

      await admin
        .from("conversation_members")
        .update({ last_read_message_id: secondBobMessage.data.id } as never)
        .eq("conversation_id", conversationId)
        .eq("user_id", alice.id);

      const afterAllRead = await aliceClient.rpc("fn_unread_messages_count");
      expect(afterAllRead.error, afterAllRead.error?.message).toBeNull();
      expect(
        ((afterAllRead.data ?? []) as Array<{ conversation_id: string; unread_count: number }>)
          .find((row) => row.conversation_id === conversationId)?.unread_count,
      ).toBe(0);
    } finally {
      if (conversationIds.length) await admin.from("conversations").delete().in("id", conversationIds);
      await deleteUsers(admin, users);
    }
  });

  test("API bloquea sendMessage en el DM oficial de MATCHPOINT", async ({ request }) => {
    const admin = getServiceClient() as AdminClient;
    const users: TestUser[] = [];
    const conversationIds: string[] = [];

    try {
      const user = await createTestUser(admin, "official");
      users.push(user);

      const systemProfileId = await ensureMatchpointSystemProfile(admin);

      const conv = await admin
        .from("conversations")
        .insert({ kind: "dm", created_by: systemProfileId } as never)
        .select("id")
        .single();
      if (conv.error || !conv.data) throw new Error(`No se pudo crear DM oficial: ${conv.error?.message}`);
      const conversationId = conv.data.id as string;
      conversationIds.push(conversationId);

      await admin.from("conversation_members").insert([
        { conversation_id: conversationId, user_id: user.id, role: "member" },
        { conversation_id: conversationId, user_id: systemProfileId, role: "admin" },
      ] as never);

      await signInApi(request, user);
      const response = await request.post(`/api/v1/conversations/${conversationId}/messages`, {
        data: { body: "Intento responder al canal oficial", kind: "text" },
      });
      expect(response.status(), await response.text()).toBe(403);
      const payload = await response.json();
      expect(payload.error.code).toBe("MESSAGING.READ_ONLY");

      const messages = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("sender_id", user.id);
      expect(messages.error, messages.error?.message).toBeNull();
      expect(messages.data ?? []).toHaveLength(0);
    } finally {
      if (conversationIds.length) await admin.from("conversations").delete().in("id", conversationIds);
      await deleteUsers(admin, users);
    }
  });

  test("API de notification preferences lista, valida y persiste overrides", async ({ request }) => {
    const admin = getServiceClient() as AdminClient;
    const users: TestUser[] = [];

    try {
      const user = await createTestUser(admin, "prefs");
      users.push(user);

      await signInApi(request, user);

      const invalid = await request.patch("/api/v1/me/notification-preferences", {
        data: {
          items: [
            { role: "user", kind: "kind_inexistente_p3b", channel: "inapp", enabled: false },
          ],
        },
      });
      expect(invalid.status(), await invalid.text()).toBe(400);
      expect((await invalid.json()).error.code).toBe("NOTIFICATIONS.UNKNOWN_KIND");

      const patch = await request.patch("/api/v1/me/notification-preferences", {
        data: {
          items: [
            { role: "user", kind: "reservation_created", channel: "inapp", enabled: false },
          ],
        },
      });
      expect(patch.status(), await patch.text()).toBe(200);
      expect((await patch.json()).data.count).toBe(1);

      const get = await request.get("/api/v1/me/notification-preferences");
      expect(get.status(), await get.text()).toBe(200);
      const preferences = (await get.json()).data as Array<{
        role: string;
        kind: string;
        channel: string;
        enabled: boolean;
      }>;
      expect(preferences).toContainEqual({
        role: "user",
        kind: "reservation_created",
        channel: "inapp",
        enabled: false,
      });
    } finally {
      for (const user of users) {
        await admin.from("notification_preferences").delete().eq("user_id", user.id);
      }
      await deleteUsers(admin, users);
    }
  });
});
