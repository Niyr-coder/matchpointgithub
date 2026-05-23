// Vista de "Juego" del formato AMERICANO (compartida entre el panel del
// organizador y la pantalla del jugador). Es player-céntrica: por cada categoría
// muestra el calendario de rondas (cada game como scoreboard) y la tabla general
// (ranking individual con `individualStandings`).
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

// ── Tipos del payload ─────────────────────────────────────────────────────────
export type GameViewCategory = {
  id: string;
  name: string;
  level_label: string | null;
  starts_at: string | null;
  target_points: number | null;
  sort_order: number;
};
export type GameViewPair = {
  id: string;
  category_id: string;
  slot_no: number;
  player_a_id: string;
  player_b_id: string | null;
};
export type GameViewParticipant = {
  user_id: string;
  status?: string;
  final_rank?: number | null;
  profiles: { display_name: string | null; username: string | null } | null;
};
export type GameViewRound = {
  id: string;
  category_id: string;
  round_no: number;
  status: string; // 'scheduled' | 'active' | 'done'
};
export type GameViewGame = {
  id: string;
  category_id: string;
  round_id: string | null;
  round_no: number | null;
  court_no: number | null;
  side_a_p1: string;
  side_a_p2: string | null;
  side_b_p1: string;
  side_b_p2: string | null;
  points_a: number | null;
  points_b: number | null;
  status: string; // 'scheduled' | 'played'
};

type Props = {
  categories: GameViewCategory[];
  pairs: GameViewPair[];
  participants: GameViewParticipant[];
  rounds: GameViewRound[];
  games: GameViewGame[];
  meUserId: string | null;
  matchMode: "singles" | "doubles";
  quedadaTargetPoints: number | null;
  canManage: boolean;
  onReportGame?: (gameId: string, pointsA: number, pointsB: number) => void;
  onGenerateRound?: (categoryId: string) => void;
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
  rounds,
  games,
  meUserId,
  quedadaTargetPoints,
  canManage,
  onReportGame,
  onGenerateRound,
  onDeleteRound,
}: Props) {
  // Solo categorías con jugadores asignados (parejas/slots).
  const cats = categories
    .filter((c) => pairs.some((p) => p.category_id === c.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  const partById = new Map(participants.map((p) => [p.user_id, p]));
  const nameFor = (id: string): string => nameOf(partById.get(id)?.profiles ?? null);

  if (cats.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>
        {canManage
          ? "Asigna jugadores a las categorías (pestaña Parejas) para generar rondas."
          : "El organizador todavía no asignó jugadores a las categorías."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {cats.map((c) => (
        <CategoryGame
          key={c.id}
          category={c}
          pairs={pairs.filter((p) => p.category_id === c.id)}
          rounds={rounds.filter((r) => r.category_id === c.id)}
          games={games.filter((g) => g.category_id === c.id)}
          meUserId={meUserId}
          targetPoints={c.target_points ?? quedadaTargetPoints ?? 24}
          nameFor={nameFor}
          canManage={canManage}
          onReportGame={onReportGame}
          onGenerateRound={onGenerateRound}
          onDeleteRound={onDeleteRound}
        />
      ))}
    </div>
  );
}

function CategoryGame({
  category,
  pairs,
  rounds,
  games,
  meUserId,
  targetPoints,
  nameFor,
  canManage,
  onReportGame,
  onGenerateRound,
  onDeleteRound,
}: {
  category: GameViewCategory;
  pairs: GameViewPair[];
  rounds: GameViewRound[];
  games: GameViewGame[];
  meUserId: string | null;
  targetPoints: number;
  nameFor: (id: string) => string;
  canManage: boolean;
  onReportGame?: (gameId: string, pointsA: number, pointsB: number) => void;
  onGenerateRound?: (categoryId: string) => void;
  onDeleteRound?: (roundId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  // Colapso por ronda: la ronda terminada se contrae sola; la que está en juego
  // queda abierta. `openRounds[rn]` solo existe si el usuario lo cambió a mano.
  const [openRounds, setOpenRounds] = useState<Record<number, boolean>>({});

  // Jugadores inscritos de la categoría (desde sus slots/parejas).
  const playerIds = Array.from(
    new Set(
      pairs.flatMap((p) => [p.player_a_id, p.player_b_id]).filter((x): x is string => !!x),
    ),
  );

  const standings = individualStandings(
    games as GameForStandings[],
    playerIds,
    nameFor,
  );

  const roundNos = Array.from(new Set(rounds.map((r) => r.round_no))).sort((a, b) => a - b);
  const nextRoundNo = (roundNos.length ? Math.max(...roundNos) : 0) + 1;
  const playedCount = games.filter((g) => g.status === "played").length;
  const hasGames = games.length > 0;

  return (
    <div className="card" style={{ padding: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      >
        <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.01em" }}>
          {category.name}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)" }}>A {targetPoints} puntos</span>
        {hasGames && (
          <span style={{ fontSize: 10.5, fontWeight: 900, padding: "2px 8px", borderRadius: 9999, background: "var(--muted)", color: "var(--muted-fg)" }}>
            {playedCount}/{games.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ transition: "transform 200ms var(--ease-out)", transform: open ? "rotate(180deg)" : "none", display: "inline-flex", color: "var(--muted-fg)" }}>
          <Icon name="chevron-down" size={16} color="var(--muted-fg)" />
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms var(--ease-out)" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
            {/* Calendario / rondas */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="label-mp">Calendario</div>
              {playerIds.length >= 2 && (
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: -4 }}>
                  Llevas <b style={{ color: "var(--fg)" }}>{roundNos.length}</b> {roundNos.length === 1 ? "ronda" : "rondas"} · un americano completo son ~<b style={{ color: "var(--fg)" }}>{playerIds.length - 1}</b> (referencia, no es un límite)
                </div>
              )}
              {canManage && onGenerateRound && (
                <button
                  type="button"
                  onClick={() => onGenerateRound(category.id)}
                  className="btn btn-primary"
                  style={{ alignSelf: "flex-start" }}
                >
                  <Icon name="shuffle" size={13} color="#fff" /> Generar ronda {nextRoundNo}
                </button>
              )}
              {roundNos.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                  {canManage ? "Todavía no hay rondas. Genera la primera." : "Todavía no hay rondas generadas."}
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
                            <span className="font-heading" style={{ fontSize: 12.5, fontWeight: 900, textTransform: "uppercase" }}>Ronda {rn}</span>
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
              <StandingsTable rows={standings} nameFor={nameFor} meUserId={meUserId} />
            </div>
          </div>
        </div>
      </div>
    </div>
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

  return (
    <div
      style={{
        borderRadius: 12,
        border: mine ? "1.5px solid var(--primary)" : "1px solid var(--border)",
        background: played ? "var(--success-bg)" : mine ? "var(--color-mp-primary-light)" : "#fff",
        overflow: "hidden",
      }}
    >
      {game.court_no != null && (
        <div style={{ padding: "5px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Cancha {game.court_no}</span>
          {mine && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-mp-primary-active)" }}>· Tú juegas</span>}
        </div>
      )}
      {editable ? (
        <>
          {nameRow(labelA, aWins, scoreBox(a, setA, aWins, "Puntos lado A"))}
          <div style={{ borderTop: "1px solid var(--border)" }} />
          {nameRow(labelB, bWins, scoreBox(b, setB, bWins, "Puntos lado B"))}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: "1px solid var(--border)", background: played ? "transparent" : "var(--muted)" }}>
            {played && <span style={{ flex: 1, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--success-fg)" }}>Jugado</span>}
            <button type="button" onClick={report} className="btn" style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 12px" }}>
              <Icon name="check" size={12} /> {played ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </>
      ) : (
        <>
          {nameRow(labelA, aWins, played ? staticScore(game.points_a, aWins) : null)}
          <div style={{ borderTop: "1px solid var(--border)" }} />
          {nameRow(labelB, bWins, played ? staticScore(game.points_b, bWins) : null)}
          {!played && (
            <div style={{ padding: "6px 12px", borderTop: "1px solid var(--border)", background: "var(--muted)" }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Por jugar</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const STANDINGS_COLS = "26px minmax(96px,1fr) 30px 30px 40px 48px";
function StandingsTable({
  rows,
  nameFor,
  meUserId,
}: {
  rows: { userId: string; played: number; wins: number; pf: number; diff: number }[];
  nameFor: (id: string) => string;
  meUserId: string | null;
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
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 320 }}>
          <div style={{ display: "grid", gridTemplateColumns: STANDINGS_COLS, gap: 6, padding: "6px 11px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>
            <span>#</span>
            <span>Jugador</span>
            {head.map((h) => (
              <span key={h.k} title={h.title} style={{ textAlign: h.align }}>{h.t}</span>
            ))}
          </div>
          {rows.map((r, i) => {
            const isMe = meUserId != null && r.userId === meUserId;
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
                  background: isMe ? "var(--color-mp-primary-light)" : i === 0 ? "var(--muted)" : "transparent",
                }}
              >
                <span className="font-heading tabular" style={{ fontWeight: 900, color: i === 0 ? "var(--color-mp-primary-active)" : "var(--muted-fg)" }}>{i + 1}</span>
                <span style={{ minWidth: 0, fontWeight: isMe ? 900 : 700, color: isMe ? "var(--color-mp-primary-active)" : "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameFor(r.userId)}</span>
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
