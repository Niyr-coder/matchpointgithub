import type {
  AdminEloPoint,
  AdminIntegritySignal,
  AdminProfileChangeEntry,
} from "@/lib/types/admin-user-detail";

const PROFILE_FIELD_LABELS: Record<string, string> = {
  display_name: "Nombre",
  username: "Usuario",
  city: "Ciudad",
  bio: "Bio",
  skill_level: "Nivel declarado",
  preferred_sport: "Deporte",
  phone: "Teléfono",
  country: "País",
  avatar_url: "Avatar",
};

const TRACKED_PROFILE_FIELDS = Object.keys(PROFILE_FIELD_LABELS);

export function parseProfileAuditChanges(
  rows: Array<{ action: string; created_at: string; diff: unknown }>,
): AdminProfileChangeEntry[] {
  const out: AdminProfileChangeEntry[] = [];
  for (const row of rows) {
    if (row.action !== "UPDATE") continue;
    const diff = row.diff as { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
    if (!diff?.before || !diff?.after) continue;
    const fields: AdminProfileChangeEntry["fields"] = [];
    for (const key of TRACKED_PROFILE_FIELDS) {
      const before = diff.before[key];
      const after = diff.after[key];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      fields.push({
        key,
        label: PROFILE_FIELD_LABELS[key] ?? key,
        before: formatAuditValue(before),
        after: formatAuditValue(after),
      });
    }
    if (fields.length > 0) {
      out.push({ at: row.created_at as string, action: row.action, fields });
    }
  }
  return out;
}

function formatAuditValue(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function buildEloHistory(
  rows: Array<{ rating: number; mode: string | null; snapshot_at: string }>,
): AdminEloPoint[] {
  const byMode = new Map<string, Array<{ rating: number; at: string }>>();
  for (const row of rows) {
    const mode = (row.mode as string | null) ?? "singles";
    const list = byMode.get(mode) ?? [];
    list.push({ rating: row.rating as number, at: row.snapshot_at as string });
    byMode.set(mode, list);
  }

  const points: AdminEloPoint[] = [];
  for (const [mode, list] of byMode) {
    const sorted = [...list].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    for (let i = 0; i < sorted.length && i < 12; i++) {
      const cur = sorted[i];
      const prev = sorted[i + 1];
      points.push({
        at: cur.at,
        mode,
        rating: cur.rating,
        delta: prev != null ? cur.rating - prev.rating : null,
      });
    }
  }

  return points.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 16);
}

export function computeIntegritySignals(input: {
  skillLevel: string | null;
  sportStats: Array<{ mode: string; rating: number; matches: number; wins: number; losses: number }>;
  eloHistory: AdminEloPoint[];
  profileChanges: AdminProfileChangeEntry[];
  openReportsCount: number;
}): AdminIntegritySignal[] {
  const signals: AdminIntegritySignal[] = [];
  const primary =
    input.sportStats.find((s) => s.mode === "singles") ?? input.sportStats[0] ?? null;
  const rating = primary?.rating ?? 2500;

  if (input.skillLevel === "beginner" && rating >= 2800) {
    signals.push({
      code: "sandbag_beginner",
      label: "Posible ventaja deportiva",
      severity: "warn",
      detail: `Declaró beginner pero su ELO es ${rating} (≥2800). Revisa si está buscando rivales más débiles.`,
    });
  } else if (input.skillLevel === "intermediate" && rating >= 3300) {
    signals.push({
      code: "sandbag_intermediate",
      label: "ELO alto vs nivel declarado",
      severity: "warn",
      detail: `Declaró intermediate con ELO ${rating}. Puede haber desalineación nivel real vs declarado.`,
    });
  }

  if (primary && primary.matches >= 8) {
    const winRate = primary.wins / primary.matches;
    if (winRate >= 0.82 && (input.skillLevel === "beginner" || input.skillLevel === "intermediate")) {
      signals.push({
        code: "win_rate_high",
        label: "Win rate atípico",
        severity: "warn",
        detail: `${Math.round(winRate * 100)}% de victorias en ${primary.matches} partidos con nivel ${input.skillLevel ?? "sin declarar"}.`,
      });
    }
  }

  const maxDelta = input.eloHistory.reduce((max, p) => Math.max(max, Math.abs(p.delta ?? 0)), 0);
  if (maxDelta >= 120) {
    signals.push({
      code: "elo_spike",
      label: "Salto de ELO reciente",
      severity: "info",
      detail: `Hubo un cambio de hasta ${maxDelta > 0 ? "+" : ""}${maxDelta} pts entre snapshots recientes.`,
    });
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentSkill = input.profileChanges.find(
    (c) =>
      new Date(c.at).getTime() >= thirtyDaysAgo &&
      c.fields.some((f) => f.key === "skill_level"),
  );
  if (recentSkill) {
    const f = recentSkill.fields.find((x) => x.key === "skill_level");
    if (f) {
      signals.push({
        code: "skill_recent_change",
        label: "Cambió nivel declarado",
        severity: "info",
        detail: `${f.before} → ${f.after} (${new Date(recentSkill.at).toLocaleDateString("es-EC")}).`,
      });
    }
  }

  if (input.openReportsCount > 0) {
    signals.push({
      code: "open_reports",
      label: "Reportes pendientes",
      severity: "critical",
      detail: `${input.openReportsCount} reporte(s) abierto(s) contra este perfil.`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      code: "clean",
      label: "Sin alertas",
      severity: "info",
      detail: "No hay indicios destacables de sandbagging o abuso en este momento.",
    });
  }

  return signals;
}
