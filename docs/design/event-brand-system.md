# Sistema visual · Portafolio de eventos MATCHPOINT

Guía de aplicación del sistema visual para todos los eventos del
portafolio: circuito paraguas, paradas mensuales, insignia anual, clínicas,
social night y Powered by MATCHPOINT.

Autor: UXDesigner. Iteración: v1 (Phase A — plantillas naming-independent).
Alcance de esta versión: paleta, tipografía, sistema de plantillas
reutilizables y kit por sub-marca **usando placeholders** (`{CIRCUITO}`,
`{INSIGNIA}`, `{COPA CIUDAD MES}`, `{CLINICA}`, `{SOCIAL}`). Cuando el
brand designer entregue naming en [MAT-88](/MAT/issues/MAT-88), los
placeholders se reemplazan sin retrabajo de layout.

---

## 1. Fundamentos

### 1.1 La marca madre no cambia

Todo el portafolio es hijo visual de la marca **MATCHPOINT**. El logo
oficial `●  MATCHPOINT` aparece en TODAS las piezas — nunca oculto, nunca
reemplazado. Referencia canónica: [design-system.md §10](../guides/05-design-system.md).

Regla dura: si un asset del portafolio no lleva el punto verde + wordmark
MATCHPOINT visible al primer vistazo, no es válido. Cada sub-marca es una
extensión, no un reemplazo.

### 1.2 Sub-marcas del portafolio

De [MAT-74 plan v5 §2](/MAT/issues/MAT-74#document-plan):

| Sub-marca | Rol | Tono | Uso principal |
|---|---|---|---|
| **`{CIRCUITO}`** | Marca del circuito paraguas + ranking anual | Profesional, serio | Header de temporada, ranking, comunicación institucional |
| **`{CIRCUITO} — Copa {Ciudad} {Mes}`** | Parada regular mensual | Competitivo, local | Convocatoria mensual, bracket, cronograma, resultados |
| **`{INSIGNIA} Ecuador`** | Insignia anual (cierre temporada 2027) | Premium, prestigio | Flyer flagship, podio, ticket digital, reel resumen |
| **`{CLINICA}`** | Clínicas de nivel/onboarding | Didáctico, accesible | Convocatoria, filtro IG, badge de graduación |
| **`{SOCIAL}`** | Social night mixer | Cálido, casual | Convocatoria, filtro IG, story del evento |
| **Powered by MATCHPOINT** | B2B para clubes aliados | Institucional, doble marca | Torneos co-branded en clubes aliados |

Cada sub-marca **hereda el sistema base** (tipografía, grid, iconografía)
y solo modifica el acento cromático y una micro-etiqueta descriptiva.

---

## 2. Paleta por sub-marca

### 2.1 Núcleo del sistema (invariante)

Estos tokens ya viven en `src/app/globals.css` — no re-declararlos, no
inventar variantes.

| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#10b981` | Verde MATCHPOINT — CTAs, dot del logo, énfasis |
| `--primary-hover` | `#059669` | Hover / gradientes |
| `--primary-active` | `#047857` | AA-compliant sobre blanco — texto verde legible |
| `--fg` | `#0a0a0a` | Texto principal, superficies premium (podio, insignia) |
| `--bg` | `#fafafa` | Fondo por defecto de plantillas web |
| `--card` | `#ffffff` | Fondo cards, tickets, plantillas print |
| `--border` | `#e5e5e5` | Bordes neutros, divisores de bracket |
| `--muted-fg` | `#737373` | Meta-info, timestamps, categorías secundarias |

### 2.2 Acentos por sub-marca

Cada sub-marca recibe **un** color de acento adicional al verde MATCHPOINT.
Nunca dos. La sub-marca se identifica por color + micro-etiqueta, no por
saturación de paleta.

| Sub-marca | Acento | Hex | Rationale |
|---|---|---|---|
| `{CIRCUITO}` (paraguas) | Verde MP `--primary` | `#10b981` | Es el corazón — sin acento adicional. |
| `{CIRCUITO} — Copa {Ciudad} {Mes}` | Verde MP `--primary-active` | `#047857` | Herencia visual directa del circuito. Sobre blanco cumple AA. |
| `{INSIGNIA} Ecuador` | Ámbar `#fbbf24` (ya en design system) | `#fbbf24` | Prestigio — asocia con oro/trofeo. Reservado a insignia + podio 1°. |
| `{CLINICA}` | Azul cielo `#0ea5e9` (ya en design system) | `#0ea5e9` | Aprendizaje, calma, entrada al deporte. |
| `{SOCIAL}` | Púrpura `#7c3aed` (ya en design system) | `#7c3aed` | Nocturno, cálido, retención. |
| Powered by MATCHPOINT | Negro `--fg` + verde MP | `#0a0a0a` | Doble marca — el color del club aliado + wordmark MP en verde. |

**Ningún acento es nuevo.** Todos existen ya en el sistema. Este es un
principio: personalizar por combinación, no por invención. Coste de
implementación: cero. Coste de mantenimiento: cero.

### 2.3 Contraste AA (obligatorio)

Antes de aplicar cualquier acento a texto:

- Sobre `#fafafa` o `#ffffff`: usar `--primary-active #047857` (no
  `--primary #10b981` — no cumple AA para texto <18px).
- Sobre `#0a0a0a`: usar `--primary #10b981`.
- Ámbar `#fbbf24` sobre blanco: **solo para números grandes ≥24px** o
  iconos. No para body copy.
- Azul cielo `#0ea5e9` sobre blanco: solo ≥18px o AA-large.
- Púrpura `#7c3aed` sobre blanco: pasa AA normal — se puede usar en body
  si es necesario.

Regla operativa: cuando dudes, usar `--fg #0a0a0a` para el texto y reservar
el acento cromático a chips, iconos, dividers o backgrounds.

---

## 3. Tipografía

### 3.1 Escala

Copiada del sistema web (`--font-heading`, `--font-sans`). No traer una
tercera familia por evento.

| Rol | Familia | Peso | Tracking | Caso |
|---|---|---|---|---|
| Wordmark de evento | Plus Jakarta Sans | 900 | -0.02em | Título de la sub-marca en flyer/story |
| Título de sección | Plus Jakarta Sans | 800 | -0.01em | "CRONOGRAMA", "BRACKET", "PODIO" |
| Categoría / chip | Inter | 800 | 0.04em | UPPERCASE, tracking abierto |
| Nombres de jugador | Inter | 700 | -0.01em | En bracket, resultado, podio |
| Body / meta | Inter | 500 | 0 | Cronograma, notas |
| Números grandes (MPR, score, minuto) | Plus Jakarta Sans | 900 | -0.03em | Tabular, alineación derecha |

### 3.2 El dot verde

El "dot" (`●` en verde `--primary`) es la firma tipográfica de MATCHPOINT.
Aparece al menos una vez en cada pieza y **siempre acompaña al wordmark
MATCHPOINT en la firma inferior**. No lo omitir "porque no cabe" — reducí
otra cosa antes.

### 3.3 Placeholders

Mientras el naming de MAT-88 no aterrice, todas las plantillas muestran
placeholders explícitos con corchetes:

- `{CIRCUITO}` — reemplazará al nombre del circuito paraguas
- `{INSIGNIA}` — reemplazará al nombre del evento insignia anual
- `{CIUDAD}` — Quito, Guayaquil, Cuenca, etc.
- `{MES}` — Septiembre, Octubre, etc.
- `{CLINICA}` / `{SOCIAL}` — sub-marca comunidad

Los corchetes SON visibles en Phase A — señalan explícitamente que el nombre
está pendiente. Esto elimina el riesgo de que un placeholder se cuele a
producción sin ser sustituido.

---

## 4. Grid y sizing por formato

Cada plantilla existe en al menos 2 formatos: **web** (rendering en la
app) + **social** (export para Instagram). Algunas suman print A4 (ticket,
flyer).

### 4.1 Web (rendering en la app)

Grid 12 col, gutter 24px, max-width 1200px. Card interior `border-radius:
14.4px`. Coincide 1:1 con el sistema del dashboard.

### 4.2 Instagram

| Formato | Tamaño | Uso |
|---|---|---|
| Square post | 1080 × 1080 | Convocatoria, resultados, podio |
| Story / Reel | 1080 × 1920 | Story del evento, filtro, resumen |
| Story cropsafe area | 1080 × 1420 centrado vertical (Y ∈ 250-1670) | Zona sin recorte de UI de IG |

**Regla dura**: nada crítico (nombre del evento, fecha, wordmark) fuera
del cropsafe de story. En Phase A las plantillas de story ya reservan
esta zona.

### 4.3 Print (A4)

Ticket digital: **A6** (105 × 148 mm) — cabe en pantalla móvil sin scroll
y se imprime en papel si el jugador quiere. Flyer convocatoria: **A4**
(210 × 297 mm), margen interior 15 mm.

---

## 5. Iconografía

Set: `lucide-react` — el mismo que usa el dashboard (ver `docs/guides/05-design-system.md §8`).

Iconos canónicos por plantilla:

| Icono | Nombre lucide | Uso en plantillas |
|---|---|---|
| Trofeo | `trophy` | Podio 1°, título de premio |
| Calendario | `calendar` | Cronograma, fechas |
| Reloj | `clock` | Horas del cronograma |
| Ubicación | `map-pin` | Sede, ciudad |
| Escudo | `shield` | Categoría, nivel MPR |
| Bandera | `flag` | Ronda, fase del bracket |
| Estrella | `star` | Estelar / destacado |
| Corona | `crown` | Insignia anual, premium |
| Usuarios | `users` | Modalidad dobles, equipos |
| Dólar | `dollar-sign` | Cuota, premio pool |

Tamaños estándar: 16 / 20 / 24 / 32 / 48 px. Peso `strokeWidth: 2`. Nunca
iconos rellenos — el sistema es outline.

**No usar emojis** ni siquiera 🏆 / 🎾 / 🏅. La consistencia visual entre
web y export social depende de vector, no emoji.

---

## 6. Plantillas reutilizables (índice)

Cada plantilla vive como SVG en `docs/design/event-templates/`. El SVG es
la fuente de verdad para: (a) render en la app usando el mismo layout,
(b) export a PNG/PDF para social/print, (c) handoff a brand designer para
llevarlo a Figma si desea.

### 6.1 Phase A — SIN dependencia de naming (esta iteración)

| # | Plantilla | Formatos | Archivo | Status |
|---|---|---|---|---|
| 1 | Bracket single-elim 8 seeds | Web + IG-square 1080×1080 | `event-templates/bracket.svg` | ✅ v1 |
| 2 | Cronograma del día | Web + IG-story 1080×1920 | `event-templates/cronograma.svg` | ✅ v1 |
| 3 | Resultado por partido | IG-square 1080×1080 | `event-templates/resultado-partido.svg` | ✅ v1 |
| 4 | Podio 1°/2°/3° | IG-square 1080×1080 | `event-templates/podio.svg` | ✅ v1 |

Estas cuatro **no necesitan el nombre final** para funcionar — el layout
sostiene cualquier string en el título. El placeholder `{CIRCUITO} — Copa
{Ciudad} {Mes}` prueba el sizing con la cadena más larga esperada.

### 6.2 Phase B — DEPENDE de naming (bloqueado por MAT-88)

| # | Plantilla | Formatos | Blocker |
|---|---|---|---|
| 5 | Flyer convocatoria | A4 print + IG-square | Nombre del circuito, insignia |
| 6 | Ticket digital de inscripción | A6 print + móvil | Nombre del evento en el ticket |
| 7 | Filtro / Story de IG | IG-story 1080×1920 | Wordmark del evento |
| 8 | Reel de resumen (frames base) | IG-story 1080×1920 loop | Wordmark + tagline |

Estas cuatro se producen en el momento que MAT-88 aterrice el naming.
Delegadas al hijo issue (ver comentario del ticket).

---

## 7. Do's & Don'ts

### 7.1 Do

- **Reutilizar tokens del design system.** Si necesitás un color nuevo,
  primero preguntá si no cabe con los que ya hay.
- **Firmar toda pieza** con `●  MATCHPOINT` abajo, tamaño mínimo 32px de
  altura en formato IG.
- **Mostrar el logo del club aliado** cuando la pieza es "Powered by
  MATCHPOINT" — el nombre del club es tan grande como el wordmark MP.
- **Usar números tabulares** para scores y horarios. `font-variant-numeric:
  tabular-nums`.
- **Testear en gris** — desaturá el arte antes de exportar. Si sin color
  no se lee la jerarquía, algo está mal.
- **Dejar respirar la esquina inferior derecha** — es donde va el CTA
  ("Inscríbete en matchpoint.top") o el @handle.

### 7.2 Don't

- **No inventar colores.** Si un stakeholder pide "morado más brillante",
  primero mostrar el `#7c3aed` en contexto.
- **No usar la fuente en cursiva.** Plus Jakarta e Inter tienen italics
  pero el sistema es siempre roman.
- **No usar drop-shadow decorativo.** Sombra solo funcional (elevar cards).
- **No poner el CTA lejos del wordmark.** Los ojos buscan primero la marca;
  el CTA vive al lado, no separado.
- **No emojis decorativos** (regla del design system §9.5).
- **No poner texto sobre foto** sin capa negra semi-transparente al 45%
  como mínimo. El texto siempre debe pasar AA sobre lo que tenga debajo.
- **No comprimir el logo horizontalmente.** El wordmark tiene tracking
  `-0.02em` y peso 900 — si no cabe, achicá tamaño, no ancho.

---

## 8. Declinaciones por ciudad / mes (paradas)

La `Copa {Ciudad} {Mes}` es la pieza más recurrente (10 al año, plan
2026-2027). Debe declinarse fácil.

Regla operativa:

1. **Ciudad** → chip inferior derecho con nombre y bandera de Ecuador
   (opcional). No es el foco; el foco es el circuito.
2. **Mes** → chip inferior izquierdo, en Inter 800 uppercase, tracking
   0.06em. Contrasta contra el fondo.
3. **Sede** → línea de meta bajo el título, con icono `map-pin` y nombre
   del club. Si el club es aliado ("Powered by"), incluir logo pequeño.
4. **Foto o gráfica de fondo** → opcional. Si se usa, capa negra 45%
   encima. Preferir gráfica geométrica sobre foto para escalar el
   pipeline sin foto profesional cada mes.

Todo lo demás **no cambia** entre Copa Quito Septiembre y Copa Guayaquil
Diciembre. Un editor cambia 2 strings y una foto, y publica.

---

## 9. Coordinación con brand designer

MAT-88 (BrandDesigner) entrega:

- Nombre real de `{CIRCUITO}`, `{INSIGNIA}`, `{CLINICA}`, `{SOCIAL}`
- Convención de string para `Copa {Ciudad} {Mes}`
- Brief visual (identidad base sub-marca) — puede incluir wordmark
  custom, iconos accesorios, tratamiento tipográfico específico

Cuando llegue:

1. Reemplazar placeholders en todos los SVGs (`sed` global).
2. Revisar sizing — si el nombre real es mucho más largo/corto que el
   placeholder, ajustar `font-size` del título, no el layout.
3. Producir Phase B (flyer, ticket, story, reel).
4. Publicar guía de aplicación PDF finalizada.
5. Handoff a brand designer para que suba el kit final a Figma si
   requiere edición de partners externos.

Este documento y los SVGs son **la fuente de verdad de layout**. El brand
designer decide identidad (wordmark, ilustración) — UX decide layout,
grilla, jerarquía, accesibilidad.

---

## 10. Deliverables status

- ✅ Sistema visual base + guía de aplicación (este doc)
- ✅ 4 plantillas Phase A (bracket, cronograma, resultado, podio)
- 🔒 4 plantillas Phase B → child issue con blocker en MAT-88
- 🔒 Naming placeholder replacement → depende de MAT-88 v1 aceptada por CEO
- 🔒 PDF final de guía → después de Phase B (embebe todos los layouts)
- 🔒 Handoff Figma → opcional, si brand designer necesita editabilidad
  externa. Los SVGs se importan directo.

Timeline al deadline (piloto parada #1, septiembre 2026):

- Julio 2026: Phase A ✅ (este ticket).
- Agosto 2026: naming aterriza (MAT-88), reemplazo de placeholders,
  Phase B producida.
- Septiembre 2026: kit finalizado, PDF publicado, piloto Copa Quito con
  todos los assets listos.
