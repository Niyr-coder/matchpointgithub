// Browser-side Supabase client. Use in Client Components only.
// Reuses a singleton per tab to avoid multiple WS connections.
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "./env";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getBrowserClient() {
  if (cached) return cached;
  cached = createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
  return cached;
}
