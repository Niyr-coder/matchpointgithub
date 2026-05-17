import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ToastProvider } from "@/components/dashboard/ToastProvider";
import { PromptModalProvider } from "@/components/dashboard/widgets/PromptModal";
import { DashboardModals } from "@/components/dashboard/modals/DashboardModals";
import { getSession } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/db/client.admin";

export const metadata = {
  title: "MatchPoint · Dashboard",
};

// Cacheamos el flag `onboarded_at` por userId. La sesión cambia muy poco y este
// gate se ejecuta en cada request al dashboard; sin cache se traduce a 1 query
// extra a profiles por navegación. La invalidación se hace desde las actions
// `saveOnboardingStep` (paso finish) y `skipOnboarding` con revalidateTag.
// Devuelve "missing" cuando no hay fila en profiles (caso borde durante el
// trigger de signup), "null" cuando la fila existe pero onboarded_at IS NULL,
// y el timestamp string cuando ya completó el wizard.
type OnboardedAtState = { profileExists: false } | { profileExists: true; onboardedAt: string | null };

// Usamos el admin client (service role) en vez del server client porque
// unstable_cache prohíbe acceder a fuentes dinámicas como cookies()/headers()
// dentro de su scope, y getServerClient() lee cookies para hidratar la sesión.
// Aquí el userId ya viene resuelto desde afuera (getSession antes del cache),
// así que leer onboarded_at sin RLS es seguro: el cache key es por userId.
async function readOnboardedAtUncached(userId: string): Promise<OnboardedAtState> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return { profileExists: false };
  return { profileExists: true, onboardedAt: (data.onboarded_at as string | null | undefined) ?? null };
}

function readOnboardedAtCached(userId: string): Promise<OnboardedAtState> {
  // unstable_cache cachea por la combinación de keyParts; el tag permite
  // invalidación quirúrgica por usuario cuando termina/skipea el wizard.
  const fn = unstable_cache(
    async () => readOnboardedAtUncached(userId),
    ["dashboard:onboarded_at", userId],
    {
      tags: [`onboarding:${userId}`],
      // Revalidación pasiva cada 5 min como red de seguridad; la invalidación
      // activa por tag es la fuente de verdad.
      revalidate: 300,
    },
  );
  return fn();
}

// Gate de onboarding: si el usuario está autenticado pero no completó el
// wizard (profiles.onboarded_at IS NULL), lo mandamos a /onboarding antes
// de dejarle ver cualquier pantalla del dashboard.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session.authenticated) {
    const state = await readOnboardedAtCached(session.session.userId);
    // Solo redirigimos cuando la fila existe pero onboarded_at IS NULL — mismo
    // comportamiento que antes del cache (sin fila ⇒ no bloqueamos).
    if (state.profileExists && state.onboardedAt == null) {
      redirect("/onboarding");
    }
  }
  return (
    <ToastProvider>
      <PromptModalProvider>
        {children}
        <DashboardModals />
      </PromptModalProvider>
    </ToastProvider>
  );
}
