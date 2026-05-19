#!/usr/bin/env node
// UserPromptSubmit hook · MatchPoint v2
//
// Cuando el prompt del user menciona cambios de feature/lógica que tocan
// schema/RLS/realtime/notifs/server actions/etc., inyecta un system-reminder
// obligando al modelo a invocar matchpoint-docs-guide + matchpoint-feature-plan
// antes de codear. Para fixes visuales o cambios triviales no dispara.
//
// Match: >=1 keyword "fuerte" (schema, migration, rls, server action, audit,
// feature flag, killswitch) ó >=2 keywords "débiles" (agregar, crear, feature,
// tabla, torneo, pago, premium, team, club, etc.).

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let prompt = "";
  try {
    prompt = (JSON.parse(raw).prompt || "").toLowerCase();
  } catch {
    // no-op
  }

  const strong =
    /\b(schema|migration|migracion|server action|feature flag|killswitch|audit)\b/;
  const weakRe =
    /\b(agregar|agregue|implementar|implemente|crear|cree|nuevo|nueva|sumar|sumemos|feature|pantalla|screen|tabla|rls|polic|realtime|publication|endpoint|route|ruta|notif|broadcast|torneo|pago|premium|estelar|rol|permiso|team|club|reserva|cancha)\b|matchpoint\+/g;

  let trigger = strong.test(prompt);
  if (!trigger) {
    const hits = (prompt.match(weakRe) || []).length;
    if (hits >= 2) trigger = true;
  }

  if (trigger) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext:
            "[matchpoint-skills-reminder] El prompt sugiere cambio de feature/lógica. Antes de tocar código, invoca en orden: (1) matchpoint-docs-guide para leer docs/architecture y docs/product relevantes, (2) matchpoint-feature-plan para producir el plan tailored. Si es bug fix puramente visual o trivial, ignora esto y procede.",
        },
      }),
    );
  }
});
