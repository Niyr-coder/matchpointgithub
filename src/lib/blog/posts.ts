// Catálogo estático de posts del blog MATCHPOINT.
// Reemplazar por CMS o tabla blog_posts cuando crezca.

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string; // YYYY-MM-DD
  readMin: number;
  category: string;
  body: string[]; // párrafos
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "como-armar-un-doble-mixto-sin-pelear",
    title: "Cómo armar un doble mixto sin terminar peleados",
    excerpt:
      "Las 4 reglas no escritas que separan a un doble mixto que se vuelve costumbre de uno que termina con el grupo dividido por WhatsApp.",
    author: "Andrés Vega",
    publishedAt: "2026-05-10",
    readMin: 6,
    category: "Comunidad",
    body: [
      "El doble mixto es el formato más popular del pickleball en Ecuador y también el que más conflictos genera. Si has jugado más de tres veces, ya sabes a qué me refiero: alguien tira un drop perfecto, su pareja no llega a la red, miradita, silencio, y al siguiente fin de semana ese partido no se vuelve a armar.",
      "Después de 200+ partidos mixtos en Quito y Cumbayá, identifiqué 4 reglas no escritas que separan a los grupos que duran de los que se rompen.",
      "1. Equilibren niveles, no géneros. Un 4.5 con una 3.0 vs un 4.0 con una 4.0 no es 'parejo'; es una receta para que la 3.0 se sienta presionada. Antes de armar, miren los rankings combinados.",
      "2. Definan reglas de comunicación antes del primer punto. ¿Quién pide los del medio? ¿Se piden o se llaman? Decirlo antes evita choques en el momento.",
      "3. Roten cada 4 juegos. Si jugaron 11 puntos × 4 juegos y nadie cambió de pareja, el grupo se enfría. La rotación obliga a conocer estilos distintos.",
      "4. Cero análisis tras cada error. Reservar la conversación técnica para el final del partido (o el siguiente día) baja drásticamente la frustración. El pickleball es muy rápido para teorizar entre puntos.",
      "MATCHPOINT te ayuda con la parte 1: el ranking automático muestra el nivel de cada jugador para que armes mixtos parejos sin tener que improvisar. Pruébalo en /eventos · juegos abiertos.",
    ],
  },
  {
    slug: "5-clubes-para-jugar-pickleball-en-quito",
    title: "5 clubes para jugar pickleball en Quito (y dónde está cada uno)",
    excerpt:
      "Una guía corta a los clubes con canchas dedicadas de pickleball en la capital, con horarios, precios y nivel promedio.",
    author: "Camila Reyes",
    publishedAt: "2026-05-05",
    readMin: 4,
    category: "Guías",
    body: [
      "El pickleball llegó a Quito hace poco más de dos años y ya tiene una comunidad activa de unas 600 personas que juegan al menos una vez por semana. Las canchas todavía son pocas, pero crecen rápido. Aquí va una guía corta a los clubes con instalaciones dedicadas.",
      "Club Norte Pickleball — Cumbayá. 4 canchas outdoor con luces hasta las 22:00. Cuna de la liga mensual más grande de Ecuador. Nivel mixto, sales con partidos asegurados.",
      "MATCHPOINT Quito — La Carolina. 4 canchas indoor + 2 outdoor. Único club céntrico con horarios extendidos los fines de semana (hasta las 23:00). Tarifas más altas pero canchas premium.",
      "Smash Sport Cumbayá — Cumbayá. 3 canchas outdoor. Ambiente más familiar, ideal para empezar. Tienen clases iniciales todos los sábados.",
      "Pickle Club Quito — Tumbaco. 2 canchas indoor en una nave techada. Único refugio en días de lluvia. Comunidad chica pero apretada; armar partido es fácil.",
      "Top Spin Cumbayá — Cumbayá. 3 canchas multifunción (también pádel). Buen para mixtos avanzados; los lunes hacen 'pro nights'.",
      "Todos estos clubes están en MATCHPOINT con calendario en vivo de disponibilidad. Reservas desde la app, pagas por transferencia o DeUna, y nadie te tira sin previo aviso.",
    ],
  },
  {
    slug: "como-leer-tu-ranking-mejorar-rapido",
    title: "Cómo leer tu ranking MATCHPOINT y subir 0.5 puntos en 3 meses",
    excerpt:
      "El ranking no es solo un número. Te decimos qué métricas mirar para diagnosticar qué te falta y ajustar tu plan de entrenamiento.",
    author: "Renata Salas",
    publishedAt: "2026-04-28",
    readMin: 7,
    category: "Coaching",
    body: [
      "La pregunta más común que recibimos de jugadores recreativos es '¿cómo subo de 3.0 a 3.5?'. La respuesta no es 'jugar más'; es 'jugar mejor lo que ya juegas mal'.",
      "El ranking MATCHPOINT se compone de tres factores: puntos por victoria (50%), nivel de los rivales (30%) y consistencia mensual (20%). Si solo miras el número global, te pierdes la mitad de la información.",
      "Diagnóstico rápido. Entra a tu perfil → ranking → expandir. Vas a ver tres barras: ataque, defensa y consistencia. La que está más baja es tu próxima asignatura.",
      "Si tu barra de ataque está baja: te falta cierre. Trabaja drives y volea de derecha. 30 min de drills por sesión durante 6 semanas suben drásticamente este indicador.",
      "Si tu barra de defensa está baja: te ganan en la transición. Trabaja resets desde el fondo y dinks angulados. Inscríbete en una clínica grupal antes de pedir clase 1 a 1 — es más barato y aprendes mirando.",
      "Si tu barra de consistencia está baja: no es técnico, es de calendario. Necesitas jugar al menos 2 veces por semana, mismo día más o menos a la misma hora. El cerebro consolida memoria motriz con repetición espaciada, no con maratones.",
      "Subir 0.5 puntos en 3 meses es realista si atacas la barra más baja con foco. Si trabajas las tres a la vez, vas a quedar igual pero más cansado.",
    ],
  },
  {
    slug: "guia-pago-deuna-clubes-y-jugadores",
    title: "Cómo cobrar y pagar con DeUna: guía rápida para clubes y jugadores",
    excerpt:
      "DeUna es la wallet del Banco Pichincha que está reemplazando la transferencia bancaria en clubes deportivos. Te explicamos cómo configurarla.",
    author: "Mauricio Pinos",
    publishedAt: "2026-04-20",
    readMin: 5,
    category: "Producto",
    body: [
      "Hasta hace un año todos los clubes pedían transferencia interbancaria para reservas. El problema: cada cliente tardaba un día en confirmar y los lunes el admin perdía dos horas verificando comprobantes.",
      "DeUna cambió eso. La wallet del Banco Pichincha permite enviar y recibir hasta USD 1,000 al día sin costo, instantáneo, con comprobante automático en QR.",
      "Para clubes: pides el QR estático a tu ejecutivo de Pichincha; lo pegas en tu perfil MATCHPOINT en /soy-club > pagos. Los jugadores escanean al inscribirse y suben el screenshot del comprobante.",
      "Para jugadores: descarga DeUna desde tu banco, asocia tu cuenta y listo. Al pagar una reserva, abres el QR del club, confirmas el monto exacto, y compartes el screenshot directamente desde la app.",
      "MATCHPOINT no procesa ese pago; solo registra el comprobante y notifica al admin del club. Por eso no tomamos comisión por transacción.",
      "Para los clubes que aún no aceptan DeUna: el flujo manual (transferencia + comprobante) sigue funcionando. Pero la diferencia en velocidad de aprobación es notable: con DeUna el cliente entra al partido confirmado el mismo día.",
    ],
  },
];

export function findPostBySlug(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}
