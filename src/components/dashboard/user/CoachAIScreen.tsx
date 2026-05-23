// Server: resuelve si el user tiene MATCHPOINT+ activo. Coach AI es un
// beneficio exclusivo MP+. El gating se aplica en server (decide isPremium) y
// en client (muestra herramienta o banner de upsell). Por ahora la pantalla es
// estática con datos mock — no hay backend de análisis de video todavía.
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import { CoachAIScreenView } from "./CoachAIScreenView";

export async function CoachAIScreen() {
  const session = await getSession();
  if (!session.authenticated) {
    return <CoachAIScreenView isPremium={false} />;
  }
  const summary = await getProfileSummary(session.session.userId);
  const { tier } = isPlanActive(summary);
  return <CoachAIScreenView isPremium={tier === "premium"} />;
}
