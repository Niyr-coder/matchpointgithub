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

- **Handoff sesión / migración Claude Code** → `docs/handoffs/CLAUDE-CODE-MASTER.md`
  (inventario de lo ya hecho — no rehacer).
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

## Skill routing (usa estas skills automáticamente)

Las skills se auto-disparan por su `description`, pero **no esperes a que el
usuario las recuerde** — invoca la que corresponda según el tipo de trabajo.
Orden general: **leer doc → planear → implementar → revisar**.

| Cuándo | Skill a invocar | Momento |
|---|---|---|
| Vas a tocar torneos, pagos, premium, roles, RLS, realtime, notifs, audit, schema, server actions, endpoints, pantallas | `matchpoint-docs-guide` | ANTES (leer doc) |
| El usuario expresa intención de feature ("quiero/implementemos/qué falta/siguiente fase") | `matchpoint-feature-plan` | ANTES de codear (tras docs-guide) |
| Tocás temas de personalización, packs/bundles, colores, rareza del catálogo | `matchpoint-theme-create` | durante el trabajo de temas (cómo construir) |
| Agregás/cambiás algo de personalización y querés pensar QUÉ MÁS debe existir/cablearse (gating MP+, superficies, catálogo, path admin) | `matchpoint-personalization-governance` | en el paso de governance de personalización |
| Agregás/cambiás RoleKey, permiso, superficie admin, sidebar, o una feature necesita "path admin" | `matchpoint-role-governance` | en el paso de governance |
| Hay animación/transición nueva (modal, drawer, hover, entrada/salida) | `emil-design-eng` | durante la implementación |
| Terminaste UI (cards, listas, forms, modales, tabs) | `matchpoint-ui-review` | DESPUÉS (QA visual) |
| Feature con 3+ archivos tocados, o bug "estructural" cross-superficie | `matchpoint-logic-review` | DESPUÉS, antes del commit final |

Regla dura (memoria del proyecto): para features de MP v2, **SIEMPRE**
invoca `matchpoint-docs-guide` + `matchpoint-feature-plan` antes de tocar
código; no empieces a codear hasta que el plan esté aceptado.

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

**Marca**: en copy visible la marca se escribe **MATCHPOINT** (mayúscula), no
"MatchPoint". El premium completo es **MATCHPOINT+** (forma corta `MP+`). No
toca identificadores de código (`MatchPointPlusModal`, `grantMatchPointPlusAdmin`)
ni el dominio `matchpoint.top`.

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
