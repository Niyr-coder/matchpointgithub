// Catálogo estático de posts del blog MATCHPOINT.
// Reemplazar por CMS o tabla blog_posts cuando crezca.

export type BlogCategory =
  | "Comunidad"
  | "Guías"
  | "Producto"
  | "Clubes"
  | "Coaches"
  | "Coaching";

export type BlogAuthor = {
  name: string;
  avatarUrl?: string;
};

export type BlogPostCta = {
  label: string;
  href: string;
};

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  author: BlogAuthor;
  publishedAt: string;
  readMinutes: number;
  category: BlogCategory;
  body: string;
  coverImage?: string;
  coverAlt?: string;
  ctaContext?: BlogPostCta;
  relatedSlugs?: string[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "como-armar-un-doble-mixto-sin-pelear",
    title: "Cómo armar un doble mixto sin terminar peleados",
    excerpt:
      "Las 4 reglas no escritas que separan a un doble mixto que se vuelve costumbre de uno que termina con el grupo dividido por WhatsApp.",
    author: { name: "Andrés Vega" },
    publishedAt: "2026-05-10",
    readMinutes: 6,
    category: "Comunidad",
    coverImage: "/blog/como-armar-un-doble-mixto-sin-pelear.jpg",
    coverAlt:
      "Cuatro paletas de pickleball apoyadas sobre la red de una cancha al atardecer",
    ctaContext: {
      label: "Encontrá juegos abiertos cerca tuyo",
      href: "/eventos",
    },
    relatedSlugs: [
      "5-clubes-para-jugar-pickleball-en-quito",
      "como-leer-tu-ranking-mejorar-rapido",
    ],
    body: `El doble mixto es el formato más popular del pickleball en Ecuador y también el que más conflictos genera. Si has jugado más de tres veces, ya sabes a qué me refiero: alguien tira un drop perfecto, su pareja no llega a la red, miradita, silencio, y al siguiente fin de semana ese partido no se vuelve a armar.

Después de 200+ partidos mixtos en Quito y Cumbayá, identifiqué 4 reglas no escritas que separan a los grupos que duran de los que se rompen.

## 1. Equilibren niveles, no géneros

Un 4.5 con una 3.0 vs un 4.0 con una 4.0 no es "parejo"; es una receta para que la 3.0 se sienta presionada toda la tarde. Antes de armar, miren los rankings combinados:

- Sumá los DUPR (o el ranking que usen) de ambos lados.
- Aceptá una diferencia máxima de 0.4 puntos por equipo.
- Si no llegan, mezclen distinto — un mixto fuera de balance vale menos que un single bien parejo.

## 2. Definan reglas de comunicación antes del primer punto

¿Quién pide los del medio? ¿Se piden o se llaman? Decirlo antes evita choques en el momento. Una convención que funciona:

1. La derecha pide los del medio cuando el rival va a la izquierda.
2. La izquierda pide los del medio cuando el rival va a la derecha.
3. "¡Mío!" se grita siempre, también para confirmar dejes y lobos.

## 3. Roten cada 4 juegos

Si jugaron 11 puntos × 4 juegos y nadie cambió de pareja, el grupo se enfría. La rotación obliga a conocer estilos distintos y baja la presión sobre quien está jugando peor en ese rato.

> Cuatro juegos es suficiente para encariñarse con el ritmo de tu compañero, pero corto para que el frustrómetro se acumule.

## 4. Cero análisis tras cada error

Reservar la conversación técnica para el final del partido (o el siguiente día) baja drásticamente la frustración. El pickleball es muy rápido para teorizar entre puntos: cuando volvés a la línea con la cabeza llena de "deberías haber", el siguiente error está garantizado.

---

MATCHPOINT te ayuda con la parte 1: el ranking automático muestra el nivel de cada jugador para que armes mixtos parejos sin tener que improvisar. Probalo en [juegos abiertos](/eventos).`,
  },
  {
    slug: "5-clubes-para-jugar-pickleball-en-quito",
    title: "5 clubes para jugar pickleball en Quito (y dónde está cada uno)",
    excerpt:
      "Una guía corta a los clubes con canchas dedicadas de pickleball en la capital, con horarios, precios y nivel promedio.",
    author: { name: "Camila Reyes" },
    publishedAt: "2026-05-05",
    readMinutes: 4,
    category: "Guías",
    coverImage: "/blog/5-clubes-para-jugar-pickleball-en-quito.jpg",
    coverAlt:
      "Vista aérea de canchas de pickleball iluminadas al anochecer en Quito",
    ctaContext: {
      label: "Reservá una cancha en Quito",
      href: "/clubes?ciudad=quito",
    },
    relatedSlugs: [
      "como-armar-un-doble-mixto-sin-pelear",
      "guia-pago-deuna-clubes-y-jugadores",
    ],
    body: `El pickleball llegó a Quito hace poco más de dos años y ya tiene una comunidad activa de unas 600 personas que juegan al menos una vez por semana. Las canchas todavía son pocas, pero crecen rápido. Aquí va una guía corta a los clubes con instalaciones dedicadas.

## Los 5 clubes con canchas dedicadas

- **Club Norte Pickleball — Cumbayá.** 4 canchas outdoor con luces hasta las 22:00. Cuna de la liga mensual más grande de Ecuador. Nivel mixto, sales con partidos asegurados.
- **MATCHPOINT Quito — La Carolina.** 4 canchas indoor + 2 outdoor. Único club céntrico con horarios extendidos los fines de semana (hasta las 23:00). Tarifas más altas pero canchas premium.
- **Smash Sport Cumbayá — Cumbayá.** 3 canchas outdoor. Ambiente más familiar, ideal para empezar. Tienen clases iniciales todos los sábados.
- **Pickle Club Quito — Tumbaco.** 2 canchas indoor en una nave techada. Único refugio en días de lluvia. Comunidad chica pero apretada; armar partido es fácil.
- **Top Spin Cumbayá — Cumbayá.** 3 canchas multifunción (también pádel). Bueno para mixtos avanzados; los lunes hacen "pro nights".

## Reservas y disponibilidad

Todos estos clubes están en MATCHPOINT con [calendario en vivo de disponibilidad](/clubes). Reservas desde la app, pagás por transferencia o DeUna, y nadie te tira sin previo aviso.

### Cómo elegir el primer club

Si recién arrancás, mi consejo: probá dos clubes distintos antes de fijar el habitual. La comunidad pesa más que las canchas — un club con 30 jugadores activos te da más matches que uno con 6 canchas pero 8 jugadores.`,
  },
  {
    slug: "como-leer-tu-ranking-mejorar-rapido",
    title: "Cómo leer tu ranking MATCHPOINT y subir 0.5 puntos en 3 meses",
    excerpt:
      "El ranking no es solo un número. Te decimos qué métricas mirar para diagnosticar qué te falta y ajustar tu plan de entrenamiento.",
    author: { name: "Renata Salas" },
    publishedAt: "2026-04-28",
    readMinutes: 7,
    category: "Coaching",
    coverImage: "/blog/como-leer-tu-ranking-mejorar-rapido.jpg",
    coverAlt: "Captura del ranking MATCHPOINT con tres barras de progreso",
    ctaContext: {
      label: "Mirá tu ranking actualizado",
      href: "/ranking",
    },
    relatedSlugs: [
      "como-armar-un-doble-mixto-sin-pelear",
      "guia-pago-deuna-clubes-y-jugadores",
    ],
    body: `La pregunta más común que recibimos de jugadores recreativos es "¿cómo subo de 3.0 a 3.5?". La respuesta no es "jugar más"; es "jugar mejor lo que ya juegás mal".

## Qué mide el ranking MATCHPOINT

El ranking MATCHPOINT se compone de tres factores:

1. Puntos por victoria (50%).
2. Nivel de los rivales (30%).
3. Consistencia mensual (20%).

Si solo mirás el número global, te perdés la mitad de la información.

## Diagnóstico rápido

Entrá a tu perfil → ranking → expandir. Vas a ver tres barras: **ataque**, **defensa** y **consistencia**. La que está más baja es tu próxima asignatura.

### Si tu barra de ataque está baja

Te falta cierre. Trabajá drives y volea de derecha. 30 min de drills por sesión durante 6 semanas suben drásticamente este indicador.

### Si tu barra de defensa está baja

Te ganan en la transición. Trabajá resets desde el fondo y dinks angulados. Inscribite en una [clínica grupal](/coaches) antes de pedir clase 1 a 1 — es más barato y aprendés mirando.

### Si tu barra de consistencia está baja

No es técnico, es de calendario. Necesitás jugar al menos 2 veces por semana, mismo día más o menos a la misma hora.

> El cerebro consolida memoria motriz con repetición espaciada, no con maratones.

## El plan de 3 meses

Subir 0.5 puntos en 3 meses es realista si atacás la barra más baja con foco. Si trabajás las tres a la vez, vas a quedar igual pero más cansado.`,
  },
  {
    slug: "guia-pago-deuna-clubes-y-jugadores",
    title: "Cómo cobrar y pagar con DeUna: guía rápida para clubes y jugadores",
    excerpt:
      "DeUna es la wallet del Banco Pichincha que está reemplazando la transferencia bancaria en clubes deportivos. Te explicamos cómo configurarla.",
    author: { name: "Mauricio Pinos" },
    publishedAt: "2026-04-20",
    readMinutes: 5,
    category: "Producto",
    coverImage: "/blog/guia-pago-deuna-clubes-y-jugadores.jpg",
    coverAlt: "QR de DeUna pegado en la recepción de un club deportivo",
    ctaContext: {
      label: "Configurá tu club en MATCHPOINT",
      href: "/soy-club",
    },
    relatedSlugs: [
      "5-clubes-para-jugar-pickleball-en-quito",
      "como-armar-un-doble-mixto-sin-pelear",
    ],
    body: `Hasta hace un año todos los clubes pedían transferencia interbancaria para reservas. El problema: cada cliente tardaba un día en confirmar y los lunes el admin perdía dos horas verificando comprobantes.

## Qué cambió con DeUna

La wallet del Banco Pichincha permite enviar y recibir hasta USD 1,000 al día sin costo, instantáneo, con comprobante automático en QR.

## Para clubes

- Pedile el QR estático a tu ejecutivo de Pichincha.
- Pegalo en tu perfil MATCHPOINT en [Soy Club → Pagos](/soy-club).
- Los jugadores escanean al inscribirse y suben el screenshot del comprobante.

## Para jugadores

1. Descargá DeUna desde tu banco.
2. Asociá tu cuenta.
3. Al pagar una reserva, abrí el QR del club, confirmá el monto exacto, y compartí el screenshot directamente desde la app.

## Qué hace (y qué no hace) MATCHPOINT

MATCHPOINT **no procesa ese pago**; solo registra el comprobante y notifica al admin del club. Por eso no tomamos comisión por transacción.

> Para los clubes que aún no aceptan DeUna: el flujo manual (transferencia + comprobante) sigue funcionando. Pero la diferencia en velocidad de aprobación es notable: con DeUna el cliente entra al partido confirmado el mismo día.`,
  },
];

export function findPostBySlug(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}

export function findRelatedPosts(post: BlogPost, max = 3): BlogPost[] {
  if (post.relatedSlugs && post.relatedSlugs.length > 0) {
    const bySlug = new Map(BLOG_POSTS.map((p) => [p.slug, p]));
    return post.relatedSlugs
      .map((slug) => bySlug.get(slug))
      .filter((p): p is BlogPost => p !== undefined && p.slug !== post.slug)
      .slice(0, max);
  }
  return BLOG_POSTS.filter(
    (p) => p.slug !== post.slug && p.category === post.category,
  )
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, max);
}
