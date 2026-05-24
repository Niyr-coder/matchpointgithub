# 90 · URL canónica de producción y prevención de drift

> Fuente de verdad operativa. Toda referencia pública (marketing, prensa, redes, QA, auditorías) usa la URL canónica de este documento. Cualquier dominio adicional debe apuntar al mismo deploy o redirect 301 a la canónica.

---

## 1. URL canónica

- **Producción canónica:** `https://matchpointgithub.vercel.app`
- **Repo fuente:** `Niyr-coder/matchpointgithub` (branch `main` → auto-deploy en Vercel).
- **Build verification:** el AuthModal del repo (`src/components/auth/AuthModal.tsx`) se monta sobre el landing. `/login` redirige a `/?auth=signin`. Auth híbrido email/password con Google/Apple `[disabled]` "Próximamente".

## 2. Dominios secundarios

| Dominio | Estado deseado | Comportamiento esperado |
|---|---|---|
| `www.matchpoint.top` | Aliased a canónica O 301 → canónica | Mismo HTML que canónica o redirect 301 al path equivalente |
| `matchpoint.top` (apex) | Aliased a canónica O 301 → canónica | Idem |

Cualquier otro dominio que aparezca sirviendo HTML distinto del canónico es **drift** y debe ser retirado o realineado (ver §4).

## 3. Anti-drift: reglas duras

1. **Un solo proyecto Vercel activo para producción.** No mantener proyectos Vercel paralelos con dominios productivos.
2. **Toda URL pública (marketing, blog posts, redes, prensa, decks) usa la canónica** o un dominio aliased a la canónica.
3. **Auditorías UX/QA deben ejecutarse contra la canónica.** Si una auditoría descubre un dominio sirviendo build distinto del repo, abrir issue `infra` antes de auditar.
4. **Health check periódico:** comparar MD5 del HTML servido por cada dominio público vs canónica. Drift > 0 byte = alerta.

## 4. Procedimiento ante drift detectado

1. Confirmar fingerprint: `curl -s https://<dominio>/ | md5sum` vs canónica.
2. Identificar proyecto Vercel que sirve el dominio: CNAME hash del dominio (`vercel-dns-XXX.com`) es el fingerprint del proyecto.
3. Decidir: A) mover dominio al proyecto canónico, o B) 301 al canónico mientras se planifica A.
4. Eliminar el proyecto Vercel huérfano una vez confirmado que ningún tráfico productivo lo necesita.
5. Actualizar este documento si la lista de dominios cambia.

## 5. Historial de incidentes

- **2026-05-24 ([MAT-55](/MAT/issues/MAT-55) / [MAT-59](/MAT/issues/MAT-59)):** detectado drift entre `www.matchpoint.top` (build standalone Google-only, MD5 `6daca004…`) y canónica `matchpointgithub.vercel.app` (AuthModal híbrido, MD5 `f0c2f94f…`). Causó auditoría falsa [MAT-45](/MAT/issues/MAT-45) y 3 hijos cancelados ([MAT-46](/MAT/issues/MAT-46), [MAT-49](/MAT/issues/MAT-49), [MAT-51](/MAT/issues/MAT-51)). Resuelto en [MAT-59](/MAT/issues/MAT-59).
