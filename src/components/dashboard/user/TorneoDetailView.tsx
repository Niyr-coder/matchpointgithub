"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PlayerBackBtn } from "./_shared/PlayerBackBtn";
import { PlayerHero } from "./_shared/PlayerHero";
import { PlayerTabStrip } from "./_shared/PlayerTabStrip";
import { NextMatchCard } from "./_shared/NextMatchCard";
import { MiniStat } from "./_shared/MiniStat";
import { PLAYER_TONES } from "./_shared/playerTones";
import type { PlayerTone } from "./_shared/playerTones";
import type { TournamentDetail } from "@/lib/schemas/tournaments";
import type { TournamentBracketSideView, TournamentPlayerMatchView } from "@/lib/torneos/player-matches";
import {
  completoTabIcon,
  formatLabelForPlayerView,
  playerTabLabels,
  type TorneoPlayerFormat,
  type TorneoPlayerShell,
  type TorneoPlayerStatus,
} from "@/lib/torneos/player-view";

export type TorneoPlayerTab = "camino" | "completo" | "detalles" | "resultados";

type Props = {
  shell: TorneoPlayerShell;
  detail: TournamentDetail;
  myMatches?: TournamentPlayerMatchView[];
  bracketSides?: TournamentBracketSideView[];
  /** Override status (preview / dev). */
  previewStatus?: TorneoPlayerStatus;
  backHref?: string;
};

function tabFromLocation(): TorneoPlayerTab {
  if (typeof window === "undefined") return "camino";
  const requested = new URLSearchParams(window.location.search).get("tab");
  if (requested === "completo" || requested === "detalles" || requested === "resultados") return requested;
  return "camino";
}

export function TorneoDetailView({
  shell,
  detail,
  myMatches = [],
  bracketSides = [],
  previewStatus,
  backHref = "/dashboard/user/eventos",
}: Props) {
  const router = useRouter();
  const tone = PLAYER_TONES.torneo;
  const format = shell.format;
  const status = previewStatus ?? shell.status;
  const [tab, setTab] = useState<TorneoPlayerTab>(tabFromLocation);

  const tabLabels = playerTabLabels(format);
  const tabs = useMemo(
    () => [
      { key: "camino" as const, label: tabLabels.camino, icon: "flag" },
      { key: "completo" as const, label: tabLabels.completo, icon: completoTabIcon(format) },
      { key: "detalles" as const, label: "Detalles", icon: "info" },
      { key: "resultados" as const, label: "Resultados", icon: "bar-chart-3" },
    ],
    [format, tabLabels.camino, tabLabels.completo],
  );

  const setActiveTab = useCallback(
    (key: TorneoPlayerTab) => {
      setTab(key);
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", key);
        router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [router],
  );

  const meta = useMemo(
    () => [
      { icon: "calendar-days", label: shell.dateLabel },
      { icon: "map-pin", label: shell.locationText },
      { icon: "trophy", label: formatLabelForPlayerView(format) },
    ],
    [format, shell.dateLabel, shell.locationText],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18 }}>
      <PlayerBackBtn onClick={() => router.push(backHref)} />
      <PlayerHero tone={tone} statusLabel={shell.statusLabel} title={shell.title} meta={meta} />
      <PlayerTabStrip tabs={tabs} active={tab} onChange={setActiveTab} tone="torneo" ariaLabel="Vista de torneo" />

      {tab === "camino" && (
        <CaminoTab
          tone={tone}
          status={status}
          format={format}
          matches={myMatches}
          onGoCompleto={() => setActiveTab("completo")}
        />
      )}
      {tab === "completo" && (
        <CompletoTab tone={tone} format={format} bracketSides={bracketSides} />
      )}
      {tab === "detalles" && (
        <DetallesTab tone={tone} format={format} feeLabel={shell.feeLabel} detail={detail} />
      )}
      {tab === "resultados" && <ResultadosTab tone={tone} matches={myMatches} />}
    </div>
  );
}

function PlayerEmptyPanel({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card pv-rise" style={{ padding: 22, textAlign: "center" }}>
      <Icon name={icon} size={22} color="var(--muted-fg)" />
      <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, marginTop: 8 }}>
        {title}<span className="dot">.</span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--muted-fg)", margin: "6px auto 0", maxWidth: 320, lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  );
}

function CaminoTab({
  tone,
  status,
  format,
  matches,
  onGoCompleto,
}: {
  tone: PlayerTone;
  status: TorneoPlayerStatus;
  format: TorneoPlayerFormat;
  matches: TournamentPlayerMatchView[];
  onGoCompleto: () => void;
}) {
  if (status === "open") {
    return (
      <PlayerEmptyPanel
        icon="trophy"
        title="Inscrito"
        body={
          format === "bracket"
            ? "Cuando cierre inscripciones y se publique la llave, tu primer partido aparece aquí."
            : format === "grupos"
              ? "El sorteo de grupos se publicará antes del arranque."
              : "El calendario completo se publica antes de la primera jornada."
        }
      />
    );
  }

  return <CaminoLive tone={tone} matches={matches} onGoCompleto={onGoCompleto} />;
}

function CaminoLive({
  tone,
  matches,
  onGoCompleto,
}: {
  tone: PlayerTone;
  matches: TournamentPlayerMatchView[];
  onGoCompleto: () => void;
}) {
  if (matches.length === 0) {
    return (
      <PlayerEmptyPanel
        icon="calendar-days"
        title="Sin partidos asignados"
        body="Cuando el organizador publique la llave o el calendario, tus partidos aparecen aquí."
      />
    );
  }

  const next = matches.find((m) => m.won === null) ?? null;
  const played = matches.filter((m) => m.won !== null);
  const wins = played.filter((m) => m.won).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {next ? (
        <NextMatchCard
          tone={tone}
          toneKey="torneo"
          kicker={`Tu próximo partido · Ronda ${next.round}`}
          primary="RONDA"
          primaryValue={next.round}
          partner=""
          opponents={next.opponentLabel}
          subtitle={next.scheduledLabel ?? "El organizador confirmará hora y cancha."}
          ctaLabel="Ver cuadro completo"
          onCta={onGoCompleto}
        />
      ) : (
        <div className="card" style={{ padding: 16, background: tone.accentLight, border: `1px solid ${tone.accent}` }}>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>
            Sin partidos pendientes<span className="dot">.</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4 }}>
            Jugaste todos los partidos programados en tu llave.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        <MiniStat label="Partidos jugados" value={String(played.length)} />
        <MiniStat label="Victorias" value={String(wins)} />
        <MiniStat label="Pendientes" value={String(matches.length - played.length)} />
      </div>

      <div className="label-mp" style={{ marginTop: 4 }}>Tus partidos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {matches.map((m) => (
          <TorneoMatchRow key={m.id} m={m} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function TorneoMatchRow({ m, tone }: { m: TournamentPlayerMatchView; tone: PlayerTone }) {
  const played = m.won !== null;
  const won = m.won === true;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "52px 1fr auto",
        gap: 10,
        padding: "10px 13px",
        border: `1px solid ${won ? "rgba(22,163,74,0.30)" : played ? "var(--destructive-border)" : tone.accent}`,
        borderRadius: 10,
        background: won ? "rgba(22,163,74,0.06)" : played ? "var(--destructive-bg)" : "#fffbeb",
        alignItems: "center",
      }}
    >
      <div className="font-heading tabular" style={{ fontSize: 13, fontWeight: 900, color: "var(--muted-fg)", textAlign: "center" }}>
        R{m.round}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 800 }}>vs. {m.opponentLabel}</div>
        {m.scheduledLabel && (
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 600 }}>{m.scheduledLabel}</div>
        )}
      </div>
      {m.scoreLabel ? (
        <div className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, color: won ? "var(--success-fg)" : "var(--destructive-fg)" }}>
          {m.scoreLabel}
        </div>
      ) : (
        <div style={{ fontSize: 10, fontWeight: 900, color: "var(--muted-fg)", letterSpacing: "0.06em" }}>
          {played ? (won ? "G" : "P") : "POR JUGAR"}
        </div>
      )}
    </div>
  );
}

function CompletoTab({
  tone,
  format,
  bracketSides,
}: {
  tone: PlayerTone;
  format: TorneoPlayerFormat;
  bracketSides: TournamentBracketSideView[];
}) {
  if (bracketSides.length === 0) {
    return (
      <PlayerEmptyPanel
        icon={completoTabIcon(format)}
        title="Cuadro no publicado"
        body="Cuando el organizador genere la llave o el calendario, lo ves completo aquí."
      />
    );
  }

  const rounds = [...new Set(bracketSides.map((m) => m.round))].sort((a, b) => a - b);
  const roundTitle = (round: number, idx: number, total: number) => {
    if (format === "bracket" && total === 4) {
      return ["Octavos", "Cuartos", "Semifinal", "Final"][idx] ?? `Ronda ${round}`;
    }
    return `Ronda ${round}`;
  };

  return (
    <div className="card" style={{ padding: 14, overflow: "auto" }}>
      <div style={{ display: "flex", gap: 18, minWidth: Math.max(600, rounds.length * 140) }}>
        {rounds.map((round, idx) => {
          const matches = bracketSides.filter((m) => m.round === round);
          return (
            <div key={round} style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 130 }}>
              <div className="label-mp" style={{ marginBottom: 8 }}>
                {roundTitle(round, idx, rounds.length)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-around", flex: 1 }}>
                {matches.map((m) => (
                  <BracketMatchReal key={m.id} m={m} tone={tone} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatchReal({ m, tone }: { m: TournamentBracketSideView; tone: PlayerTone }) {
  const aWon = m.winnerSide === "a";
  const bWon = m.winnerSide === "b";
  const highlight = m.involvesMe;

  return (
    <div
      style={{
        border: `1px solid ${highlight ? tone.accent : "var(--border)"}`,
        borderRadius: 8,
        overflow: "hidden",
        background: highlight ? "#fffbeb" : "#fff",
      }}
    >
      <BracketLineReal name={m.sideALabel} won={aWon} highlight={highlight} tone={tone} />
      <div style={{ height: 1, background: "var(--border)" }} />
      <BracketLineReal name={m.sideBLabel} won={bWon} highlight={highlight} tone={tone} />
    </div>
  );
}

function BracketLineReal({
  name,
  won,
  highlight,
  tone,
}: {
  name: string;
  won: boolean;
  highlight: boolean;
  tone: PlayerTone;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px",
        fontSize: 10.5,
        fontWeight: won || highlight ? 900 : 700,
        color: won || highlight ? "var(--fg)" : "var(--muted-fg)",
        background: highlight ? "rgba(251,191,36,0.10)" : "transparent",
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {highlight && (
        <span style={{ fontSize: 7.5, fontWeight: 900, padding: "1px 4px", borderRadius: 9999, background: tone.accent, color: "#0a0a0a", letterSpacing: "0.08em" }}>
          TÚ
        </span>
      )}
    </div>
  );
}

function DetallesTab({
  tone,
  format,
  feeLabel,
  detail,
}: {
  tone: PlayerTone;
  format: TorneoPlayerFormat;
  feeLabel: string;
  detail: TournamentDetail;
}) {
  const t = detail.tournament;
  const hasDescription = !!t.description?.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {hasDescription ? (
        <div className="card" style={{ padding: 14 }}>
          <div className="label-mp">Sobre el torneo</div>
          <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--fg)", whiteSpace: "pre-wrap" }}>
            {t.description}
          </p>
        </div>
      ) : (
        <PlayerEmptyPanel
          icon="info"
          title="Sin descripción"
          body="El organizador aún no agregó detalles del torneo."
        />
      )}
      <div className="card" style={{ padding: 14 }}>
        <div className="label-mp">Formato</div>
        <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "var(--fg)" }}>
          {formatLabelForPlayerView(format)} · {t.modality === "singles" ? "Singles" : "Dobles"}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted-fg)" }}>
          {detail.registrationCount} inscripciones confirmadas
          {t.maxParticipants != null ? ` · cupo ${t.maxParticipants}` : ""}
        </div>
      </div>
      <div className="card" style={{ padding: 14 }}>
        <div className="label-mp">Inscripción</div>
        <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>
          {feeLabel}
          <span style={{ color: tone.accentDot }}>.</span>
        </div>
      </div>
    </div>
  );
}

function ResultadosTab({ tone, matches }: { tone: PlayerTone; matches: TournamentPlayerMatchView[] }) {
  const played = matches.filter((m) => m.won !== null);

  if (played.length === 0) {
    return (
      <PlayerEmptyPanel
        icon="bar-chart-3"
        title="Sin resultados"
        body="Tus marcadores aparecen aquí cuando el organizador cargue los partidos."
      />
    );
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>
        Tus resultados
        <span style={{ color: tone.accentDot }}>.</span>
      </div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
        {played.map((m) => (
          <div
            key={m.id}
            style={{
              display: "grid",
              gridTemplateColumns: "70px 1fr 90px",
              gap: 8,
              alignItems: "center",
              padding: "6px 0",
              borderTop: "1px dashed var(--border)",
              fontSize: 11.5,
            }}
          >
            <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
              Ronda {m.round}
            </span>
            <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              vs. {m.opponentLabel}
            </span>
            <span
              className="font-heading tabular"
              style={{
                fontSize: 11.5,
                fontWeight: 900,
                textAlign: "right",
                color: m.won ? "var(--success-fg)" : "var(--destructive-fg)",
              }}
            >
              {m.scoreLabel ?? (m.won ? "Ganaste" : "Perdiste")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { TorneoPlayerShell };
