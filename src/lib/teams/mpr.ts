// Team MPR (computado on-the-fly).
//
// El team no tiene rating propio en DB (todavía — ver §29.X de
// docs/architecture/20-database.md). Lo computamos como promedio
// ponderado del current_rating de los miembros activos en el sport+mode
// del team. Cuando montemos Arena/retos team-vs-team, este cálculo se
// guarda en `team_stats` y se actualiza con matches reales.
//
// Fórmula:  weighted_avg(current_rating, weight = matches_total + 1)
//
// El "+1" evita que un miembro con 0 matches quede sin voz; sigue
// contribuyendo pero pesa lo mínimo. Miembros con más matches pesan más.
//
// Escala interna: 1500-base. Display = rating / 1000 → 4.20.

export type MemberStatsRow = {
  userId: string;
  currentRating: number;
  matchesTotal: number;
};

export type TeamMprResult = {
  // null = no hay miembros con stats (team recién creado o sin player_stats
  // del sport/mode pedido). La UI debe mostrar "—" o "Inicial".
  rating: number | null;
  contributors: MemberStatsRow[];
};

export function computeTeamMpr(rows: MemberStatsRow[]): TeamMprResult {
  if (rows.length === 0) return { rating: null, contributors: [] };
  let weightSum = 0;
  let weightedRating = 0;
  for (const r of rows) {
    const w = r.matchesTotal + 1;
    weightSum += w;
    weightedRating += r.currentRating * w;
  }
  if (weightSum === 0) return { rating: null, contributors: rows };
  return {
    rating: Math.round(weightedRating / weightSum),
    contributors: rows,
  };
}

// Display helper: 1500 → "1.50", 4200 → "4.20". Si null → "—".
export function formatMpr(rating: number | null | undefined): string {
  if (rating == null) return "—";
  return (rating / 1000).toFixed(2);
}
