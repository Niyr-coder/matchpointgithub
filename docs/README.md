# MATCHPOINT · docs

> **Para devs (y para Claude)**: leer las secciones relevantes **antes** de
> implementar/cambiar algo. La mayoría de los bugs vienen de no saber que
> una tabla, flujo o helper ya existe. Si lo que vas a tocar está aquí
> documentado, léelo primero.

---

## ⚠️ Reglas obligatorias antes de implementar cualquier cosa

### Regla 1 · Lectura previa obligatoria

**Antes de tocar código** (mutación, feature nueva, refactor, fix), se debe
revisar:

1. **`architecture/`** completo — schema, RLS, realtime, API. Es la base.
   El bloque **§29 de `20-database.md`** lista todas las tablas y cambios
   post-MVP. Si la tabla nueva ya existe, no la crees de nuevo.
2. **El doc específico del dominio que tocas**:
   - Torneos / scoring / MPR / categorías / cronograma → `product/01-tournaments.md`
   - Pagos / comprobantes / take rate / payouts → `product/02-payments.md`
   - MATCHPOINT+ / planes premium / billing → `product/00-matchpoint-plus.md`
   - Roles / permisos / sidebar → `guides/00-roles.md`
   - Notificaciones / dispatcher → `guides/02-notifications.md`
   - Config sin redeploy → `guides/03-platform-config.md`
   - Placeholders / WIP / hardcodes → `guides/04-placeholders.md`
   - Diseño / tokens / componentes compartidos → `guides/05-design-system.md`
   - Responsive / mobile / breakpoints → `guides/06-responsive.md`
   - Auth / RLS / secrets / audit → `security/` completo
   - Datos personales / sharing / retención → `privacy/` completo

Si no encuentras la respuesta aquí, preguntar antes de inventar.

#### Verificación en navegador real (agent-browser)

El proyecto tiene instalado **[agent-browser](https://github.com/vercel-labs/agent-browser)**
(devDependency, CLI Rust nativo). Sirve para automatizar Chrome desde la
terminal y verificar que un cambio de UI funciona end-to-end sin abrir
DevTools a mano.

Comandos típicos:

```bash
npx agent-browser open http://localhost:3000/dashboard/partner/p-torneos
npx agent-browser snapshot                       # accessibility tree con refs
npx agent-browser click @e3                       # click por ref del snapshot
npx agent-browser fill @e5 "Mi torneo"
npx agent-browser screenshot ./screen.png
npx agent-browser close
```

**Cuándo usarlo**:
- Después de cambiar un flujo crítico (crear torneo, inscripción, pagos).
- Para validar que UI cambió como esperás antes de marcar como done.
- Para sacar screenshots reproducibles si el user pide ver algo.

**Cuándo NO usarlo**:
- Para tareas de pure backend / SQL — innecesario.
- Para revisar copy / tipografía estática — `Read` del archivo basta.

### Regla 2 · Español ecuatoriano neutro (OBLIGATORIO)

**Todo el contenido escrito** (esta doc, commits, comentarios, mensajes de
toast, UI copy, descripciones, respuestas en chat) debe estar en
**español ecuatoriano neutro con tuteo**.

**Prohibido**:
- Voseo: tenés, querés, podés, sabés, decís, hablás, mirás, agregás,
  necesitás, usás, fíjate (en imperativo agudo), decime, contame, avisame,
  asegurate, registrate, mirá, probá, anotalo, llamame, escribime, dale, etc.
- Modismos rioplatenses: che, dale, joya, copado, buenísimo, laburar,
  quilombo, bárbaro, garrafal, "ojo con", "anotado".
- "Acá" / "allá" cuando aplique "aquí" / "ahí".

**Forma correcta**:
- Tuteo: **tú** (nunca "vos").
- Presentes llanos: tienes, quieres, puedes, sabes, dices, hablas, miras,
  agregas, necesitas, usas, escuchas, esperas, prefieres.
- Imperativos esdrújulos con clítico: dime, avísame, cuéntame,
  asegúrate, regístrate, fíjate, pégate.
- Imperativos simples: haz, ve, ten, ejecuta, mira, prueba, abre,
  verifica, lanza, arranca.
- Reemplazos: **listo / guardado / de acuerdo** en lugar de "anotado".
  **lanzo / arranco** en lugar de "largo".

Aplica también a las preguntas en `AskUserQuestion` (labels, descripciones,
opciones) y a cualquier texto que el usuario eventualmente vea. **Releer
cada respuesta** antes de enviarla buscando terminaciones **-ás / -és / -ís**
en segunda persona y reemplazándolas.

---

## Estructura

### `architecture/` — cómo está armado el sistema
Documentación técnica deep del schema, RLS, API, realtime. La base de todo.

| Archivo | Cuándo leerlo |
|---|---|
| [00-overview.md](architecture/00-overview.md) | Onboarding general, stack, dominios |
| [10-domains.md](architecture/10-domains.md) | Mapa de entidades de negocio |
| [20-database.md](architecture/20-database.md) | Schema completo. §29 = adds post-MVP (payouts, platform_config, scoring, MPR, etc) |
| [30-rls.md](architecture/30-rls.md) | Policies por tabla. §9 = patrones post-MVP (cuándo service role) |
| [40-api.md](architecture/40-api.md) | Convenciones de server actions y REST |
| [50-realtime.md](architecture/50-realtime.md) | Canales, suscripciones, publication |
| [60-openapi.md](architecture/60-openapi.md) | Cómo se autogenera la spec en `/openapi.json` y se sirve en `/docs` |
| [70-screen-to-api.md](architecture/70-screen-to-api.md) | Mapeo de cada pantalla a sus calls |
| [80-player-plans.md](architecture/80-player-plans.md) | Tier free/premium, cron de expiración |

### `product/` — features explicadas end-to-end
Si vas a tocar lógica de torneos, pagos, premium → leer primero el doc
correspondiente. Tienen seccion "Cosas que rompen seguido".

| Archivo | Cubre |
|---|---|
| [00-matchpoint-plus.md](product/00-matchpoint-plus.md) | Plan premium del jugador, billing manual, grant admin, cron expiry |
| [01-tournaments.md](product/01-tournaments.md) | Crear, modalidades, scoring, MPR, cronograma, premios, estados, sync cross-superficie |
| [02-payments.md](product/02-payments.md) | Modelo transactions, comprobantes manuales, auto-capture torneos, refunds |

### `guides/` — manuales operativos
Leer estos cuando vayas a tocar UI, roles, configuración o agregar features.

| Archivo | Cubre |
|---|---|
| [00-roles.md](guides/00-roles.md) | Catálogo de roles, asignación, sidebar, cookie `mp_active_role`, RoleSwitcher, matriz de permisos cross-feature |
| [01-flows.md](guides/01-flows.md) | Diagramas ASCII de flujos: signup, switch role, crear/cancelar torneo, inscripción, comprobante, refund, grant MP+ |
| [02-notifications.md](guides/02-notifications.md) | Catálogo completo de `notification_kinds`, dispatcher, cómo agregar una nueva |
| [03-platform-config.md](guides/03-platform-config.md) | Tabla `platform_config`, helper, cómo editar keys, qué va aquí y qué no |
| [04-placeholders.md](guides/04-placeholders.md) | Inventario de hardcodes / stubs / WIP, archivo+línea, qué falta para quitarlos |
| [05-design-system.md](guides/05-design-system.md) | Tokens, easing, MpBarChart, MpProgressBar, RatingSparkline, modales, status pills, reglas Emil-style |

### `security/` — auth, RLS, secrets, audit
Leer estos antes de tocar autenticación, permisos, secretos o agregar
acciones admin.

| Archivo | Cubre |
|---|---|
| [00-overview.md](security/00-overview.md) | Modelo de auth, sessions, cookies, proxy.ts, threat model, helpers `require*`, findings del audit |
| [01-rls-summary.md](security/01-rls-summary.md) | RLS por tabla crítica (matriz operativa), qué cliente usar, anti-patrones |
| [02-secrets.md](security/02-secrets.md) | Service role key, NEXT_PUBLIC vs server-only, cron secret, storage buckets, rotación |
| [03-audit-log.md](security/03-audit-log.md) | `audit_log` table, triggers, `fn_admin_audit_log`, catálogo de acciones, queries |

### `privacy/` — datos personales, sharing, retención
Leer cuando vayas a recolectar/compartir/borrar datos personales o
implementar GDPR-style endpoints.

| Archivo | Cubre |
|---|---|
| [00-data-collection.md](privacy/00-data-collection.md) | Qué guardamos por entidad (identidad, deportiva, actividad, financiero, KYC) + qué NO guardamos |
| [01-data-sharing.md](privacy/01-data-sharing.md) | Quién ve qué (matriz cross-rol), fuga de `profiles`, mensajes sin E2E, vistas públicas |
| [02-retention.md](privacy/02-retention.md) | Soft vs hard delete por tabla, crons de cleanup, cierre de cuenta, GDPR / LOPDP Ecuador |

### `qa/` — checklists manuales
| Archivo | Para qué |
|---|---|
| [admin-events-support.md](qa/admin-events-support.md) | Checklist QA admin eventos |

---

## Reglas para el dev (y para Claude)

1. **Antes de implementar algo que toque torneos/pagos/premium**, leer el
   doc en `product/` correspondiente. Tiene la sección "Cosas que rompen
   seguido" que te ahorra horas.

2. **Antes de mutar una tabla**, verificar la RLS en `architecture/30-rls.md`.
   Si la mutación es admin/partner → usar `getAdminClient()` después de
   validar rol. NUNCA usar `getServerClient()` para UPDATE/INSERT en tablas
   con RLS restrictiva (falla silencioso).

3. **Si agregas una tabla**, actualizar:
   - `architecture/20-database.md` (sección 29 si es post-MVP)
   - `architecture/30-rls.md` (matriz §9.3)
   - `architecture/50-realtime.md` (si el cliente la escucha → §15)

4. **Si agregas una notif**, actualizar:
   - migration seed kind en `notification_kinds`
   - branch en `fn_dispatch_inapp_notifications`
   - tabla del doc relevante (tournaments §6, plus §4, etc)

5. **Si agregas un parámetro de negocio que puede cambiar sin redeploy**,
   usar `platform_config` en vez de constante hardcoded. Ver
   `product/02-payments.md §6` (take_rate como ejemplo).

6. **Status enums**: cualquier UI que renderice un status debe cubrir todos
   los valores del enum. Usar helpers (`txStatusMeta`, etc) en lugar de
   ternarios inline. El audit ya pescó 2 casos donde solo se mapeaban 2 de
   8 estados.

7. **MPR ≠ DUPR**. Naming propio de la plataforma. Aunque la escala 2-8
   coincide, en UI/copy/comentarios siempre MPR.

8. **MATCHPOINT no usa PSP**. Cualquier código que asuma "el pago se
   procesó automático" es bug. Todo cobro es manual humano.
