// Server: pantalla de Soporte del jugador. Trae datos reales de identificación
// (email, user id, plan) para la sección "Datos para soporte". El resto del
// render rico vive en SoporteScreenView (client).
//
// Alcance: el canal de soporte REAL hoy es Mensajes (conversación kind=support).
// El sistema de tickets (form + historial) y el estado del sistema son demo —
// no hay backend de tickets ni status page todavía. Documentado en
// docs/guides/04-placeholders.md.
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import { SoporteScreenView } from "./SoporteScreenView";

export async function SoporteScreen() {
  const session = await getSession();
  if (!session.authenticated) {
    return <SoporteScreenView email={null} userId={null} planLabel="Jugador (free)" isPremium={false} />;
  }
  const { userId, email } = session.session;
  const summary = await getProfileSummary(userId);
  const { tier } = isPlanActive(summary);
  const isPremium = tier === "premium";
  return (
    <SoporteScreenView
      email={email}
      userId={userId}
      planLabel={isPremium ? "MATCHPOINT+ (premium)" : "Jugador (free)"}
      isPremium={isPremium}
    />
  );
}
