// Página dedicada de onboarding. El layout del dashboard redirige acá si
// profiles.onboarded_at es null. Esta página a su vez:
//   · Si no hay sesión → /login?next=/onboarding.
//   · Si ya está onboardeado → respeta ?next= si vino (caso: signin que ya
//     había completado wizard); si no vino, va a /dashboard/user.
//   · Si pendiente → renderiza el wizard fullscreen sin opción de saltar.
//     El `next` se baja al wizard para que el botón final del paso 4
//     redirija al destino original (ej: /clubes/<slug>) en vez de al
//     dashboard genérico.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata = {
  title: "MatchPoint · Onboarding",
};

// Sanitizar el next para evitar open-redirect a dominios externos.
function safeNext(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const nextUrl = safeNext(rawNext);

  const session = await getSession();
  if (!session.authenticated) {
    const loginNext = nextUrl
      ? `/onboarding?next=${encodeURIComponent(nextUrl)}`
      : "/onboarding";
    redirect(`/login?next=${encodeURIComponent(loginNext)}`);
  }
  const supabase = await getServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at,preferred_sport,skill_level,favorite_club_id")
    .eq("id", session.session.userId)
    .maybeSingle();

  if (profile?.onboarded_at != null) {
    redirect(nextUrl ?? "/dashboard/user");
  }

  // Calcular currentStep desde los campos completados.
  let currentStep: 0 | 1 | 2 | 3 = 0;
  if (profile?.preferred_sport) currentStep = 1;
  if (profile?.skill_level) currentStep = 2;

  return (
    <OnboardingWizard
      mode="page"
      initialStatus={{
        completed: false,
        currentStep,
        primarySport: (profile?.preferred_sport as never) ?? null,
        skillLevel: (profile?.skill_level as never) ?? null,
        favoriteClubId: (profile?.favorite_club_id as string | null) ?? null,
      }}
      nextOnFinish={nextUrl}
    />
  );
}
