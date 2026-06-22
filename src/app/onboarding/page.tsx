// Página dedicada de onboarding. El layout del dashboard redirige aquí si
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
import { isOnboardingIdentityComplete } from "@/lib/identity/person-name";

export const metadata = {
  title: "MATCHPOINT · Onboarding",
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
    .select(
      "onboarded_at,first_name,last_name,username,display_name,birthdate,phone,country,city,dominant_hand" as never,
    )
    .eq("id", session.session.userId)
    .maybeSingle();

  const p = (profile ?? {}) as {
    onboarded_at: string | null;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    display_name: string | null;
    birthdate: string | null;
    phone: string | null;
    country: string | null;
    city: string | null;
    dominant_hand: "left" | "right" | null;
  };

  if (p.onboarded_at != null) {
    redirect(nextUrl ?? "/dashboard/user");
  }

  // currentStep = primer paso pendiente. Personal = birthdate + country + city.
  const identityComplete = isOnboardingIdentityComplete(p);
  const personalDone = !!(p.birthdate && p.country && p.city);
  const handDone = !!p.dominant_hand;
  let currentStep: 0 | 1 | 2 | 3 = 0;
  if (identityComplete) currentStep = 1;
  if (identityComplete && personalDone) currentStep = 2;
  if (identityComplete && personalDone && handDone) currentStep = 3;

  // Si el wizard arranca en step 0 (OAuth sin nombre), sugerir desde display_name.
  let suggestedFirst = p.first_name;
  let suggestedLast = p.last_name;
  if (!identityComplete && p.display_name) {
    const parts = p.display_name.trim().split(/\s+/);
    if (!suggestedFirst) suggestedFirst = parts[0] ?? null;
    if (!suggestedLast && parts.length > 1) suggestedLast = parts.slice(1).join(" ");
  }

  return (
    <OnboardingWizard
      mode="page"
      initialStatus={{
        completed: false,
        currentStep,
        identityComplete,
        firstName: suggestedFirst,
        lastName: suggestedLast,
        username: p.username,
        birthdate: p.birthdate,
        phone: p.phone,
        country: p.country,
        city: p.city,
        dominantHand: p.dominant_hand,
      }}
      nextOnFinish={nextUrl}
    />
  );
}
