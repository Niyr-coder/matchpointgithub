# Playbook de cambio de marca (rebrand de MATCHPOINT)

> **Estado:** borrador de ejecución · **Fecha del inventario:** 2026-07-05
> **Motivo:** el nombre "MATCHPOINT" genera riesgo legal / de marca dentro y
> fuera del país. Este documento es el inventario exhaustivo de dónde vive la
> marca y el orden seguro para reemplazarla.

---

## 0. Decisión pendiente (bloquea la Fase 2)

Este playbook está escrito **agnóstico al nombre nuevo**. Donde leas
`‹NUEVO_NOMBRE›` va la marca base nueva, y donde leas `‹NUEVO_NOMBRE›+` va el
premium (hoy `MATCHPOINT+` / `MP+`).

Antes de ejecutar la Fase 2 hay que cerrar tres cosas:

1. **Nombre base** y su forma corta (equivalente actual de `MP`).
2. **Nombre del premium** (equivalente de `MATCHPOINT+` / `MP+`).
3. **Dominio nuevo** (apex + `www` + subdominio `tv`) y buzones de email.

Una vez elegidos, la capa de copy visible (Capa 1) es un find/replace casi
mecánico. Todo lo demás no depende del nombre exacto y puede prepararse en
paralelo.

> **Nota de trademark:** el motivo del rebrand es legal, así que el nombre
> nuevo debe pasar por búsqueda de disponibilidad (IEPI/registro local + una
> revisión internacional básica) **antes** de comprar dominio o imprimir
> assets. No es parte de este repo, pero es el gate real de la Fase 0.

---

## 1. Resumen ejecutivo

La marca aparece en **~1.093 ocurrencias sobre 316 archivos** (barrido
case-insensitive de `matchpoint`, sin contar `node_modules`/`.next`). El
trabajo se agrupa en **8 capas** con riesgos muy distintos:

| Capa | Qué es | Dificultad | Riesgo | Método |
|---|---|---|---|---|
| 1. Copy visible | Texto que ve el usuario (UI, emails, PDF, metadata) | Baja | Bajo | Find/replace de string |
| 2. Identificadores de código | Nombres de componentes, funciones, tipos, clases CSS | Media-alta | Medio | Refactor (o **no tocar**) |
| 3. Dominio y URLs | `matchpoint.top`, `tv.`, emails, redirects, OAuth | Media | **Alto** | Find/replace + acción externa |
| 4. Assets | Logos, favicons, íconos PWA, OG images | Baja-media | Bajo | Reemplazar binarios + regenerar |
| 5. Config / env / metadata | `package.json`, `manifest.ts`, envs de Vercel | Baja | Medio | Find/replace + reconfigurar env |
| 6. Base de datos | Perfil de sistema, copy de notifs, enums/CHECK | Media-alta | **Alto** | Migration nueva + backfill |
| 7. Docs | `docs/`, `AGENTS.md`, skills | Baja | Nulo | Find/replace por lote |
| 8. Externo / manual | DNS, Supabase, OAuth, Resend, legal, redes | Alta | **Alto** | Consolas externas (no es código) |

**Estrategia de menor riesgo:** hacer un rename **de superficie** (copy +
dominio + assets + datos vivos), y **congelar** los identificadores internos
(`MatchPointPlus*`, `MP_*`, la sigla `MPR`, nombres de archivo, clases CSS
`.mp-*`). El usuario no los ve; renombrarlos es una Fase 2 opcional puramente
higiénica que multiplica el riesgo sin beneficio de marca.

---

## 2. Principios de la migración

1. **Superficie sí, plomería no.** Se cambia lo que el usuario lee y los
   sistemas externos que hablan con el mundo. Los símbolos internos se dejan.
2. **Migrations viejas no se editan.** Todo cambio de datos vivos va en una
   migration nueva.
3. **Conservar nombres de archivo de assets.** Reemplazar el contenido gráfico
   de `matchpoint-icon-*.png` en vez de renombrar el archivo (evita tocar
   `manifest.ts` y `layout.tsx`).
4. **La sigla `MPR` es un token, no copy.** Se conserva `MPR`; solo se cambia
   la expansión visible "MatchPoint Rating" donde aparezca como texto.
5. **Dominio primero.** Nada de copy ni datos se toca hasta que el dominio
   nuevo, el email remitente y las redirect URLs de auth estén configuradas, o
   se rompe login y correos.

---

## 3. Inventario por capas

### Capa 1 — Copy visible (UI) · BAJO riesgo

La capa más grande y la más segura. Distinguir siempre dos tokens:
**`MATCHPOINT`** (base) y **`MATCHPOINT+` / `MP+`** (premium).

- **Metadata / título** — `src/app/layout.tsx`: `TITLE`, `applicationName`,
  `openGraph.siteName/title`, `twitter.title`.
- **Landing / marketing** — `src/components/landing/**`: `Footer.tsx`
  (`© 2026 MATCHPOINT Ecuador · matchpoint.top`, subjects de mailto), `Nav.tsx`,
  `Home.tsx`, `acerca/`, `casos/`, `precios/`, `material/`, `coaches-cobrar/`,
  `soy-partner/`, `soy-coach/`, `soy-club/`, `como-funciona/`, `ranking/`,
  `sandbox/`, `demo/`, `eventos/`, `trabaja/`, `blog/*`.
- **Dashboard** — `user/MpPlusSalesView.tsx`, `user/MiPlanScreenView.tsx`,
  `user/MensajesScreenView.tsx`, `user/TeamScreenView.tsx`,
  `admin/AdminUsersScreenView.tsx`, `admin/AdminBroadcastView.tsx`
  (preview `hola@matchpoint.top`), `admin/AdminMatchPointPlusScreen*.tsx`,
  `admin/AdminConfigView.tsx` (`domain: "matchpoint.top"`),
  `HelpScreen.tsx`, `src/lib/help-cms.ts`.
- **Catálogo premium** — `src/lib/marketing/mp-plus.ts`: `name: "MATCHPOINT+"`,
  `shortName: "MP+"`, `requestCta`, badges, "Identidad MATCHPOINT+".
- **Emails** — `src/lib/notifications/email-templates.ts`: header/footer/firmas
  y asunto "Tu MATCHPOINT+ expira en N días".
- **PDF** — `src/lib/pdf/TournamentSchedulePdf.tsx`: `creator` y footer.
- **TV** — `src/app/tv/page.tsx` muestra `tv.matchpoint.top` como texto.
- **Onboarding / legal** — `src/components/onboarding/OnboardingWizard.tsx`,
  `src/components/dashboard/user/OnboardingWizard.tsx`,
  `src/app/legal/terminos/page.tsx`.
- **SVGs con texto de marca** (también Capa 4) — `src/assets/blog-art/
  og-blog-index.svg`, `og-blog-default.svg` renderizan el texto `MATCHPOINT`.

### Capa 2 — Identificadores de código · **NO tocar (recomendado)**

El `AGENTS.md` es explícito: en un rename de marca **no** se tocan estos
símbolos. Se listan solo para constancia; congelarlos es la opción de menor
riesgo.

- **Funciones / server actions:** `grantMatchPointPlusAdmin`,
  `grantMatchPointPlus`, `grantMatchPointPlusInternal`, `revokeMatchPointPlus`
  (`src/server/plan/grant-matchpoint-plus.ts`,
  `src/server/actions/player-subscriptions.ts`,
  `src/server/actions/admin/club-plans.ts`).
- **Componentes / tipos:** `MatchPointPlusModal`, `MatchPointPlusScreen`,
  `MpPlusSalesView`, `MpPlusManageView/Screen/Data`, `MpPlusUpsell(Props)`,
  `MpPlusBenefit(Category)`, `MpPlusComparisonRow`.
- **Constantes:** `MP_PLUS_PLAN`, `MP_PLUS_CORE_BENEFITS`,
  `MP_PLUS_MODAL_BENEFITS`, `MP_PLUS_BENEFIT_CATEGORIES`,
  `MP_PLUS_MANAGE_BENEFITS`, `MP_PLUS_COACH_PREVIEW_FEATURES`, `MP_ROLES`,
  `MP_ROLE_SCREENS`.
- **Nombres de archivo:** `grant-matchpoint-plus.ts`, `mp-plus.ts`,
  `MatchPointPlusModal.tsx`, `MatchPointPlusScreen.tsx`, `MpPlus*.tsx`,
  `signup-auto-mp-plus.ts`.
- **Clases CSS `.mp-*`** en `globals.css` / `profile-v3.css`: cosméticas;
  refactor opcional de bajísimo valor.

### Capa 3 — Dominio y URLs · **ALTO riesgo**

**Fallbacks hardcodeados a `https://matchpoint.top`** (deben salir del env,
pero tienen default literal):

- `src/lib/site-url.ts` → `DEFAULT_SITE_URL`.
- **`src/server/actions/auth.ts:410`** → `return "https://matchpoint.top"`
  para el redirect de OAuth/callback. **Crítico:** si esto no cambia, el login
  redirige al dominio viejo.
- `src/app/blog/[slug]/page.tsx`, `src/app/blog/page.tsx`,
  `src/components/landing/blog/PostHeader.tsx` → `SITE_URL`.
- `src/components/referrals/ReferralInviteSheet.tsx`,
  `src/components/dashboard/user/TeamScreenView.tsx` → fallback de invite.
- `TournamentVenueDisplayPanel.tsx`, `TournamentMonitorsPanel.tsx`,
  `modals/CrearEventoModal.tsx` → `NEXT_PUBLIC_APP_URL ?? "https://matchpoint.top"`.
- `owner/config-sections/IdentidadSection.tsx` → texto `matchpoint.top/clubes`.

**Subdominio TV** (`tv.matchpoint.top`): `src/proxy.ts:29-31` (rewrite por host
`^tv\.`), `next.config.ts:42`, `src/app/tv/page.tsx`,
`TournamentVenueDisplayPanel.tsx` (`NEXT_PUBLIC_TV_URL`).

**Redirect www→apex:** `next.config.ts:46-50` (`host www.matchpoint.top`).

**Emails hardcodeados `@matchpoint.top`:** `src/lib/legal/entity.ts`
(`privacidad@`, `hola@`, `soporte@`), `landing/Footer.tsx`
(`soporte-clubes@`, `prensa@`, `hola@`), `landing/trabaja/*` (`trabaja@`),
`coaches-cobrar/`+`material/` (`coaches@`), `casos/`+`acerca/` (`hola@`),
`user/SoporteScreenView.tsx` (`SUPPORT_EMAIL`),
`user/AccountPrivacyPanel.tsx` (`privacidad@`), `BetaPhaseAuthNotice.tsx`,
`api/cron/dispatch-email/route.ts` + `api/v1/contact/sales/route.ts`
(`DEFAULT_FROM = notif@`, `DEFAULT_TO = ventas@`),
`src/lib/calendar/reservation-ics.ts` (`UID:${uid}@matchpoint.top` — cambiarlo
altera el dedupe en los calendarios ya suscritos; decidir con cuidado),
`src/lib/schemas/common.ts` (`example: "tu@matchpoint.top"`).

**Redes:** `landing/Footer.tsx:93` → `instagram.com/matchpoint.top/`.

### Capa 4 — Assets · BAJO-MEDIO riesgo

- **Íconos / PWA / favicon:** `public/icons/matchpoint-icon.svg` (fuente),
  `matchpoint-icon-192.png`, `-512.png`, `-maskable-512.png`,
  `public/icons/apple-touch-icon.png`, `src/app/icon.svg`,
  `src/app/apple-icon.png`, `src/app/favicon.ico`. Generador:
  `scripts/generate-app-icons.ts` (`npm run icons:generate`).
- **Open Graph / blog:** `src/assets/blog-art/og-blog-index.svg`,
  `og-blog-default.svg` (contienen el **texto** `MATCHPOINT` — editar el SVG),
  `public/og/blog-default.jpg`, `blog-index.jpg` (regenerar con
  `scripts/render-blog-images.ts` → `npm run blog:images`).

> **Conservar los nombres de archivo** de los íconos y solo reemplazar el
> gráfico: así no hay que tocar las rutas en `manifest.ts` ni `layout.tsx`.

### Capa 5 — Config / env / metadata · MEDIO riesgo

- `package.json` → `"name": "matchpoint"`.
- `src/app/manifest.ts` → `name`, `short_name`, `description`, rutas de íconos.
- `src/app/layout.tsx` → metadata + rutas de íconos.
- `.env.example` (y por ende Vercel): `EMAIL_FROM`, `MP_LEGAL_NAME`,
  `MP_LEGAL_RUC/ADDRESS/REPRESENTATIVE`, `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_TV_URL`, `NEXT_PUBLIC_SUPABASE_URL`.
- `docs/security/02-secrets.md` documenta `EMAIL_FROM`.

> Los nombres de env var con prefijo `MP_` no son visibles: dejarlos. Solo el
> **valor** de `EMAIL_FROM` y `MP_LEGAL_NAME` es marca y sí cambia.

### Capa 6 — Base de datos · **ALTO riesgo**

Regla dura: migration nueva + backfill de filas vivas. No editar migrations
aplicadas.

- **Perfil de sistema "MATCHPOINT"** (fila real en `profiles`, lo más sensible):
  `104_messages_system.sql` (seed `display_name 'MatchPoint'`, `username
  'matchpoint'`, email `matchpoint@system.local`), `107_system_profile_
  excluded.sql` (`display_name = 'MATCHPOINT'`), `109_username_ci_unique.sql`
  (conflicto `@matchpoint`), `110_backfill_welcome_matchpoint.sql` (copy del
  welcome DM), `111_matchpoint_friend_and_readonly.sql`,
  `105_fn_send_system_message.sql`. Test: `tests/e2e/helpers/
  ensure-system-profile.ts`. Documentado en `docs/architecture/20-database.md:2265`.
- **Copy de notificaciones** (títulos/bodies con la marca):
  `176_admin_ola1_notifications.sql`, `20260530232000_p2c_*`,
  `20260531042132_p2a_*`, `20260531042315_p2b_*`,
  `20260605130000_notification_audit_complete.sql`, `166_team_reports.sql`,
  `103_team_roster_cap_notif.sql`.
- **Valores tipo-enum / CHECK con la marca:**
  `20260606120000_giveaways_v2_feed.sql` → `check (owner_type in
  ('club','partner','matchpoint'))` (el valor `'matchpoint'` toca constraint +
  filas + comparaciones en código si se renombra), `tierKey: "matchpoint_plus"`
  en `mp-plus.ts` (clave de tier que se propaga a analytics/DB).
- **MPR = "MatchPoint Rating"** (~147 usos / 54 archivos): `076_rename_dupr_
  to_mpr.sql` y toda la lógica en `src/lib/mpr/*`, `src/lib/teams/mpr.ts`,
  `player_stats`, flags de categoría. **Conservar la sigla `MPR`**; cambiar
  solo la expansión "MatchPoint Rating" donde sea copy.

### Capa 7 — Docs · riesgo NULO

~40 archivos en `docs/` mencionan la marca (destacan `architecture/
90-canonical-url.md`, `product/00-matchpoint-plus.md`, `product/
08-monetization-blueprint.md`, `guides/04-placeholders.md`, `guides/
07-new-feature-checklist.md`, `handoffs/CLAUDE-CODE-MASTER.md`). Meta-repo (no
producto): `AGENTS.md`, `CLAUDE.md`, skills `.claude/skills/matchpoint-*`.
Baja prioridad; no afecta runtime.

### Capa 8 — Externo / manual · **ALTO riesgo (coordinación)**

No es find/replace; son acciones en consolas externas:

1. **DNS + Vercel** — dominio nuevo: apex, `www` (redirect ya existe), y el
   subdominio **`tv`** (rewrite en `proxy.ts`). *(Ver también la nota sobre la
   fragilidad de `www`/certificados: el subdominio debe quedar asignado al
   proyecto Vercel o su certificado no se renueva.)*
2. **Supabase** — proyecto `matchpointgithub` (ref `piylgplwwwmuqclqsjxt`).
   Actualizar Authentication → URL Configuration: **Site URL** y **Redirect
   URLs** (`{APP_URL}/auth/callback`).
3. **Google OAuth** — Redirect URI en Google Cloud Console.
4. **Email (Resend)** — verificar dominio remitente nuevo y migrar buzones:
   `notif@`, `soporte@`, `soporte-clubes@`, `prensa@`, `hola@`, `ventas@`,
   `privacidad@`, `trabaja@`, `coaches@`. Actualizar `EMAIL_FROM`.
5. **Supabase Auth email templates** — viven en el dashboard, no en el repo.
6. **Redes sociales** — Instagram `@matchpoint.top`.
7. **Entidad legal** — `MATCHPOINT Ecuador (S.A.S.)`, RUC, textos LOPDP en
   `/legal/*` (`src/lib/legal/entity.ts`). Es el motivo del rebrand; requiere
   trámite registral externo.
8. **App stores** — NO aplica: es una PWA, no hay app nativa. Solo cambia el
   `name`/`short_name` de la PWA (Capa 5).

---

## 4. Plan de migración por fases

### Fase 0 — Preparación externa (bloquea todo)
1. Búsqueda de disponibilidad de marca (legal) y elección del nombre.
2. Registrar dominio nuevo + configurar apex/www/tv en Vercel.
3. Verificar remitente de email en Resend.
4. Supabase: Site URL + Redirect URLs. Google Cloud: Redirect URI.

### Fase 1 — Config y env (habilita el resto)
5. Envs en Vercel + `.env.example`: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TV_URL`,
   `EMAIL_FROM`, `MP_LEGAL_NAME`.
6. Reemplazar **todos** los fallbacks hardcodeados de dominio (Capa 3).
   **Críticos:** `src/server/actions/auth.ts:410` y `src/lib/site-url.ts`.
7. `next.config.ts` (redirect www) y `src/proxy.ts` (el regex `^tv\.` sigue
   sirviendo; el host cambia por DNS, el código no necesita cambio salvo
   comentarios).

### Fase 2 — Copy visible + assets (alto impacto de marca)
8. Find/replace de `MATCHPOINT` / `MATCHPOINT+` / `MP+` en la Capa 1.
9. Reemplazar assets (Capa 4) **conservando nombres de archivo**; regenerar
   íconos (`icons:generate`) y OG (`blog:images`).
10. Corregir de paso los dominios stale del OpenAPI (ver §5).

### Fase 3 — Base de datos (migration nueva + backfill)
11. Migration que actualice el perfil de sistema (`display_name`, welcome copy)
    y el copy de notificaciones vivas. Decidir sobre `username 'matchpoint'` y
    `matchpoint@system.local` (cambiar el username toca el índice CI de `109`).
12. Evaluar el CHECK `owner_type ... 'matchpoint'` y el `tierKey
    'matchpoint_plus'`: renombrarlos exige migrar constraint + filas +
    comparaciones **a la vez**. Alternativa de bajo riesgo: dejar el valor
    interno y cambiar solo el label visible.

### Fase 4 — Docs (cosmético, sin prisa)
13. Barrido de `docs/`, `AGENTS.md`, skills `.claude/`.

---

## 5. Hallazgo lateral a resolver durante el rebrand

`public/openapi.json` y `docs/architecture/60-openapi.md` usan dominios que
**no coinciden con producción**: `contact.url: https://matchpoint.app`,
servers `https://staging.matchpoint.dev` y `https://app.matchpoint.dev`,
`title: "MatchPoint API"`. Ya están desalineados hoy (producción es
`matchpoint.top`). El rebrand es la oportunidad para unificarlos al dominio
nuevo.

---

## 6. Qué NO tocar (registro de riesgo)

- Identificadores de código (Capa 2): invisibles al usuario.
- La sigla `MPR` en DB/código: conservar el token.
- Nombres de env var `MP_*` y nombres de archivo de íconos: cambiar
  valor/contenido, no el nombre.
- Migrations ya aplicadas: nunca editar.

---

## 7. Verificación de completitud

Al terminar, el rebrand está completo cuando:

- `rg -i "matchpoint" src/ supabase/migrations/ public/ *.json *.ts` no
  devuelve **copy visible** ni **dominios** viejos (sí puede quedar la Capa 2
  congelada y la sigla `MPR`, que son deliberadas).
- Login con OAuth redirige al dominio nuevo (probar el flujo real).
- Un email transaccional de prueba sale desde el remitente nuevo.
- La PWA instala con el nombre/ícono nuevos (`manifest.ts`).
- El perfil de sistema en `profiles` muestra el nombre nuevo y el welcome DM
  quedó actualizado.
- El spec OpenAPI y los OG images regenerados apuntan al dominio nuevo.
