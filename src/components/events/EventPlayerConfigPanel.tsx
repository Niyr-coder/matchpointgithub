"use client";

import { Icon } from "@/components/Icon";
import {
  buildQuedadaConfigRows,
  buildTournamentConfigRows,
  formatCategoryStage,
  formatMprRange,
  type ConfigRow,
} from "@/lib/events/player-event-config";
import type { GroupPlayoffConfig } from "@/lib/tournaments/group-stage";
import type { ScoringConfig } from "@/lib/schemas/tournaments";

type QuedadaCategory = {
  name: string;
  level_label: string | null;
  target_points: number | null;
  max_slots?: number | null;
  starts_at?: string | null;
  court_label?: string | null;
};

type TournamentCategory = {
  name: string;
  gender: string | null;
  level: string | null;
  ageMin: number | null;
  ageMax: number | null;
  maxTeams: number | null;
  mprMin?: number | null;
  mprMax?: number | null;
  stage?: string | null;
  groupPlayoffConfig?: GroupPlayoffConfig | null;
};

type Props =
  | {
      kind: "quedada";
      format: string;
      matchMode: "singles" | "doubles";
      visibility: "open" | "private";
      feeCents: number;
      targetPoints: number | null;
      status: string;
      categories?: QuedadaCategory[];
      compact?: boolean;
    }
  | {
      kind: "tournament";
      format: string;
      modality: string | null;
      scoringConfig: ScoringConfig | null;
      paymentPolicy: string;
      entryFeeCents: number;
      maxParticipants: number | null;
      categories: TournamentCategory[];
      compact?: boolean;
    };

function genderLabel(g: string | null): string | null {
  switch (g) {
    case "m":
      return "Masculino";
    case "f":
      return "Femenino";
    case "mixed":
      return "Mixto";
    case "open":
      return "Open";
    default:
      return null;
  }
}

function formatWhenShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "short" });
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${date} · ${hh}:${mm}`;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45 }}>
      <span style={{ flexShrink: 0, minWidth: 88, fontWeight: 800, color: "var(--muted-fg)" }}>{label}</span>
      <span style={{ color: "var(--fg)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ConfigGrid({ rows, compact }: { rows: ConfigRow[]; compact?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))",
        gap: compact ? 8 : 10,
      }}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            padding: compact ? "10px 12px" : "12px 14px",
            borderRadius: 10,
            background: "var(--muted)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
            {row.label}
          </div>
          <div style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 800, marginTop: 4, lineHeight: 1.35 }}>
            {row.value}
          </div>
          {row.hint && (
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 6, lineHeight: 1.5, fontWeight: 500 }}>
              {row.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function EventPlayerConfigPanel(props: Props) {
  const compact = props.compact ?? false;

  const rows =
    props.kind === "quedada"
      ? buildQuedadaConfigRows({
          format: props.format,
          matchMode: props.matchMode,
          visibility: props.visibility,
          feeCents: props.feeCents,
          targetPoints: props.targetPoints,
          status: props.status,
        })
      : buildTournamentConfigRows({
          format: props.format,
          modality: props.modality,
          scoringConfig: props.scoringConfig,
          paymentPolicy: props.paymentPolicy,
          entryFeeCents: props.entryFeeCents,
          maxParticipants: props.maxParticipants,
          groupPlayoffFromCategories: props.categories.find((c) => c.groupPlayoffConfig)?.groupPlayoffConfig ?? null,
        });

  const categories =
    props.kind === "quedada" ? (props.categories ?? []) : props.categories;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="settings-2" size={14} color="var(--primary)" />
        <div className="label-mp" style={{ margin: 0 }}>
          Configuración del {props.kind === "quedada" ? "juego" : "torneo"}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Así está armado el evento: formato, reglas de puntuación y cómo avanzan los equipos.
      </p>
      <ConfigGrid rows={rows} compact={compact} />

      {categories.length > 0 && (
        <div>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            {props.kind === "quedada" ? "Categorías" : "Categorías del torneo"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {props.kind === "quedada"
              ? (categories as QuedadaCategory[]).map((c, i) => {
                  const defaultPts = props.kind === "quedada" ? props.targetPoints : null;
                  const pts = c.target_points ?? defaultPts;
                  const when = formatWhenShort(c.starts_at);
                  return (
                    <div
                      key={`${c.name}-${i}`}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 9,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 13 }}>{c.name}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {c.level_label ? (
                          <DetailLine label="Nivel" value={c.level_label} />
                        ) : (
                          <DetailLine label="Nivel" value="Abierto (sin rango declarado)" />
                        )}
                        <DetailLine
                          label="Puntuación"
                          value={pts ? `A ${pts} puntos por game` : "Según el organizador"}
                        />
                        {c.max_slots != null ? (
                          <DetailLine label="Cupo" value={`Máximo ${c.max_slots} jugadores`} />
                        ) : null}
                        {when ? <DetailLine label="Horario" value={when} /> : null}
                        {c.court_label ? <DetailLine label="Cancha" value={c.court_label} /> : null}
                      </div>
                    </div>
                  );
                })
              : (categories as TournamentCategory[]).map((c) => (
                  <div
                    key={c.name}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 9,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 13 }}>{c.name}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <DetailLine
                        label="Género"
                        value={genderLabel(c.gender) ?? "Open"}
                      />
                      {c.level ? <DetailLine label="Nivel" value={c.level} /> : null}
                      {formatMprRange(c.mprMin ?? null, c.mprMax ?? null) ? (
                        <DetailLine label="MPR" value={formatMprRange(c.mprMin ?? null, c.mprMax ?? null)!} />
                      ) : (
                        <DetailLine label="MPR" value="Open (sin rango)" />
                      )}
                      {c.ageMin != null || c.ageMax != null ? (
                        <DetailLine
                          label="Edad"
                          value={`${c.ageMin ?? "—"} – ${c.ageMax ?? "—"} años`}
                        />
                      ) : null}
                      {c.maxTeams ? (
                        <DetailLine label="Cupos" value={`Máx. ${c.maxTeams} equipos`} />
                      ) : null}
                      {c.stage ? (
                        <DetailLine label="Fase" value={formatCategoryStage(c.stage)} />
                      ) : null}
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}
