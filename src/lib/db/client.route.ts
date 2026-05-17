// Route Handler Supabase client.
// Works with Next.js Route Handlers (app/api/**) which run on Node/Edge with cookies().
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "./env";

export async function getRouteClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
