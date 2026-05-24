# 90 · URL canónica de producción y prevención de drift

> Fuente de verdad operativa. Toda referencia pública (marketing, prensa, redes, QA, auditorías) usa la URL canónica de este documento. No hay otros dominios bajo control de Matchpoint en producción.

---

## 1. URL canónica

- **Producción canónica:** `https://matchpointgithub.vercel.app`
- **Repo fuente:** `Niyr-coder/matchpointgithub` (branch `main` → auto-deploy en Vercel).
- **Build verification:** el AuthModal del repo (`src/components/auth/AuthModal.tsx`) se monta sobre el landing. `/login` redirige a `/?auth=signin`. Auth híbrido email/password con Google/Apple `[disabled]` "Próximamente".

## 2. Dominios que NO son nuestros (pero comparten brand)

- **`matchpoint.top` y `www.matchpoint.top` NO son propiedad de Matchpoint.** Sirven una build third-party (standalone Google-only, MD5 `6daca004…`) desde un proyecto Vercel ajeno (CNAME `d470d5183a898288.vercel-dns-017.com`). Confirmado por CEO el 2026-05-24: el dominio se adquirirá en el futuro; hasta entonces, no es nuestro.
- **No auditar, no enlazar, no asumir control.** Cualquier hallazgo sobre `*.matchpoint.top` es sobre un sitio third-party que comparte el nombre, no sobre el producto Matchpoint.

## 3. Anti-drift: reglas duras

1. **Una sola URL canónica:** `matchpointgithub.vercel.app`. Marketing, blog, redes, prensa, decks, QA y auditorías la usan exclusivamente.
2. **Auditorías UX/QA se ejecutan contra la canónica.** Si una auditoría encuentra `matchpoint.top` (o cualquier otro host que comparta brand), debe marcarlo como **target inválido** y consultar antes de seguir. Esto evita repetir el patrón de [MAT-45](/MAT/issues/MAT-45) (auditoría falsa contra el squatter).
3. **Health check periódico:** confirmar que `matchpointgithub.vercel.app` deploya desde `main` y que su MD5 de root coincide con el último deploy reportado por Vercel.
4. **Cualquier dominio nuevo que se adquiera y apunte al producto** debe agregarse a este documento y al proyecto Vercel canónico antes de promoverse externamente.

## 4. Si en el futuro adquirimos `matchpoint.top`

El runbook técnico para mover los dominios al proyecto canónico ya está escrito y vive en el documento `runbook` de [MAT-59](/MAT/issues/MAT-59#document-runbook). Reusarlo en vez de redactarlo de cero.

## 5. Historial de incidentes

- **2026-05-24 ([MAT-55](/MAT/issues/MAT-55) / [MAT-59](/MAT/issues/MAT-59)):** detectado drift aparente entre `www.matchpoint.top` (build standalone Google-only, MD5 `6daca004…`) y canónica `matchpointgithub.vercel.app` (AuthModal híbrido, MD5 `f0c2f94f…`). Causó auditoría falsa [MAT-45](/MAT/issues/MAT-45) y 3 hijos cancelados ([MAT-46](/MAT/issues/MAT-46), [MAT-49](/MAT/issues/MAT-49), [MAT-51](/MAT/issues/MAT-51)). Resolución: confirmado que `matchpoint.top` es third-party (no nuestro), no hay drift que corregir — sólo doc + regla anti-auditoría falsa.
