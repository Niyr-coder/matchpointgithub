// Centralized env access. Throws early in dev if a required var is missing.

import { resolveSiteUrl } from "@/lib/site-url";

const required = (key: string, value: string | undefined): string => {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
};

export const PUBLIC_SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const PUBLIC_SUPABASE_ANON_KEY = required(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// Server-only. Never import this from a client component.
export const getServiceRoleKey = (): string =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

export const APP_URL = resolveSiteUrl(
  process.env.NEXT_PUBLIC_APP_URL,
  "http://localhost:3000",
);

export const DOCS_PUBLIC = process.env.MP_DOCS_PUBLIC === "true";
