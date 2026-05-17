// Página dedicada de onboarding. El layout del dashboard redirige acá si
// profiles.onboarded_at es null. Esta página a su vez:
//   · Si no hay sesión → /login?next=/onboarding.
//   · Si ya está onboardeado → /dashboard/user (evita loop si llega manualmente).
//   · Si pendiente → renderiza el wizard fullscreen sin opción de saltar.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata = {
  title: "MatchPoint · Onboarding",
};

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session.authenticated) {
    redirect("/login?next=/onboarding");
  }
  const supabase = await getServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at,preferred_sport,skill_level,favorite_club_id")
    .eq("id", session.session.userId)
    .maybeSingle();

  if (profile?.onboarded_at != null) {
    redirect("/dashboard/user");
  }

  // Calcular currentStep desde los campos completados.
  let currentStep: 0 | 1 | 2 | 3 = 0;
  if (profile?.preferred_sport) currentStep = 1;
  if (profile?.skill_level) currentStep = 2;
  // favorite_club_id puede ser null porque el user dijo "ninguno"; sin un
  // flag explícito de "vi el paso 3", asumimos que si saltó skill_level
  // ya llegó al paso club. Para no loopear en el paso 3 indefinidamente,
  // si tiene los dos campos previos lo dejamos elegir club o avanzar.

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
    />
  );
}
