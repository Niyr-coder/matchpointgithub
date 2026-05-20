import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Keys de temas marcados inactivos por admin (tabla theme_settings, mig 129).
// Ausencia de fila = activo, así que solo leemos los active=false. Lo usan el
// picker (PersonalizacionScreen) para ocultarlos y setTheme para rechazarlos.
export async function getInactiveThemeKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("theme_settings")
    .select("key")
    .eq("active", false);
  if (error) return new Set();
  return new Set(((data ?? []) as Array<{ key: string }>).map((r) => r.key));
}
