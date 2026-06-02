# QA · Checklist cross-superficie para flujos nuevos

Usa este checklist cada vez que agregues o cambies un flujo de producto:
crear, aprobar, cancelar, publicar, asignar, pagar, reembolsar, reportar,
mensajear o cualquier acción que cambie estado visible para más de un rol.

La meta es evitar que el flujo funcione en una pantalla pero quede roto en
roles, RLS, realtime, notificaciones, mensajería, admin espejo o auditoría.

## Checklist breve

- [ ] **Roles y permisos:** define quién puede ver, crear, editar, cancelar o
  aprobar el flujo. Actualiza `docs/guides/00-roles.md` si cambia la matriz
  de permisos, el sidebar, una capacidad o un rol afectado.
- [ ] **RLS y cliente Supabase:** revisa `docs/architecture/30-rls.md` antes
  de mutar tablas. Si una server action valida rol en código y necesita
  mutar una tabla restrictiva, usa `getAdminClient()` después del check de
  rol; para lecturas normales usa `getServerClient()`.
- [ ] **Realtime:** identifica todas las pantallas que leen las tablas
  escritas por el flujo, incluso si otra pantalla hace la mutación. Si la UI
  debe refrescarse sola, verifica que la tabla esté en
  `supabase_realtime` y que exista suscripción o `useRealtimeRefresh`.
- [ ] **Notificaciones in-app:** si alguien debe enterarse aunque no esté en
  la pantalla, agrega o reutiliza un `notification_kind`, encola
  `notification_jobs`, actualiza el dispatcher y documenta el kind en
  `docs/guides/02-notifications.md`.
- [ ] **Mensajería del sistema:** si la comunicación debe quedar como hilo
  persistente en chat, usa system messages en lugar de solo notificación.
  Verifica template, payload, killswitch y que el destinatario tenga
  conversación/unread correcto.
- [ ] **Admin espejo:** si el usuario, partner, owner, manager o empleado
  puede hacer el flujo, revisa si admin necesita verlo, corregirlo,
  revertirlo o ejecutarlo desde su panel de soporte. Documenta la ruta admin
  esperada o marca explícitamente que no aplica.
- [ ] **Audit actor:** toda mutación admin o service-role debe dejar actor
  trazable. Si usas `getAdminClient()`, llama `setAuditActor(...)` antes de
  mutar para evitar `actor_id=null` o `actor_role='system'` en acciones
  humanas.
- [ ] **Tests y QA manual:** agrega cobertura proporcional al riesgo: pgTAP
  para RLS, unit/integration para server actions, y recorrido manual o
  `agent-browser` para flujos UI críticos. Incluye al menos un caso permitido
  y uno bloqueado por rol/RLS.

## Preguntas rápidas antes de cerrar

1. ¿Qué roles ven el estado inicial, el estado final y los errores?
2. ¿La mutación principal y las mutaciones derivadas usan el cliente correcto?
3. ¿Todas las pantallas que muestran conteos/listas se actualizan después del
   cambio?
4. ¿El usuario afectado recibe notificación o mensaje si no está presente?
5. ¿Admin puede dar soporte sin tocar SQL manual?
6. ¿El audit permite saber quién hizo la acción y desde qué rol?
7. ¿Hay un test que pruebe el camino feliz y un test que pruebe el bloqueo?

## Referencias

- Roles y capacidades: `docs/guides/00-roles.md`
- Notificaciones y system messages: `docs/guides/02-notifications.md`
- RLS, service role y audit actor: `docs/architecture/30-rls.md`
- Realtime y publication: `docs/architecture/50-realtime.md`
