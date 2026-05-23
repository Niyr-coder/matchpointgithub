// Carga lazy de variables de entorno requeridas por los tests E2E.
// El runner espera estas en `.env.local` (next dev las usa) o en el environment.
// Falla rápido con mensaje claro si falta algo — sin esto los tests dan errores
// crípticos contra `https://undefined`.

export type RequiredEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  baseUrl: string;
};

export function getRequiredEnv(): RequiredEnv {
  const missing: string[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(
      `[e2e] Variables de entorno faltantes: ${missing.join(", ")}.\n` +
        `Apuntar a Supabase local/preview con migraciones aplicadas — ver playwright.config.ts.`,
    );
  }
  const baseUrl = process.env.MATCHPOINT_E2E_BASE_URL ?? "http://localhost:3000";
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, baseUrl };
}

// Credenciales del owner E2E. Reutilizamos el dominio `@matchpoint.demo` del
// seeder principal para limpieza fácil. Cambiar la contraseña por env si se
// requiere rotación.
export const E2E_OWNER_EMAIL =
  process.env.E2E_OWNER_EMAIL ?? "e2e-owner@matchpoint.demo";
export const E2E_OWNER_PASSWORD =
  process.env.E2E_OWNER_PASSWORD ?? "MatchPoint-e2e-2026";
export const E2E_CLUB_NAME = process.env.E2E_CLUB_NAME ?? "Club E2E Pickleball";
export const E2E_CLUB_SLUG = process.env.E2E_CLUB_SLUG ?? "e2e-pickleball";
