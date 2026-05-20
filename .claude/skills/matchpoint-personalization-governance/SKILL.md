---
name: matchpoint-personalization-governance
description: Checklist de gobernanza del sistema de personalización de MatchPoint v2 (temas de perfil, packs/bundles cosméticos, y QUÉ superficies son personalizables). Úsala cuando agregues o cambies algo de personalización para pensar holísticamente qué más debería existir/cablearse — no "cómo crear un tema" (eso es matchpoint-theme-create) sino "¿el sistema queda completo, gobernado y consistente?". Garantiza que (1) todo cosmético pago quede gateado por MP+ (isPremium + grant) con default free y banner de upsell, (2) cada superficie personalizable resuelva el tema en TODOS lados donde aparece, (3) el catálogo tenga path admin (listar/grant/activar) y no quede "ingobernado", (4) rareza/intensidad/contraste/IP respeten el estándar. Complementa matchpoint-theme-create (cómo construir uno) y matchpoint-role-governance (gobernanza de roles).
---

# MatchPoint Personalization Governance

La personalización (temas de perfil, packs/bundles cosméticos, elementos
customizables) toca muchas superficies y está atada a **MATCHPOINT+**. Cuando
agregás o cambiás algo acá, es fácil dejar el sistema incompleto: un cosmético
sin gating, una superficie que no aplica el tema, un catálogo sin forma de que
admin lo gestione. Esta skill recorre esas dimensiones para que el sistema quede
**completo, gobernado y consistente**.

> `matchpoint-theme-create` = cómo construir UN tema/bundle bien (estructura,
> rareza, contraste, sin boxShadow, sin IP literal). **Esta skill** = gobernanza:
> ¿qué más debería existir y estar cableado? Antes de proponer fixes, releé el
> estándar de temas (vía `matchpoint-theme-create`) y el contrato de premium
> (`docs/product/00-matchpoint-plus.md`, vía `matchpoint-docs-guide`).

## Regla 0 — Todo cosmético pago, gateado por MP+

Personalización (más allá de los defaults free) es feature de **MATCHPOINT+**.
Para CUALQUIER cosa personalizable que agregues:

- [ ] **Default free** existe (nadie sin MP+ queda sin un estado usable/neutro).
- [ ] **Gating server + cliente**: `canUsePreset` corta por `isPremium` primero,
  luego mp_plus→true, packs→requieren grant. No confiar solo en la UI.
- [ ] **Banner / upsell** cuando el usuario free toca algo bloqueado (no un
  silencio ni un error genérico) → CTA a `/dashboard/user/mi-plan`.
- [ ] Si el cosmético es de un **pack pago**: grant manual admin (sin PSP/payout,
  ver `docs/product/00-matchpoint-plus.md` y memoria de pagos sin Stripe).

> ⚠️ Dependencia abierta: MP+ todavía no tiene banner/plan cerrados para cada
> feature. Si lo que agregás necesita upsell y aún no existe el patrón, **regístralo
> como gap** (no lo dejes sin gating "porque todavía no hay banner").

## Checklist A — Superficie personalizable nueva

Cuando hacés que un elemento NUEVO sea personalizable (un botón, una card, un
banner, un badge), recorré TODAS las superficies donde ese elemento aparece:

- [ ] Perfil propio (`ProfileScreen`) y perfil público (`/players/[username]`).
- [ ] Ranking, roster del team, lista de amigos, tarjeta de compartir.
- [ ] Cualquier widget del home que renderice al usuario.
- [ ] El **preview** del panel de personalización refleja el cambio fielmente.

Síntoma de gap: el tema se ve en el perfil pero no en el roster/ranking, o el
preview no coincide con el render real.

## Checklist B — Catálogo (temas / packs / bundles)

- [ ] **Fuente de verdad** en código (`PROFILE_THEMES` autocontenido) + seed de
  bundle en DB si es pago.
- [ ] **Rareza** asignada y el panel ordena por rareza (escalera de intensidad
  del card coherente).
- [ ] **Contraste** de CTAs/texto sobre el tema (readableTextOn / WCAG) — y la
  regla de **NUNCA boxShadow** (sombra = default del sistema, no del tema).
- [ ] **Temática inspirada sin IP literal** (Brasa/Viñeta/Vapor, no marcas
  registradas).
- [ ] ¿El catálogo tiene **huecos**? (¿solo rarezas altas y ninguna accesible?
  ¿ningún tema estacional/evento? ¿free se siente pobre a propósito o por olvido?)

## Checklist C — Path admin (no dejar el catálogo "ingobernado")

Igual que en `matchpoint-role-governance` Regla 0: si tiene estado dinámico
(grants, activar/desactivar, precio de pack), necesita pantalla admin.

- [ ] `AdminCosmeticsScreen` lista temas/bundles, permite **grant/revoke** y
  **activar/desactivar**.
- [ ] Grant de pack = action admin con `setAuditActor(admin, callerId, "admin")`.
- [ ] Precio de pack/feature en `platform_config` o tabla, **no hardcodeado**.

## Checklist D — Cross-surface render (resolución de keys)

- [ ] Cada superficie resuelve las MISMAS keys del tema (accent, banner, card
  style) con el mismo helper. Si agregás una key nueva al tema, TODAS las
  superficies que la consumen la manejan (sin fallback roto).
- [ ] Cambiar de tema propaga sin recargar donde aplica (o `router.refresh`).

## Cómo pensar "qué más podríamos agregar" (el objetivo de la skill)

Cuando el user dice "agreguemos más temas/personalización", antes de listar
ideas sueltas, recorré el espacio:

1. **Ejes personalizables** ya existentes (accent, banner gradient, card style) →
   ¿hay un eje nuevo coherente (tipografía, marco de avatar, efecto de entrada)?
2. **Tiers**: ¿free vs MP+ vs packs pagos están balanceados? ¿falta un tier?
3. **Ocasión**: estacionales, logros (desbloqueables por jugar), colaboraciones.
4. **Superficies aún no personalizables** que tendría sentido abrir.
5. Para cada idea: ¿gating MP+? ¿path admin? ¿cross-surface? ¿contraste/IP?

Output: ideas **ya filtradas** por gobernanza (no proponer algo que rompa el
gating o deje una superficie sin cablear).

## Cuándo NO usar esta skill

- Crear/ajustar UN tema concreto → `matchpoint-theme-create`.
- Cambio visual trivial sin tocar el sistema de personalización.

## Se conecta con

- `matchpoint-theme-create` — el "cómo" de construir un tema/bundle.
- `matchpoint-feature-plan` — plan amplio si la personalización es una feature
  con backend nuevo.
- `matchpoint-role-governance` — gobernanza de roles (mismo espíritu, otra
  dimensión).
- `docs/product/00-matchpoint-plus.md` — contrato premium (gating, grant manual).
