// Helper para enviar mensajes desde el perfil oficial "MatchPoint".
// Wrapper sobre el RPC fn_send_system_message (migration 105).
//
// Uso desde server actions:
//   await sendSystemMessage({
//     recipientUserId,
//     kind: "welcome_signup",
//     body: "¡Hola Vicente! Te damos la bienvenida a MatchPoint.",
//     payload: { signupAt: new Date().toISOString() },
//   });
//
// Falla silenciosa: si el RPC retorna null (killswitch off) o tira error,
// loggear y seguir — los welcomes NO deben romper el flow principal.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";

export type SystemMessageKind =
  | "welcome_signup"
  | "welcome_team_created"
  | "welcome_premium_activated"
  | "welcome_onboarding_completed"
  | "cosmetic_bundle_granted";
// Futuros: team_roster_full_reminder, plan_expiring_soon_reminder.

type Params = {
  recipientUserId: string;
  kind: SystemMessageKind;
  body: string;
  payload?: Record<string, unknown>;
};

export async function sendSystemMessage({
  recipientUserId,
  kind,
  body,
  payload = {},
}: Params): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  try {
    const supabase = await getServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("fn_send_system_message", {
      p_recipient_user_id: recipientUserId,
      p_body: body,
      p_payload: { ...payload, kind },
    });
    if (error) {
      console.error("[system-message] rpc error", { kind, recipientUserId, error });
      return { ok: false, error: error.message };
    }
    // data === null cuando killswitch off (esperado, no es error).
    return { ok: true, messageId: data as string | null };
  } catch (e) {
    console.error("[system-message] unexpected", { kind, recipientUserId, e });
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

// Templates de bienvenida. Hoy hardcoded; en una iteración futura
// (placeholder en 04-placeholders.md) se moverán a platform_config para
// editar sin redeploy.
type TemplateVars = Record<string, string | number>;

function applyVars(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export const WELCOME_TEMPLATES = {
  welcome_signup:
    "¡Hola {firstName}! Bienvenido a MatchPoint, la comunidad #1 de pickleball en Ecuador. Reserva canchas, juega torneos y sube tu MPR. Si tienes dudas, escríbenos por aquí.",
  welcome_team_created:
    'Felicidades {firstName}, creaste el team "{teamName}". Como capitán puedes invitar hasta {rosterMax} miembros y gestionar el roster. Activa MatchPoint+ para subir el cap a 24.',
  welcome_premium_activated:
    "¡{firstName}, tu MatchPoint+ está activo hasta {expiresAt}! Disfrutá reservas ilimitadas, roster ampliado en teams y estadísticas avanzadas.",
  welcome_onboarding_completed:
    "Ya completaste tu perfil, {firstName}. Te recomendamos empezar explorando los clubes cerca de {city}. ¡Buen juego!",
  cosmetic_bundle_granted:
    "¡{firstName}! Acabamos de desbloquear el {bundleLabel} en tu cuenta. Ya puedes elegir sus presets desde Mi cuenta → Personalizar.",
} as const satisfies Record<SystemMessageKind, string>;

export function renderTemplate(kind: SystemMessageKind, vars: TemplateVars): string {
  const tpl = WELCOME_TEMPLATES[kind];
  return applyVars(tpl, vars);
}
