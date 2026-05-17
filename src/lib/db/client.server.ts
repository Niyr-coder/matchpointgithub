// Server Component / Server Action Supabase client.
// Reads + writes auth cookies via Next.js cookies() API.
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "./env";

export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component; cookies are read-only there.
          // Mutations only happen from Server Actions / Route Handlers,
          // which is the path where setAll succeeds.
        }
      },
    },
  });
}
