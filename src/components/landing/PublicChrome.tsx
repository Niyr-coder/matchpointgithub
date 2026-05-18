// PublicChrome — wrapper server async para todas las páginas del landing.
// Resuelve la sesión + perfil mínimo del usuario logueado y los baja al Nav
// vía el componente client interno. Esto evita que el Nav muestre "Iniciar
// sesión / Crear cuenta" cuando el user YA tiene sesión válida.
//
// `usePaywall` sigue exportado desde aquí por back-compat (los hijos lo
// importan así). El hook real vive en PublicChromeClient.
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { PublicChromeClient } from "./PublicChromeClient";
import type { NavAuth } from "./Nav";

export { usePaywall } from "./PublicChromeClient";

export async function PublicChrome({ children }: { children: ReactNode }) {
  const session = await getSession();
  let auth: NavAuth | null = null;
  if (session.authenticated) {
    const supabase = await getServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name,username,avatar_url")
      .eq("id", session.session.userId)
      .maybeSingle();
    auth = {
      userId: session.session.userId,
      displayName:
        (profile?.display_name as string | null) ??
        (profile?.username as string | null) ??
        "Tu cuenta",
      username: (profile?.username as string | null) ?? null,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
    };
  }
  return <PublicChromeClient auth={auth}>{children}</PublicChromeClient>;
}
