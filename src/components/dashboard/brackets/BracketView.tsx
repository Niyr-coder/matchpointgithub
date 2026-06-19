"use client";
// Bracket compartido entre partner, jugador y admin. Tarjetas claras sobre fondo
// suave del dashboard, score grande a la derecha, ganador resaltado y líneas que
// conectan rondas.
import { Icon } from "@/components/Icon";

export type BracketSeat = {
  label: string;
  score?: number | string | null;
  isWinner?: boolean;
};

export type BracketNode = {
  id: string;
  a: BracketSeat;
  b: BracketSeat;
  live?: boolean;
  reportable?: boolean;
  /** Atenúa la tarjeta (placeholder / aún sin definir). */
  dimmed?: boolean;
  /** Resalta la tarjeta (ej. "tu partido" en la vista del jugador). */
  highlight?: boolean;
  /** Línea inferior opcional (horario, estado). */
  meta?: string | null;
};

export type BracketColumn = {
  label: string;
  matches: BracketNode[];
};

export type BracketChampion = {
  label: string;
  decided: boolean;
  when?: string | null;
};

type Props = {
  columns: BracketColumn[];
  champion?: BracketChampion | null;
  onReport?: (matchId: string) => void;
};

function hasScore(s: BracketSeat["score"]): boolean {
  return s != null && s !== "" && s !== "-";
}

export function BracketView({ columns, champion, onReport }: Props) {
  // Cada columna (salvo la primera) dibuja su conector de entrada. Si la ronda
  // previa tiene exactamente el doble de partidos → conector "par" (junta dos
  // en uno). Si tiene el mismo número → conector recto (1→1).
  const counts = columns.map((c) => c.matches.length);
  const championCount = 1;

  const connectorClass = (i: number, prevCount: number, thisCount: number): string => {
    if (i === 0) return "";
    return prevCount === thisCount * 2 ? "is-pair" : "is-straight";
  };

  return (
    <div className="mp-bk-scroll mp-subtle-hscroll">
      <p className="mp-bk-scroll-hint">Desliza horizontalmente para ver todo el cuadro</p>
      <div className="mp-bk-tree">
        {columns.map((col, i) => {
          const conn = connectorClass(i, counts[i - 1] ?? 0, counts[i]);
          return (
            <div key={col.label + i} className={`mp-bk-round ${conn}`}>
              <div className="mp-bk-round-label">{col.label}</div>
              <div className="mp-bk-cells">
                {col.matches.map((m, j) => (
                  <div key={m.id || j} className="mp-bk-cell">
                    <MatchCard node={m} onReport={onReport} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {champion && (
          <div
            className={`mp-bk-round ${
              (counts[counts.length - 1] ?? 0) === championCount * 2 ? "is-pair" : "is-straight"
            }`}
          >
            <div className="mp-bk-round-label">Campeón</div>
            <div className="mp-bk-cells">
              <div className="mp-bk-cell">
                <ChampionCard champion={champion} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchCard({
  node,
  onReport,
}: {
  node: BracketNode;
  onReport?: (matchId: string) => void;
}) {
  return (
    <div
      className={`mp-bk-match${node.live ? " is-live" : ""}${node.dimmed ? " is-dimmed" : ""}${
        node.highlight ? " is-mine" : ""
      }`}
    >
      {node.live && <span className="mp-bk-live">● LIVE</span>}
      {node.highlight && !node.live && <span className="mp-bk-mine-tag">TÚ</span>}
      <SeatRow seat={node.a} />
      <div className="mp-bk-seat-divider" />
      <SeatRow seat={node.b} />
      {node.meta && <div className="mp-bk-meta">{node.meta}</div>}
      {node.reportable && onReport && (
        <button type="button" className="mp-bk-report" onClick={() => onReport(node.id)}>
          <Icon name="pencil" size={11} color="var(--fg)" />
          Reportar
        </button>
      )}
    </div>
  );
}

function SeatRow({ seat }: { seat: BracketSeat }) {
  const winner = !!seat.isWinner;
  return (
    <div className={`mp-bk-seat${winner ? " is-winner" : ""}`}>
      <span className="mp-bk-seat-name">
        {winner && <span className="mp-bk-seat-dot" />}
        {seat.label}
      </span>
      {hasScore(seat.score) && <span className="mp-bk-seat-score">{seat.score}</span>}
    </div>
  );
}

function ChampionCard({ champion }: { champion: BracketChampion }) {
  return (
    <div className={`mp-bk-champion${champion.decided ? " is-decided" : ""}`}>
      <Icon
        name="trophy"
        size={22}
        color={champion.decided ? "#d97706" : "var(--muted-fg)"}
      />
      <div className="mp-bk-champion-label">{champion.label}</div>
      {champion.when && <div className="mp-bk-champion-when">{champion.when}</div>}
    </div>
  );
}
