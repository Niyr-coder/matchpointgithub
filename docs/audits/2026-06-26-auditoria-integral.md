# Auditoría integral · MATCHPOINT v2 · 2026-06-26

> Auditoría READ-ONLY multi-dominio (roles, API, RLS, seguridad, DB/migraciones,
> performance, UX/UI). 7 auditores en paralelo. Sin hallazgos **P0**; el riesgo
> real se concentra en un puñado de **P1** de *enforcement* y *escalabilidad*.

## Resumen ejecutivo

- **Postura general: madura.** RLS estricta, `require*` helpers, service-role
  aislado (`server-only`), webhooks Stripe timing-safe, rate-limit fail-closed en
  flujos sensibles. **Ningún P0/P1 de escalada de privilegios directa.**
- **El patrón dominante de los P1 es "infra que existe pero no está cableada"**:
  el paywall premium y la matriz RBAC son hoy *false-affordances* en el server
  (coincide con MAT-70).
- **Los P1 de performance están en el subsistema de torneos en vivo** — parte en
  el código de TV live recién mergeado (`1a85d6c`). Lo asumo: la auditoría
  encontró N+1 real en lo que acabamos de escribir.
- **Deuda de migraciones**: una migración de seguridad commiteada **vacía**,
  colisiones de prefijo de versión, e índices faltantes en tablas calientes.

---

## P1 — Atender pronto

### 1. Paywall premium sin enforcement server-side  · [roles]
`requirePlan` / `requirePlanWithFlag` existen pero **no se invocan en ningún
server action**. El gating MP+ vive solo en render (`isPlanActive`). Una llamada
directa al action salta el paywall, y como nadie llama `requirePlanWithFlag`,
flipear los flags `paywall_enforce_*` (mig 172) **no hace nada** — el killswitch
es inerte.
- Evidencia: `src/lib/auth/plan.ts:61,88` (sin callers en `src/server`);
  `createQuedada` `quedadas.ts:203-205`, `createTeam` `teams.ts:146-148`.
- Fix: cablear `requirePlanWithFlag(...)` en los actions de features MP+; error
  `PLAN.UPGRADE_REQUIRED` (402). **Es el corazón de MAT-70.**

### 2. Matriz de capacidades RBAC casi cosmética  · [roles]
El admin edita `role_capabilities` (pay.refund, mod.ban, users.suspend…) pero
`assertCapability` se usa en **un solo lugar** (`sys.roles`). Cambiar cualquier
otra capacidad no altera comportamiento → gobernanza aparente.
- Evidencia: `roles.ts:165,255`; catálogo `src/lib/auth/capabilities.ts:11-16`;
  doc reconoce "Stage 3 en curso" `docs/guides/00-roles.md:227-253`.
- Fix: cablear `assertCapability` en pagos/moderación/suspensión, o marcar las
  caps no-enforced como informativas (no exponer toggles inertes).

### 3. `rate_limit_buckets` sin RLS  · [rls + seguridad]
Tabla creada y **nunca** recibe `enable row level security` (0 policies). Con los
grants default a `anon`/`authenticated`, un cliente podría leer/`update` los
buckets que gatean signup/reservas y resetear sus propios límites.
- Evidencia: `supabase/migrations/028_concurrency_hardening.sql:33`.
- Fix: `enable row level security` + deny-all (solo service role, como
  `payment_webhook_events`). **Se agrava con el #8 (IP spoofeable).**

### 4. N+1 en pantalla TV `getTournamentLiveDisplay`  · [perf + seguridad]  ⚠️ código reciente
Recorre categorías→grupos en serie y llama `registrationLabels` (2 round-trips)
**por grupo** y por bracket → ~30-40 queries seriadas por render, cada 12s y por
cada evento realtime.
- Evidencia: `src/server/actions/tournament-live.ts:319-347,402-443`,
  `registrationLabels:241-278`.
- Fix: cargar **todas** las `registrations`+`profiles` del torneo en 2 queries y
  resolver labels en memoria; `Promise.all` por grupo.

### 5. Fanout realtime sin filtro en TV  · [perf]  ⚠️ código reciente
El cliente TV suscribe `tournament_group_matches`/`bracket_matches`/
`tournament_categories` **sin filter**. Con RLS `select true`, cada TV abierta
recibe eventos de *cualquier* torneo y dispara el refetch pesado del #4. Sin
debounce.
- Evidencia: `TournamentLiveDisplayClient.tsx` (suscripciones realtime).
- Fix: filtrar el payload client-side antes de refetchear (estas tablas no
  tienen `tournament_id` directo para `eq`), o canal por bracket/categoría +
  debounce ~1s.

### 6. Dispatcher de broadcast secuencial  · [perf]
`executeBroadcastDispatch` itera hasta 1000 destinatarios con `await notify()`
uno por uno → decenas de segundos / timeout.
- Evidencia: `src/server/marketing/dispatch-broadcast-core.ts:180-190`.
- Fix: insertar notificaciones en bulk (chunked) o RPC `security definer`.

### 7. Migración de seguridad commiteada **vacía (0 bytes)**  · [db]
El cambio de RLS de empleados de club + límite de transacciones nunca se aplicó;
el remoto lo marca "aplicado" sin efecto.
- Evidencia: `20260529235817_club_employee_ticket_rls_and_tx_limited.sql` (size 0,
  commit `a826c55`).
- Fix: reconstruir el contenido o borrar y rehacer con versión nueva.

### 8. Colisiones de prefijo de versión en migraciones  · [db]
Duplicados de `version`: `171` (×2), `20260603200000` (×2), `20260607120000`
(×2), `20260608120000` (×3). En entornos limpios, dos archivos con el mismo
`version` pueden quedar registrados-pero-no-aplicados.
- Fix: renumerar a versiones únicas.

### 9. Índices faltantes en tablas calientes  · [db + perf] (cross-confirmado)
- `registrations(tournament_id)` — columna de filtro más caliente **y** la del
  trigger anti-duplicado en cada INSERT/UPDATE → seq-scan por escritura.
  (`067_…:30-36`; único índice es GIN en `player_ids`).
- `tournament_group_matches`: `side_a/b_registration_id`, `court_id` sin índice
  (`20260603180000_…:58-61`).
- `brackets(tournament_id)` sin índice.
- Fix: `create index` en los FK/columnas calientes (bajo riesgo, alto valor).

### 10. Triggers de audit faltantes en tablas financieras / moderación  · [audit]
Tablas sensibles sin `tg_audit` y sin logging manual → **cero rastro** de quién
mutó qué:
- `payouts` (`081_payouts.sql:12`) — **dinero saliente** (payouts a clubes/
  partners); `markPayoutPaid` no deja audit.
- `user_suspensions` (`173_user_suspensions.sql:21`) — bans desde Admin Users:
  `suspendUser` llama `setAuditActor` pero **sin trigger es un no-op** → ban sin
  fila de audit (el path de `moderation.ts` sí queda por `moderation_actions`).
- `coach_commissions` (`082_coach_commissions.sql:3`) — `commission_pct` (split
  coach/club) sin audit.
- Fix: agregar `tg_audit` a esas tablas (como el resto en `099_audit_triggers.sql`).

### 11. Server Action destructiva invocable sin guard: `processScheduledAccountDeletions`  · [api + seguridad]
Es `export async` en módulo `"use server"` (`account-privacy.ts:185`), así que
Next la expone como **POST directo sin guard in-function**; borra cuentas
(`executeAccountDeletion` → `admin.auth.admin.deleteUser`, `:212`). El cron sí
gatea con `authorizeCron`, pero el action es invocable **saltándose** ese gate.
- Blast radius acotado (solo cuentas ya agendadas por su dueño + ventana de
  gracia vencida; sin parámetro de víctima) → un anónimo puede forzar la corrida
  temprano, no elegir a quién. P1/P2 por ser destructiva y alcanzable sin auth.
- Fix: chequeo de cron-secret / `requireAdminUserId` dentro de la función, o
  sacarla del surface `"use server"`.

### 12. Voseo en copy visible — viola la regla obligatoria de tuteo  · [ux]
~15+ instancias de voseo en superficies de usuario real (no solo dev), incumple
la regla dura de `AGENTS.md` (español ecuatoriano neutro, tuteo).
- Evidencia: `landing/eventos/EventDetailView.tsx:283-285` ("Liberás… querés"),
  `user/TeamScreenView.tsx:1810,2252` ("Elegí", "no tenés amigos"),
  `employee/EmployeeProShopView.tsx:939+` ("tenés/Ingresá/Cargá/Subí"),
  `dashboard/HelpScreen.tsx` (6×), `club/ClubCanchasScreenView.tsx:3342`,
  `admin/AdminBroadcastView.tsx:499`, `lib/blog/posts.ts:128,142`.
- Fix: barrido a tuteo (tienes/quieres/puedes/elige/ingresa/sube/edita); idealmente
  un lint de copy para prevenir regresión.

---

## P2 — Endurecimientos

**Roles**
- `updateRoleCapability` **sin guard explícito de admin** (depende 100% de RLS
  `rolecap_admin_all`); agregar `requireAdminUserId()` (`role-capabilities.ts:17-28`).
- Cookie `mp_active_club` **no validada** contra grants en `getSession`
  (`session.ts:108-124`); validar como el rol.
- `requireRole`/`requireClubScope` confían en cookie, no en grants (código muerto
  hoy; borrar o reimplementar sobre `role_assignments`).
- `isPlanActive` replicado inline (`quedadas.ts:139-141`, `friends.ts:432`);
  centralizar en un helper único.
- Doc/impl de "role switching admin-only" desalineados: el switch entre roles
  **concedidos** vale para cualquier multi-rol; lo admin-only es el "view-as" de
  roles no concedidos → actualizar `docs/guides/00-roles.md` y la memoria.

**API**
- 3 actions admin mutan con `getServerClient` y **sin `setAuditActor`** →
  audit sin actor: `suspendClub`/`activateClub` (`clubs.ts:932-960`),
  `setTournamentFeatured` (`tournaments.ts:1219-1248`).
- `createShift`/`deleteShift` (`shifts.ts:97-139`) sólo `requireUserId`, dependen
  de RLS sin chequeo explícito de staff.
- 12 rutas con manejo de error inconsistente: fugas de `error.message` crudo de
  DB al cliente (`api/v1/me/route.ts:34`, `…/plan/subscriptions/route.ts:26`) y
  status 400 genérico que traga errores de AUTH (varias `api/v1/**`).
- `recordSponsorPlacementEvent` (`admin/sponsors.ts:644`): INSERT service-role
  **sin guard**, anónimo-permitido (patrón tracking-pixel; infla métricas
  impresión/click, display-only y sin dedup/rate-limit).
- `createGiveawayPayEntry` (`giveaways.ts:828`): INSERT en `transactions`
  (financiera, auditada) **sin `setAuditActor`** → `audit_log` con actor null
  (el comprador queda en `created_by`).

**Seguridad** (priorizar antes de habilitar PSP / lanzamiento público)
- Webhook MercadoPago **fail-open**: sin `MP_WEBHOOK_SECRET` se omite la
  verificación de firma y todo evento → `paid`; forjable.
  (`payments/providers/mercadopago.ts:84-113`, `webhook-handler.ts:75-107`).
  Mitigado hoy: tras flag `psp_checkout_enabled` (default off).
- Rate limiting por IP del **leftmost `x-forwarded-for`** (spoofeable) →
  evade límites de signup/signin/reset (`api/client-ip.ts:9-22`).
- CSP en **Report-Only** con `unsafe-inline`+`unsafe-eval` (`next.config.ts`) →
  pasar a enforce con nonces/hashes.

**RLS**
- `fn_purge_expired_idempotency()` SECURITY DEFINER **sin `search_path`**
  (`028_concurrency_hardening.sql:27`) — único de 124; fijarlo.

**DB / Perf**
- `registrations.category_id`/`team_id` y `transactions.customer_user_id`,
  `reservation_participants.user_id`, `match_results.*` sin índice.
- `types.ts` desincronizado (Jun 19 vs migraciones a Jul 1): faltan
  `partner_link_code`, `referral_code`, `signup_auto_mp_plus`, bronze → casts
  `as any` que esconden columnas inexistentes. Regenerar.
- Fechas de migración imposibles `20260631*` (×11) — "31 de junio".
- Drift remoto↔repo parcheado con migraciones "restore/reset"; `supabase db diff`.
- `add/create … if not exists` generalizado (~100+) enmascara estado divergente.
- Páginas públicas con `force-dynamic` (clubes/eventos) → usar `revalidate=60-300`.
- Chrome admin: 5 `count: exact` full-table por render → `estimated`/cache.
- `getGroupStageSummary` serial y re-ejecutado en `closeGroupStage` /
  `generateKnockoutFromGroups`.

**UX/UI** (patrón repetido — choca con la regla de placeholders honestos)
- Fallas silenciosas sin toast: `ReservasPanel` (`UserHomeView.tsx:426`),
  prefetch `getQuedadaDetails` (`QuedadasScreenView.tsx:915`), cancelar
  inscripción (`TournamentDetailView.tsx:245` — el register del mismo archivo
  `:175` sí maneja el error).
- Empty-states con **filas placeholder** en vez de "sin datos":
  `ReservasPanel:455`, `PartnerInscritosScreenView:142`.
- Ambigüedad "sin datos" vs "filtro sin resultados" (`MensajesScreenView:623`).
- Falta loading state en `ReservasPanel.reload()`.
- Mensaje de error genérico no distingue acción (`PartnerTorneoActions.tsx:58-81`).
- **Enum crudo** mostrado al usuario en vez de pill ("Status: pending"):
  `TournamentDetailView.tsx:337`, `TournamentRegistrationsTable.tsx:106`,
  `AdminPagosScreenView.tsx:870`, `AdminPartnersScreenView.tsx:163`. Usar el
  helper `statusMeta`/`<StatusPill>` ya existente.
- **"Próximamente" como falsa afford**: CTAs primarias activas que solo disparan
  un toast (`AcademiaScreenView.tsx:343`, `ClubFinanzasView.tsx:194+`,
  `ClubStaffView.tsx:91`), vs el patrón honesto `disabled+tooltip`
  (`ClubEventosScreenView.tsx:154`). Estandarizar (ver `guides/04-placeholders.md`).
- Mismo flujo con **registro lingüístico distinto** público vs dashboard
  (cancelar inscripción: landing en voseo, dashboard en tuteo).

---

## P3 — Menores / aceptados

- TV `getTournamentLiveDisplay` con service-role + token (122 bits) sin rate
  limit: token filtrado = lecturas pesadas ilimitadas. → rate limit por token o
  cachear snapshot.
- `submitPaymentProof` confía en `proofUrl` libre del cliente; derivar el path en
  server (bucket privado acota el impacto).
- Auto-captura sin revisión al subir comprobante (decisión de producto; mantener
  alertas de reversa + audit).
- `/api/health` compara secreto con `===` (no timing-safe) vs cron que usa
  `timingSafeEqual`.
- JSON-LD blog vía `dangerouslySetInnerHTML` (hoy estático/seguro; escapar `<` si
  se vuelve dinámico).
- `getSession` fail-open ante error de DB (defensa en profundidad; RLS sigue
  siendo la línea dura). Aparece en seguridad y roles.
- Hueco de numeración `136_*`; mezcla numérica + por fecha.
- `select("*")` en lecturas calientes (clubes/clases/caja).
- Realtime admin sin filtro (mitigado por debounce 4-5s).
- Confirmación inconsistente al salir de un grupo: salir de equipo exige
  `confirm()`, salir de quedada se ejecuta directo (`TeamScreenView.tsx:1517` vs
  `QuedadasScreenView.tsx:984`).
- Emojis decorativos como íconos de deporte (🎾 duplicado pádel/tenis) en vez de
  `<Icon>` lucide (`CrearMatchModal.tsx:732`, `SolicitarClubScreenView.tsx:916`) —
  viola design-system §9.
- `ensureClubProfileContent` (`ensure-club-profile-content.ts:301`): escrituras
  cross-tenant sin guard, pero **código muerto** (0 callers); sería P1 si se
  cablea.

---

## Qué arreglar primero (roadmap sugerido)

**Ola 0 — quick wins, bajo riesgo, alto valor**
1. Índices: `registrations(tournament_id[,category_id,status])`,
   `brackets(tournament_id)`, FKs de `tournament_group_matches`. (#9)
2. `enable row level security` en `rate_limit_buckets`. (#3)
3. `search_path` en `fn_purge_expired_idempotency`.
4. `/api/health` → `timingSafeEqual`.
5. Regenerar `types.ts` y quitar `as any`.

**Ola 1 — cerrar enforcement / governance gaps (MAT-70)**
6. Cablear `requirePlanWithFlag` en actions MP+. (#1)
7. `requireAdminUserId()` en `updateRoleCapability`; validar `mp_active_club`.
8. `setAuditActor` + `getAdminClient` en `suspendClub`/`activateClub`/
   `setTournamentFeatured`; `setAuditActor` en `createGiveawayPayEntry`.
9. Cablear `assertCapability` en pagos/moderación/suspensión (o marcar informativas). (#2)
10. Triggers `tg_audit` en `payouts`, `user_suspensions`, `coach_commissions`. (#10)
11. Guard de cron-secret/admin dentro de `processScheduledAccountDeletions`. (#11)

**Ola 2 — escalabilidad torneos en vivo**
10. Refactor N+1 de `getTournamentLiveDisplay` (2 queries + memoria). (#4)
11. Filtro/debounce del fanout realtime TV. (#5)
12. Bulk insert en el dispatcher de broadcast. (#6)

**Ola 3 — seguridad pre-PSP / pre-lanzamiento**
13. MercadoPago webhook fail-closed + verificación de estado real.
14. IP confiable para rate limiting (no leftmost `x-forwarded-for`).
15. CSP enforce con nonces.

**Ola 4 — higiene de migraciones**
16. Reconstruir la migración vacía; renumerar colisiones de versión; corregir
    fechas `20260631*`; `supabase db diff` vs remoto.

**Ola 5 — UX / copy**
17. Empty-states honestos + toasts de error en los puntos listados.
18. Barrido de **voseo → tuteo** en copy visible (+ lint de copy). (#12)
19. Enums crudos → pills; estandarizar el patrón "Próximamente".

---

*Generado por auditoría multi-agente (read-only). Análisis estático; los tiempos
de performance son estimados (no se corrió `EXPLAIN` ni profiling en runtime).*
