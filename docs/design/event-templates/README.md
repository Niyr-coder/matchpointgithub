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
| Flyer convocatoria | (Phase B) | A4 + 1080 × 1080 | 🔒 Blocked on [MAT-88](/MAT/issues/MAT-88) |
| Ticket digital | (Phase B) | A6 print + móvil | 🔒 Blocked on [MAT-88](/MAT/issues/MAT-88) |
| Filtro / Story IG | (Phase B) | 1080 × 1920 | 🔒 Blocked on [MAT-88](/MAT/issues/MAT-88) |
| Reel resumen (frames base) | (Phase B) | 1080 × 1920 | 🔒 Blocked on [MAT-88](/MAT/issues/MAT-88) |

## Placeholder replacement

Cuando MAT-88 aterrice el naming, un `sed` global reemplaza en todos los
SVGs:

```bash
# Ejemplo: naming ficticio (los reales llegan de BrandDesigner)
sed -i 's/{CIRCUITO}/Andes Open Series/g' *.svg
sed -i 's/{INSIGNIA}/Andes Champions Ecuador/g' *.svg
sed -i 's/{CIUDAD}/Quito/g' *.svg
sed -i 's/{MES}/Septiembre/g' *.svg
```

Después de reemplazar, revisar visualmente que el nuevo string cabe. Si
la cadena real es mucho más larga, ajustar `font-size` del título en el
SVG afectado — nunca modificar el layout general.

## Convenciones de este set

- Todos los SVG usan `viewBox` con proporción exacta al formato final.
- Fuentes referenciadas: `Plus Jakarta Sans` (heading) e `Inter` (body).
  Ambas están cargadas en la app; para export offline, el brand designer
  debe embeberlas o convertir a paths al exportar PNG.
- Todos los colores son literales — no hay `var()` porque los SVG deben
  renderizar fuera del contexto de la app. Los hex usados coinciden 1:1
  con los tokens de `src/app/globals.css`.
- Nada crítico está fuera de la zona cropsafe en formato story.
