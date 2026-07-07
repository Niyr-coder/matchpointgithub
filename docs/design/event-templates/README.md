# Plantillas del portafolio de eventos MATCHPOINT

Cada plantilla es un SVG único que sirve tres propósitos a la vez:

1. **Fuente de layout** para render en la app (bracket, cronograma,
   resultados, podio se muestran en `/eventos/[slug]` y en el panel
   partner).
2. **Export a PNG/JPG** para publicar en Instagram/WhatsApp.
3. **Handoff al brand designer** — puede importar el SVG a Figma para
   editar identidad sin rehacer layout.

Guía madre: [`../event-brand-system.md`](../event-brand-system.md).

Sizing y decisiones de layout: ver §4 y §5 de la guía madre.

## Índice

| Plantilla | Archivo | Formato base | Estado |
|---|---|---|---|
| Bracket single-elim 8 seeds | [`bracket.svg`](./bracket.svg) | 1080 × 1080 | ✅ Phase A v1 |
| Cronograma del día | [`cronograma.svg`](./cronograma.svg) | 1080 × 1920 | ✅ Phase A v1 |
| Resultado por partido | [`resultado-partido.svg`](./resultado-partido.svg) | 1080 × 1080 | ✅ Phase A v1 |
| Podio 1° / 2° / 3° | [`podio.svg`](./podio.svg) | 1080 × 1080 | ✅ Phase A v1 |
| Flyer convocatoria | [`flyer.svg`](./flyer.svg) | 1080 × 1080 (escala a A4) | ✅ Phase B v1 |
| Ticket digital de inscripción | [`ticket.svg`](./ticket.svg) | 620 × 940 (A6 vertical) | ✅ Phase B v1 |
| Filtro / Story IG | [`story-ig.svg`](./story-ig.svg) | 1080 × 1920 | ✅ Phase B v1 |
| Reel resumen (frames base) | [`reel-frames.svg`](./reel-frames.svg) | 3 × (1080 × 1920) | ✅ Phase B v1 |

## Naming aplicado

Naming decidido por Vicente en [MAT-88](/MAT/issues/MAT-88):

| Placeholder original | Nombre final aplicado |
|---|---|
| `{CIRCUITO}` | **Pro Series** (umbrella MatchPoint Pro Series) |
| Parada regular | **Pro Series [Ciudad]** — reemplaza a la convención `Copa {Ciudad}` de Phase A |
| `{INSIGNIA}` | **Nationals** (MatchPoint Nationals — flagship anual) |
| `{CLINICA}` | **Academy** (MatchPoint Academy) |
| `{SOCIAL}` | **Nights** (MatchPoint Nights) |
| Ranking anual | **MATCHPOINT Ranking** |

Los SVGs en Phase A ya no llevan placeholders con corchetes: los strings
literales fueron sustituidos in-place (ejemplo pobla la parada Quito ·
Septiembre 2026). Para declinar a otra parada:

```bash
sed -i 's/Pro Series Quito/Pro Series Guayaquil/g' *.svg
sed -i 's/QUITO/GUAYAQUIL/g' *.svg
sed -i 's/Septiembre/Octubre/g' *.svg
sed -i 's/SEPTIEMBRE/OCTUBRE/g' *.svg
sed -i 's/Sábado 12/Sábado 17/g' *.svg
```

Si la nueva ciudad tiene un nombre significativamente más largo (p. ej.
Santo Domingo, Riobamba), revisar visualmente que el título quepa en:

- `flyer.svg` — heading 112pt debe caber en 960px de ancho útil.
- `story-ig.svg` — heading 120pt debe caber en 920px de ancho útil.
- `podio.svg`, `cronograma.svg` — heading 60–72pt en 920px.

Cuando no quepa, reducir el `font-size` del título — no cambiar el
layout. La regla dura de la guía madre §9.

## Convenciones de este set

- Todos los SVG usan `viewBox` con proporción exacta al formato final.
- Fuentes referenciadas: `Plus Jakarta Sans` (heading) e `Inter` (body).
  Ambas están cargadas en la app; para export offline, el brand designer
  debe embeberlas o convertir a paths al exportar PNG.
- Todos los colores son literales — no hay `var()` porque los SVG deben
  renderizar fuera del contexto de la app. Los hex usados coinciden 1:1
  con los tokens de `src/app/globals.css`.
- Nada crítico está fuera de la zona cropsafe en formato story
  (Y 250-1670 en 1080×1920).
- El wordmark `● MATCHPOINT` aparece en todas las piezas — la sub-marca
  (Pro Series, Nationals, Academy, Nights) es una extensión que nunca
  reemplaza a la madre.

## Sub-marca por acento cromático

Los SVGs actuales están poblados con la sub-marca **Pro Series** (verde
MP `#10b981`). Para declinar visual a otra sub-marca, cambiar el hex de
acento sobre los mismos layouts:

| Sub-marca | Acento primario | Uso |
|---|---|---|
| Pro Series (parada) | `#10b981` verde MP | por defecto en los SVGs base |
| Nationals (insignia anual) | `#fbbf24` ámbar | flyer/story/reel/podio del flagship |
| Academy (clínicas) | `#0ea5e9` azul cielo | flyer + story de clínica |
| Nights (social) | `#7c3aed` púrpura | flyer + story + reel de noche social |

Los sustituciones son un `sed` global sobre los hex del SVG base — no
requieren rehacer layout.
