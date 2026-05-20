# Responsive (mobile-first)

> Convención para escribir UI que funcione en mobile sin pelearse con el
> desktop. Si vas a agregar una sección de landing, un dashboard, o
> cualquier card grid, **leé esto primero**.

## 1. Regla de oro

**Tailwind para layout responsive. Inline styles para design tokens.**

- Layout que **cambia entre breakpoints** (grids, paddings, visibilidad,
  flex direction, fontSize de hero) → clases Tailwind con prefijo `md:`.
- Design tokens **fijos** (gradients, colores específicos, transforms,
  `letterSpacing` custom, `lineHeight` exactos) → inline styles.

Esta es la convención que ya usaba v1 de MATCHPOINT, y la que recuperamos
en v2 después del refactor de mayo 2026.

### Por qué

Inline styles tienen mayor especificidad que clases CSS, así que un
`@media` query NO puede sobrescribir un `style={{padding: "100px 32px"}}`.
Si quieres cambiar layout en mobile, el property tiene que vivir en
className. Punto.

## 2. Breakpoints

Tailwind v4 default. Estos son los que usamos:

| Prefix | min-width | Cuándo |
|---|---|---|
| (none) | 0px | Mobile-first base. Es la versión chica. |
| `sm:` | 640px | Tablets pequeñas en portrait. Casi nunca lo necesitas. |
| `md:` | 768px | **Punto de corte principal**: desktop vs mobile. |
| `lg:` | 1024px | Tweaks para pantallas grandes. Rara vez. |

Regla: si dudas, usa solo `md:`. Mobile (default) y desktop (`md:+`).

## 3. Patrón híbrido: ejemplos canónicos

### Padding de sección

```tsx
// Antes (rompe mobile):
<section style={{ maxWidth: 1280, margin: "0 auto", padding: "100px 32px" }}>

// Después:
<section className="max-w-[1280px] mx-auto px-4 md:px-8 py-15 md:py-25">
```

Equivalencias frecuentes:
- `100px 32px` → `px-4 md:px-8 py-15 md:py-25`
- `60px 32px` → `px-4 md:px-8 py-10 md:py-15`
- `40px 32px` → `px-4 md:px-8 py-6 md:py-10`

### Grid de N columnas

**Para cards que stackean en mobile** (texto largo, prose-like, 2-4 items):

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

**Para card-rows visuales (eventos, clubes) que en mobile deben ser
carrousel horizontal con scroll-snap**: usa `.mp-cards-row` (definida en
`src/app/globals.css`):

```tsx
<div className="mp-cards-row" style={{ "--mp-cols": 4 } as React.CSSProperties}>
  {clubs.map(c => <ClubCard key={c.id} {...c} />)}
</div>
```

- Desktop: grid de N columnas (controlado por `--mp-cols`).
- Mobile: flex horizontal con `scroll-snap-type: x mandatory`, cards al
  82% del viewport, scrollbar oculta, márgenes negativos para llegar al
  borde.

Cuándo usar `.mp-cards-row` vs grid stacked:
- **`.mp-cards-row`**: cards que se ven mejor "deslizadas" — eventos,
  clubes destacados, productos. Cards visuales con imagen.
- **`grid-cols-1 md:grid-cols-N`**: cards de texto, FAQs, testimonios,
  features con descripción larga.

### Sidebar que desaparece en mobile

```tsx
<div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
  <div>{/* contenido principal */}</div>
  <aside className="hidden md:block">{/* sidebar solo en desktop */}</aside>
</div>
```

### Tipografías que se achican

Para hero h1 con `clamp()` ya están bien — `fontSize: "clamp(3.5rem,
9vw, 8.5rem)"` adapta solo. Para fontSizes fijos grandes (>32px), usar
Tailwind responsive:

```tsx
<div className="text-[56px] md:text-[80px]" style={{ ... }}>
```

### Columnas hidden en tablas

Para tablas estilo ranking con muchas cols, dropear las menos críticas:

```tsx
<div className="grid grid-cols-[40px_1fr_70px] md:grid-cols-[50px_1fr_100px_70px_80px]">
  <div>#</div>
  <div>Jugador</div>
  <div className="hidden md:block">Ciudad</div>
  <div className="hidden md:block">Matches</div>
  <div>Nivel</div>
</div>
```

## 4. Red de seguridad

`src/app/globals.css` tiene `body { overflow-x: hidden }`. Esto NO es
para tapar bugs — es para que un marquee animado o un PLAY watermark
con `translate(10%)` no rompan la página. Si tu componente necesita
overflow horizontal, va a tener que vivir dentro de un contenedor con
`overflow: auto` propio.

## 5. Verificación obligatoria

Después de tocar cualquier sección de landing, **siempre verificar en
agent-browser**:

```bash
npx agent-browser set viewport 390 844      # iPhone 14
npx agent-browser open http://localhost:3000/<tu-page>
npx agent-browser screenshot mobile.png

npx agent-browser set viewport 1440 900     # Desktop
npx agent-browser open http://localhost:3000/<tu-page>
npx agent-browser screenshot desktop.png
```

Confirmar:
1. **No hay scrollbar horizontal** en mobile.
   `document.documentElement.scrollWidth === clientWidth` (o muy cerca).
2. **Cards no se cortan** en mobile (deben stackear o ser carrousel).
3. **Desktop NO cambió** vs antes del cambio.

## 6. Cosas que rompen seguido

- **Inline `style={{padding: "100px 32px"}}` para una section** → en
  mobile son 200px verticales perdidos. Convertir a `py-15 md:py-25`.
- **`gridTemplateColumns: "repeat(N, 1fr)"` inline** → fuerza N columnas
  en mobile aunque no entren. Convertir a Tailwind responsive o
  `.mp-cards-row`.
- **`width: 1280px` fija** sin `maxWidth` → desborda mobile. Usar
  `max-w-[1280px]` (que no fuerza min).
- **fontSize gigante para watermark** (200-360px) → en mobile ocupa toda
  la pantalla. Usar `text-[160px] md:text-[360px]`.
- **Form con `gridTemplateColumns: "1fr 1fr"`** → campos quedan
  apretadísimos en mobile. Usar `grid-cols-1 sm:grid-cols-2`.

## 7. Convención v1 que NO seguimos en v2 (intencional)

v1 usaba Tailwind para TODO (incluyendo colores y gradients). v2 mezcla:
Tailwind para layout, inline para tokens visuales. Razón: los gradients
custom (`linear-gradient(180deg, #0a0a0a 0%, #1f1f23 60%, ...)`) son más
legibles inline que como `bg-[linear-gradient(...)]` mostruoso. Tampoco
hay `theme.extend` config porque Tailwind v4 sin JS config — todo va en
`@theme` de globals.css.

Si por alguna razón hay que migrar a 100% Tailwind, hacerlo como tarea
aparte y planificada. NO sustituir inline → className "de a poco" porque
introduces inconsistencia visual sin querer.
