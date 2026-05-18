<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Lee la doc antes de implementar

Cuando vayas a tocar lógica de torneos, pagos, premium, roles, RLS o
realtime, **leé primero el doc relevante en `docs/`**. Los archivos tienen
secciones "Cosas que rompen seguido" y "Sincronía cross-superficie" que te
ahorran retrabajo.

Mapa rápido:

- **Schema, tablas, enums** → `docs/architecture/20-database.md` (§29 = adds
  post-MVP).
- **RLS y cuándo usar `getAdminClient` vs `getServerClient`** →
  `docs/architecture/30-rls.md` (§9).
- **Realtime: qué tablas escuchar, cómo sumar una nueva al publication** →
  `docs/architecture/50-realtime.md` (§15).
- **Flujos de torneo (crear / cancelar / inscribir / scoring / MPR / etc)** →
  `docs/product/01-tournaments.md`.
- **MatchPoint+ (premium, billing manual, grant admin)** →
  `docs/product/00-matchpoint-plus.md`.
- **Pagos, comprobantes, refunds, take rate, payouts** →
  `docs/product/02-payments.md`.

Si vas a agregar feature nueva (tabla, notif, status, etc), revisar la
sección "Reglas para el dev" en `docs/README.md` — lista lo que tienes que
mantener en sync.

## Tono: español ecuatoriano neutro (obligatorio)

Todo el contenido escrito (commits, comentarios de código, mensajes de
toast, UI copy, descripciones, respuestas en chat, preguntas en
AskUserQuestion) debe estar en español ecuatoriano neutro con **tuteo**.

- **Prohibido**: voseo (tenés/querés/podés/agregás/decime/contame/avisame/
  asegurate/mirá/probá/dale, etc.) y modismos rioplatenses (che, dale,
  joya, copado, laburar, quilombo, bárbaro).
- **Correcto**: tú, tienes, quieres, puedes, dices, agregas, dime,
  cuéntame, avísame, asegúrate, mira, prueba, listo.

Ver `docs/README.md` Regla 2 para la guía completa.

## Browser automation

El proyecto tiene `agent-browser` instalado como devDependency. Cuando
necesites verificar un flujo de UI end-to-end:

```bash
npx agent-browser open <url>
npx agent-browser snapshot     # accessibility tree con refs (@e1, @e2, ...)
npx agent-browser click @e3
npx agent-browser screenshot path.png
npx agent-browser close
```

Útil después de cambios en flujos críticos (crear torneo, inscripción,
pagos) para confirmar que el cambio funciona antes de marcar la tarea
como done.
