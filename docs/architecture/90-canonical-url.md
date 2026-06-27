# 90 · URL canónica de producción y prevención de drift

> Fuente de verdad operativa. Toda referencia pública (marketing, prensa, redes, QA, auditorías) usa la URL canónica de este documento.

---

## 1. URL canónica

- **Producción canónica:** `https://matchpoint.top`
- **Alias Vercel (secundario):** `https://matchpointgithub.vercel.app` — sigue activo como alias del mismo deploy; no se promueve externamente.
- **Repo fuente:** `polacofran1-svg/matchpointgithub` (branch `main` → auto-deploy en Vercel).
- **Build verification:** el AuthModal del repo (`src/components/auth/AuthModal.tsx`) se monta sobre el landing. `/login` redirige a `/?auth=signin`. Auth híbrido: **Google OAuth** + email/password.

## 2. Configuración de entorno requerida

| Variable | Valor producción | Notas |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://matchpoint.top` | Seteada en Vercel → Settings → Environment Variables |
| Supabase Site URL | `https://matchpoint.top` | Authentication → URL Configuration |
| Google OAuth redirect URI | `https://matchpoint.top/auth/callback` | Google Cloud Console → Credentials |

> Si `NEXT_PUBLIC_APP_URL` no está seteada, el fallback en código es `https://matchpoint.top` (ver `src/lib/site-url.ts`).

## 3. Anti-drift: reglas duras

1. **Una sola URL canónica:** `matchpoint.top`. Marketing, blog, redes, prensa, decks, QA y auditorías la usan exclusivamente.
2. **`matchpointgithub.vercel.app` es alias interno.** No se promueve ni enlaza externamente — sirve como fallback de Vercel y para staging interno.
3. **Health check periódico:** confirmar que `matchpoint.top` deploya desde `main`.
4. **Cualquier dominio adicional** que se configure en el proyecto Vercel debe documentarse aquí antes de promoverse.

## 4. Historial de cambios de dominio

- **2026-05-24 ([MAT-55](/MAT/issues/MAT-55) / [MAT-59](/MAT/issues/MAT-59)):** detectado que `matchpoint.top` pertenecía a un tercero. Canonical era `matchpointgithub.vercel.app`.
- **2026-06-27:** dominio `matchpoint.top` adquirido y configurado en Vercel. Canónica migrada. Código actualizado (fallbacks en `site-url.ts`, `auth.ts`, `TournamentVenueDisplayPanel.tsx`).
