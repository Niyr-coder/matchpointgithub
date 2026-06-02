import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { ToastProvider } from "@/components/dashboard/ToastProvider";
import { ResetPasswordToast } from "@/components/dashboard/ResetPasswordToast";
import { PromptModalProvider } from "@/components/dashboard/widgets/PromptModal";
import { DashboardModals } from "@/components/dashboard/modals/DashboardModals";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getAdminClient } from "@/lib/db/client.admin";
import { retarHeroWhoFromUser } from "@/lib/match/retar-hero-present";

export const metadata = {
  title: "MATCHPOINT · Dashboard",
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

// Doble gate del dashboard:
//   1) Si no hay sesión → /login?next=/dashboard/user (defensa en profundidad;
//      el proxy.ts ya redirige acceso anónimo a /dashboard/*, pero por
//      cinturones y tirantes lo replicamos aquí en caso de que el matcher
//      no aplique o la cookie esté corrupta).
//   2) Si hay sesión pero el wizard no se completó (profiles.onboarded_at IS
//      NULL), lo mandamos a /onboarding antes de cualquier pantalla.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.authenticated) {
    redirect("/login?next=/dashboard/user");
  }
  const currentUserId = session.session.userId;
  const profile = await getProfileSummary(currentUserId);
  const initialRetarYou = retarHeroWhoFromUser(
    currentUserId,
    profile.displayName,
    profile.username,
  );
  const state = await readOnboardedAtCached(currentUserId);
  if (state.profileExists && state.onboardedAt == null) {
    redirect("/onboarding");
  }
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <ResetPasswordToast />
      </Suspense>
      <PromptModalProvider>
        {children}
        {/* Bajamos el userId desde server al wrapper de modales para que
            CrearMatchModal / RetarModal puedan armar teamA con el creador
            sin necesidad de un fetch extra al abrir. */}
        <DashboardModals currentUserId={currentUserId} initialRetarYou={initialRetarYou} />
      </PromptModalProvider>
    </ToastProvider>
  );
}
