// Vista de "Juego" compartida entre formatos de Quedadas. El padre decide el
// motor; este componente solo muestra calendario, marcadores y tabla.
//
// El componente NO llama a las server actions: recibe callbacks opcionales
// (onReportGame / onGenerateRound / onDeleteRound). Si `canManage` es false, es
// solo lectura. El padre maneja transiciones / toasts / refetch.
//
// Las tablas de quedadas no están en los tipos generados → tipamos localmente.
"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { individualStandings, type GameForStandings } from "@/lib/quedadas/standings";
import { pairStandings } from "@/lib/quedadas/pair-standings";
import type { QuedadaStandingsMode } from "@/lib/quedadas/types";

export type {
  GameViewCategory,
  GameViewPair,
  GameViewParticipant,
  GameViewGuest,
  GameViewRound,
  GameViewGame,
} from "@/lib/quedadas/game-view-types";

import type {
  GameViewCategory,
  GameViewPair,
  GameViewParticipant,
  GameViewGuest,
  GameViewRound,
  GameViewGame,
} from "@/lib/quedadas/game-view-types";

// ── Tipos del payload (re-exportados arriba; import local para Props) ─────────

type Props = {
  categories: GameViewCategory[];
  pairs: GameViewPair[];
  participants: GameViewParticipant[];
  /** Walk-ins (guests sin cuenta): resuelven nombre por display_name. */
  guests?: GameViewGuest[];
  rounds: GameViewRound[];
  games: GameViewGame[];
  meUserId: string | null;
  matchMode: "singles" | "doubles";
  formatLabel: string;
  roundLabel: string;
  tableEntityLabel: string;
  standingsMode: QuedadaStandingsMode;
  canGenerateRound: boolean;
  canManualGame: boolean;
  quedadaTargetPoints: number | null;
  canManage: boolean;
  onReportGame?: (gameId: string, pointsA: number, pointsB: number) => void;
  onGenerateRound?: (categoryId: string) => void;
  onCreateManualGame?: (args: { categoryId: string; sideA: string[]; sideB: string[]; courtNo: number | null }) => void;
  onDeleteRound?: (roundId: string) => void;
};

function nameOf(p: { display_name: string | null; username: string | null } | null): string {
  if (!p) return "Jugador";
  return p.display_name || (p.username ? `@${p.username}` : "Jugador");
}

export function QuedadaGameView({
  categories,
  pairs,
  participants,
  guests,
  rounds,
  games,
  meUserId,
  matchMode,
  formatLabel,
  roundLabel,
  tableEntityLabel,
  standingsMode,
  canGenerateRound,
  canManualGame,
  quedadaTargetPoints,
  canManage,
  onReportGame,
  onGenerateRound,
  onCreateManualGame,
  onDeleteRound,
}: Props) {
  // Solo categorías con jugadores asignados (parejas/slots).
  const cats = categories
    .filter((c) => pairs.some((p) => p.category_id === c.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  const partById = new Map(participants.map((p) => [p.user_id, p]));
  const guestById = new Map((guests ?? []).map((g) => [g.id, g]));
  const nameFor = (id: string): string => {
    const guest = guestById.get(id);
    if (guest) return guest.display_name;
    return nameOf(partById.get(id)?.profiles ?? null);
  };

  const [viewMode, setViewMode] = useState<"category" | "courts">("category");

  if (cats.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>
        {canManage
          ? "Asigna jugadores a las categorías (pestaña Parejas) para generar rondas."
          : "El organizador todavía no asignó jugadores a las categorías."}
      </div>
    );
  }

  // El toggle se ofrece cuando hay al menos un partido (sino "por cancha" no
  // tiene contenido) o cuando hay >1 categoría (caso donde "global" agrega valor).
  const showToggle = games.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showToggle && <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />}
      {viewMode === "category" ? (
        cats.map((c) => (
          <CategoryGame
            key={c.id}
            category={c}
            pairs={pairs.filter((p) => p.category_id === c.id)}
            rounds={rounds.filter((r) => r.category_id === c.id)}
            games={games.filter((g) => g.category_id === c.id)}
            meUserId={meUserId}
            matchMode={matchMode}
            formatLabel={formatLabel}
            roundLabel={roundLabel}
            tableEntityLabel={tableEntityLabel}
            standingsMode={standingsMode}
            canGenerateRound={canGenerateRound}
            canManualGame={canManualGame}
            targetPoints={c.target_points ?? quedadaTargetPoints ?? 24}
            nameFor={nameFor}
            canManage={canManage}
            onReportGame={onReportGame}
            onGenerateRound={onGenerateRound}
            onCreateManualGame={onCreateManualGame}
            onDeleteRound={onDeleteRound}
          />
        ))
      ) : (
        <CourtsView
          categories={cats}
          games={games}
          meUserId={meUserId}
          nameFor={nameFor}
          roundLabel={roundLabel}
          canManage={canManage}
          onReportGame={onReportGame}
        />
      )}
    </div>
  );
}

// ── Toggle global vs. categoría ──────────────────────────────────────────────
function ViewModeToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: "category" | "courts";
  setViewMode: (mode: "category" | "courts") => void;
}) {
  const items: { id: "category" | "courts"; label: string; icon: string }[] = [
    { id: "category", label: "Por categoría", icon: "layers" },
    { id: "courts", label: "Por cancha", icon: "map-pin" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Modo de vista del calendario"
      style={{
        display: "inline-flex",
        alignSelf: "flex-start",
        padding: 4,
        gap: 4,
        background: "var(--muted)",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
      }}
    >
      {items.map((item) => {
        const active = viewMode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setViewMode(item.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              border: 0,
              background: active ? "#fff" : "transparent",
              color: active ? "var(--fg)" : "var(--muted-fg)",
              fontWeight: 800,
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              transition: "background 160ms var(--ease-out), color 160ms var(--ease-out)",
            }}
          >
            <Icon name={item.icon} size={13} color={active ? "var(--fg)" : "var(--muted-fg)"} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Vista global "por cancha" ────────────────────────────────────────────────
// Muestra TODOS los partidos del torneo agrupados por cancha. Útil para ver "qué
// está pasando en cada cancha" sin importar la categoría. Dentro de cada cancha,
// los partidos van cronológicamente por ronda asc (los próximos primero arriba).
function CourtsView({
  categories,
  games,
  meUserId,
  nameFor,
  roundLabel,
  canManage,
  onReportGame,
}: {
  categories: GameViewCategory[];
  games: GameViewGame[];
  meUserId: string | null;
  nameFor: (id: string) => string;
  roundLabel: string;
  canManage: boolean;
  onReportGame?: (gameId: string, pointsA: number, pointsB: number) => void;
}) {
  // Agrupa por court_no. Los partidos sin cancha asignada quedan en "—".
  const byCourt = new Map<string, GameViewGame[]>();
  for (const g of games) {
    const key = g.court_no != null ? String(g.court_no) : "none";
    if (!byCourt.has(key)) byCourt.set(key, []);
    byCourt.get(key)!.push(g);
  }
  const courtKeys = Array.from(byCourt.keys()).sort((a, b) => {
    if (a === "none") return 1;
    if (b === "none") return -1;
    return parseInt(a, 10) - parseInt(b, 10);
  });
  for (const arr of byCourt.values()) {
    arr.sort((a, b) => {
      // Partidos sin jugar (próximos) primero, luego los jugados al final.
      const sa = a.status === "played" ? 1 : 0;
      const sb = b.status === "played" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return (a.round_no ?? 0) - (b.round_no ?? 0);
    });
  }

  const catNameFor = (id: string): string => categories.find((c) => c.id === id)?.name ?? "—";

  if (courtKeys.length === 0) {
    return (
      <div className="card" style={{ padding: 24, color: "var(--muted-fg)", fontSize: 13 }}>
        Todavía no se asignan canchas a los partidos.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            color: "var(--fg)",
          }}
        >
          Calendario por cancha
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: 9999,
            background: "var(--muted)",
            color: "var(--muted-fg)",
          }}
        >
          {courtKeys.length} cancha{courtKeys.length === 1 ? "" : "s"}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          Todas las categorías
        </span>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {courtKeys.map((courtKey) => {
          const courtGames = byCourt.get(courtKey)!;
          const playedCount = courtGames.filter((g) => g.status === "played").length;
          return (
            <div
              key={courtKey}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "var(--muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <Icon name="map-pin" size={14} color="var(--muted-fg)" />
                <span
                  className="font-heading"
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
                  }}
                >
                  {courtKey === "none" ? "Sin cancha" : `Cancha ${courtKey}`}
                </span>
                <span style={{ flex: 1 }} />
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted-fg)",
                  }}
                >
                  {playedCount}/{courtGames.length}
                </span>
              </div>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {courtGames.map((g) => (
                  <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--muted-fg)",
                        }}
                      >
                        {roundLabel} {g.round_no ?? "—"}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: "var(--muted-fg)",
                          background: "var(--muted)",
                          padding: "2px 7px",
                          borderRadius: 9999,
                        }}
                      >
                        {catNameFor(g.category_id)}
                      </span>
                    </div>
                    <GameRow
                      game={g}
                      meUserId={meUserId}
                      nameFor={nameFor}
                      canManage={canManage}
                      onReportGame={onReportGame}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryGame({
  category,
  pairs,
  rounds,
  games,
  meUserId,
  matchMode,
  formatLabel,
  roundLabel,
  tableEntityLabel,
  standingsMode,
  canGenerateRound,
  canManualGame,
  targetPoints,
  nameFor,
  canManage,
  onReportGame,
  onGenerateRound,
  onCreateManualGame,
  onDeleteRound,
}: {
  category: GameViewCategory;
  pairs: GameViewPair[];
  rounds: GameViewRound[];
  games: GameViewGame[];
  meUserId: string | null;
  matchMode: "singles" | "doubles";
  formatLabel: string;
  roundLabel: string;
  tableEntityLabel: string;
  standingsMode: QuedadaStandingsMode;
  canGenerateRound: boolean;
  canManualGame: boolean;
  targetPoints: number;
  nameFor: (id: string) => string;
  canManage: boolean;
  onReportGame?: (gameId: string, pointsA: number, pointsB: number) => void;
  onGenerateRound?: (categoryId: string) => void;
  onCreateManualGame?: (args: { categoryId: string; sideA: string[]; sideB: string[]; courtNo: number | null }) => void;
  onDeleteRound?: (roundId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  // Colapso por ronda: la ronda terminada se contrae sola; la que está en juego
  // queda abierta. `openRounds[rn]` solo existe si el usuario lo cambió a mano.
  const [openRounds, setOpenRounds] = useState<Record<number, boolean>>({});
  const [manualA1, setManualA1] = useState("");
  const [manualA2, setManualA2] = useState("");
  const [manualB1, setManualB1] = useState("");
  const [manualB2, setManualB2] = useState("");
  const [manualCourt, setManualCourt] = useState("");

  // Jugadores inscritos de la categoría (desde sus slots/parejas).
  const playerIds = Array.from(
    new Set(
      pairs.flatMap((p) => [p.player_a_id, p.player_b_id]).filter((x): x is string => !!x),
    ),
  );

  const standings =
    standingsMode === "pair"
      ? pairStandings(games as GameForStandings[], pairs)
      : individualStandings(games as GameForStandings[], playerIds, nameFor);

  const roundNos = Array.from(new Set(rounds.map((r) => r.round_no))).sort((a, b) => a - b);
  const nextRoundNo = (roundNos.length ? Math.max(...roundNos) : 0) + 1;
  const playedCount = games.filter((g) => g.status === "played").length;
  const hasGames = games.length > 0;
  const submitManual = () => {
    if (!onCreateManualGame) return;
    const sideA = [manualA1, matchMode === "doubles" ? manualA2 : ""].filter(Boolean);
    const sideB = [manualB1, matchMode === "doubles" ? manualB2 : ""].filter(Boolean);
    if (sideA.length !== (matchMode === "doubles" ? 2 : 1) || sideB.length !== (matchMode === "doubles" ? 2 : 1)) return;
    onCreateManualGame({
      categoryId: category.id,
      sideA,
      sideB,
      courtNo: manualCourt.trim() ? parseInt(manualCourt, 10) : null,
    });
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      >
        <span
          className="font-heading"
          style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", color: "var(--fg)" }}
        >
          {category.name}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: 9999,
            background: "var(--muted)",
            color: "var(--muted-fg)",
          }}
        >
          A {targetPoints} pts
        </span>
        {hasGames && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "3px 9px",
              borderRadius: 9999,
              background: playedCount === games.length ? "var(--success-bg)" : "rgba(16,185,129,0.1)",
              color: playedCount === games.length ? "var(--success-fg)" : "var(--primary)",
            }}
          >
            {playedCount}/{games.length} jugados
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          style={{
            transition: "transform 200ms var(--ease-out)",
            transform: open ? "rotate(180deg)" : "none",
            display: "inline-flex",
            color: "var(--muted-fg)",
          }}
        >
          <Icon name="chevron-down" size={18} color="var(--muted-fg)" />
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms var(--ease-out)" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ paddingTop: 18 }}>
            {/* Calendario / rondas */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div className="label-mp">Calendario</div>
                {playerIds.length >= 2 && roundNos.length > 0 && (
                  <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                    {roundNos.length} {roundNos.length === 1 ? roundLabel.toLowerCase() : `${roundLabel.toLowerCase()}s`} · {formatLabel}
                  </span>
                )}
              </div>
              {canManage && canGenerateRound && onGenerateRound && (
                <button
                  type="button"
                  onClick={() => onGenerateRound(category.id)}
                  className="btn btn-primary"
                  style={{ alignSelf: "flex-start" }}
                >
                  <Icon name="arrow-right" size={13} color="#fff" /> Siguiente {roundLabel.toLowerCase()} {nextRoundNo}
                </button>
              )}
              {canManage && canManualGame && onCreateManualGame && (
                <div style={{ display: "grid", gap: 10, padding: 14, border: "1px solid var(--border)", borderRadius: 14, background: "var(--muted)" }}>
                  <div className="label-mp">Crear partido manual</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                    <ManualPlayerSelect label="Lado A" value={manualA1} onChange={setManualA1} playerIds={playerIds} nameFor={nameFor} />
                    {matchMode === "doubles" && <ManualPlayerSelect label="Pareja A" value={manualA2} onChange={setManualA2} playerIds={playerIds} nameFor={nameFor} />}
                    <ManualPlayerSelect label="Lado B" value={manualB1} onChange={setManualB1} playerIds={playerIds} nameFor={nameFor} />
                    {matchMode === "doubles" && <ManualPlayerSelect label="Pareja B" value={manualB2} onChange={setManualB2} playerIds={playerIds} nameFor={nameFor} />}
                    <input
                      value={manualCourt}
                      onChange={(e) => setManualCourt(e.target.value)}
                      type="number"
                      min={1}
                      placeholder="Cancha"
                      className="input"
                      style={{ minWidth: 0 }}
                    />
                  </div>
                  <button type="button" onClick={submitManual} className="btn btn-primary" style={{ justifySelf: "start" }}>
                    <Icon name="plus" size={13} color="#fff" /> Crear partido
                  </button>
                </div>
              )}
              {roundNos.length === 0 ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 14px", borderRadius: 14, border: "1px dashed var(--border)", background: "#fff", color: "var(--muted-fg)" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9999, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="calendar-clock" size={15} color="var(--muted-fg)" />
                  </span>
                  <span style={{ fontSize: 12, lineHeight: 1.45 }}>
                    <b style={{ display: "block", color: "var(--fg)", fontSize: 12.5, marginBottom: 2 }}>
                      {canManage ? "Sin partidos todavía" : "Tu calendario aún está vacío"}
                    </b>
                    {canManage
                      ? "Crea o genera el primer partido para activar la vista."
                      : "Cuando el organizador publique la ronda, tus partidos aparecerán aquí en tiempo real."}
                  </span>
                </div>
              ) : (
                roundNos
                  .slice()
                  .reverse()
                  .map((rn) => {
                    const round = rounds.find((r) => r.round_no === rn) ?? null;
                    const roundGames = games.filter((g) => g.round_no === rn);
                    const playedInRound = roundGames.filter((g) => g.status === "played").length;
                    const complete = roundGames.length > 0 && playedInRound === roundGames.length;
                    // Default: terminada → contraída; en juego → abierta. El usuario puede forzar.
                    const roundOpen = openRounds[rn] ?? !complete;
                    // Byes: jugadores de la categoría que no están en ningún game de la ronda.
                    const playing = new Set(
                      roundGames.flatMap((g) => [g.side_a_p1, g.side_a_p2, g.side_b_p1, g.side_b_p2]).filter((x): x is string => !!x),
                    );
                    const byes = playerIds.filter((id) => !playing.has(id));
                    return (
                      <div key={rn} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--muted)", borderBottom: roundOpen ? "1px solid var(--border)" : "0" }}>
                          <button
                            type="button"
                            onClick={() => setOpenRounds((s) => ({ ...s, [rn]: !(s[rn] ?? !complete) }))}
                            aria-expanded={roundOpen}
                            style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                          >
                            <span style={{ transition: "transform 200ms var(--ease-out)", transform: roundOpen ? "rotate(180deg)" : "none", display: "inline-flex", color: "var(--muted-fg)", flexShrink: 0 }}>
                              <Icon name="chevron-down" size={15} color="var(--muted-fg)" />
                            </span>
                            <span className="font-heading" style={{ fontSize: 12.5, fontWeight: 900, textTransform: "uppercase" }}>{roundLabel} {rn}</span>
                            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 9999, background: complete ? "var(--success-bg)" : "var(--color-mp-primary-light)", color: complete ? "var(--success-fg)" : "var(--color-mp-primary-active)", flexShrink: 0 }}>
                              {complete ? "Completa" : `${playedInRound}/${roundGames.length}`}
                            </span>
                          </button>
                          {canManage && onDeleteRound && round && (
                            <button
                              type="button"
                              onClick={() => onDeleteRound(round.id)}
                              aria-label="Borrar ronda"
                              style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", display: "inline-flex", padding: 2, flexShrink: 0 }}
                            >
                              <Icon name="trash-2" size={14} color="var(--muted-fg)" />
                            </button>
                          )}
                        </div>
                        <div style={{ display: "grid", gridTemplateRows: roundOpen ? "1fr" : "0fr", transition: "grid-template-rows 240ms var(--ease-out)" }}>
                          <div style={{ overflow: "hidden", minHeight: 0 }}>
                            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                              {roundGames.map((g) => (
                                <GameRow
                                  key={g.id}
                                  game={g}
                                  meUserId={meUserId}
                                  nameFor={nameFor}
                                  canManage={canManage}
                                  onReportGame={onReportGame}
                                />
                              ))}
                              {byes.length > 0 && (
                                <div style={{ fontSize: 11, color: "var(--muted-fg)", padding: "4px 2px" }}>
                                  Descansan: {byes.map(nameFor).join(", ")}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Tabla general */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="label-mp">Tabla general</div>
              <StandingsTable rows={standings} nameFor={nameFor} meUserId={meUserId} entityLabel={tableEntityLabel} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualPlayerSelect({
  label,
  value,
  onChange,
  playerIds,
  nameFor,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  playerIds: string[];
  nameFor: (id: string) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="input"
      style={{ minWidth: 0 }}
    >
      <option value="">{label}</option>
      {playerIds.map((id) => (
        <option key={id} value={id}>
          {nameFor(id)}
        </option>
      ))}
    </select>
  );
}

// Un game como scoreboard: lado A vs lado B, marcador grande si está jugado o
// inputs (organizador) / "Por jugar" (jugador) si está pendiente.
function GameRow({
  game,
  meUserId,
  nameFor,
  canManage,
  onReportGame,
}: {
  game: GameViewGame;
  meUserId: string | null;
  nameFor: (id: string) => string;
  canManage: boolean;
  onReportGame?: (gameId: string, pointsA: number, pointsB: number) => void;
}) {
  const sideA = [game.side_a_p1, game.side_a_p2].filter((x): x is string => !!x);
  const sideB = [game.side_b_p1, game.side_b_p2].filter((x): x is string => !!x);
  const mine = meUserId != null && [...sideA, ...sideB].includes(meUserId);
  const played = game.status === "played";
  const labelA = sideA.map(nameFor).join(" + ");
  const labelB = sideB.map(nameFor).join(" + ");

  const [a, setA] = useState(game.points_a != null ? String(game.points_a) : "");
  const [b, setB] = useState(game.points_b != null ? String(game.points_b) : "");

  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const aWins = played && (game.points_a ?? 0) > (game.points_b ?? 0);
  const bWins = played && (game.points_b ?? 0) > (game.points_a ?? 0);

  const editable = canManage && !!onReportGame;

  const report = () => {
    if (!onReportGame) return;
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return;
    onReportGame(game.id, na, nb);
  };

  const nameRow = (name: string, win: boolean, score: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: win ? 900 : 700, color: win ? "var(--color-mp-primary-active)" : "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {score}
    </div>
  );

  const scoreBox = (val: string, set: (v: string) => void, win: boolean, label: string) => (
    <input
      value={val}
      onChange={(e) => set(e.target.value)}
      type="number"
      min={0}
      placeholder="–"
      aria-label={label}
      className="font-heading tabular"
      style={{
        width: 60,
        height: 52,
        flexShrink: 0,
        textAlign: "center",
        border: win ? "2px solid var(--primary)" : "1.5px solid var(--border)",
        borderRadius: 12,
        fontSize: 24,
        fontWeight: 900,
        fontFamily: "inherit",
        outline: "none",
        background: win ? "var(--color-mp-primary-light)" : "#fff",
        color: win ? "var(--color-mp-primary-active)" : "var(--fg)",
      }}
    />
  );

  const staticScore = (val: number | null, win: boolean) => (
    <span className="font-heading tabular" style={{ flexShrink: 0, width: 44, textAlign: "center", fontSize: 22, fontWeight: 900, color: win ? "var(--color-mp-primary-active)" : "var(--fg)" }}>
      {val ?? "–"}
    </span>
  );

  const showMeta = game.court_no != null || mine;

  return (
    <div
      style={{
        borderRadius: 12,
        border: mine ? "1.5px solid var(--primary)" : "1px solid var(--border)",
        background: played ? "rgba(16,185,129,0.08)" : mine ? "var(--color-mp-primary-light)" : "#fff",
        overflow: "hidden",
      }}
    >
      {showMeta && (
        <div
          style={{
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {game.court_no != null && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted-fg)",
              }}
            >
              Cancha {game.court_no}
            </span>
          )}
          {mine && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--primary)",
                background: "rgba(16,185,129,0.08)",
                padding: "2px 7px",
                borderRadius: 9999,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--primary)",
                }}
              />
              Tú juegas
            </span>
          )}
          {played && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--success-fg)",
              }}
            >
              Jugado
            </span>
          )}
        </div>
      )}

      <div>
        {editable ? (
          <>
            {nameRow(labelA, aWins, scoreBox(a, setA, aWins, "Puntos lado A"))}
            <div style={{ borderTop: "1px solid var(--border-subtle)" }} />
            {nameRow(labelB, bWins, scoreBox(b, setB, bWins, "Puntos lado B"))}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--muted)",
              }}
            >
              <button
                type="button"
                onClick={report}
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 12px" }}
              >
                <Icon name="check" size={12} /> {played ? "Actualizar" : "Guardar"}
              </button>
            </div>
          </>
        ) : (
          <>
            {nameRow(labelA, aWins, played ? staticScore(game.points_a, aWins) : null)}
            <div style={{ borderTop: "1px solid var(--border-subtle)" }} />
            {nameRow(labelB, bWins, played ? staticScore(game.points_b, bWins) : null)}
            {!played && !showMeta && (
              <div
                style={{
                  padding: "6px 12px",
                  borderTop: "1px solid var(--border-subtle)",
                  background: "var(--muted)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted-fg)",
                  }}
                >
                  Por jugar
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STANDINGS_COLS = "26px minmax(0, 1fr) 28px 28px 34px 42px";
function StandingsTable({
  rows,
  nameFor,
  meUserId,
  entityLabel,
}: {
  rows: { userId: string; played: number; wins: number; pf: number; diff: number; playerIds?: string[] }[];
  nameFor: (id: string) => string;
  meUserId: string | null;
  entityLabel: string;
}) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Aún no hay jugadores.</div>;
  }
  const head: { k: string; t: string; title: string; align: "center" | "right" }[] = [
    { k: "pj", t: "PJ", title: "Partidos jugados", align: "center" },
    { k: "g", t: "G", title: "Ganados", align: "center" },
    { k: "pf", t: "PF", title: "Puntos a favor", align: "center" },
    { k: "dif", t: "DIF", title: "Diferencia (PF−PC)", align: "right" },
  ];
  return (
    <div className="min-w-0 w-full max-w-full" style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div className="mp-table-scroll">
        <div style={{ width: "100%", minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: STANDINGS_COLS, gap: 6, padding: "6px 11px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>
            <span>#</span>
            <span>{entityLabel}</span>
            {head.map((h) => (
              <span key={h.k} title={h.title} style={{ textAlign: h.align }}>{h.t}</span>
            ))}
          </div>
          {rows.map((r, i) => {
            const playerIds = r.playerIds ?? [r.userId];
            const isMe = meUserId != null && playerIds.includes(meUserId);
            const label = playerIds.map(nameFor).join(" + ");
            return (
              <div
                key={r.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: STANDINGS_COLS,
                  gap: 6,
                  alignItems: "center",
                  padding: "7px 11px",
                  fontSize: 12,
                  background: isMe
                    ? "var(--color-mp-primary-light)"
                    : i === 0
                      ? "var(--muted)"
                      : "transparent",
                }}
              >
                <span className="font-heading tabular" style={{ fontWeight: 900, color: i === 0 ? "var(--color-mp-primary-active)" : "var(--muted-fg)" }}>{i + 1}</span>
                <span style={{ minWidth: 0, fontWeight: isMe ? 900 : 700, color: isMe ? "var(--color-mp-primary-active)" : "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{r.played}</span>
                <span className="font-heading tabular" style={{ textAlign: "center", fontWeight: 900 }}>{r.wins}</span>
                <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{r.pf}</span>
                <span className="tabular" style={{ textAlign: "right", fontWeight: 700, color: r.diff > 0 ? "var(--color-mp-primary-active)" : r.diff < 0 ? "var(--destructive-fg)" : "var(--muted-fg)" }}>{r.diff > 0 ? `+${r.diff}` : r.diff}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
