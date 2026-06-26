"use client";
// Bracket compartido entre partner, jugador y admin. Tarjetas claras sobre fondo
// suave del dashboard, score grande a la derecha, ganador resaltado y líneas que
// conectan rondas.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ScoreMatchCard } from "./ScoreMatchCard";

const BK_ZOOM_MIN = 0.65;
const BK_ZOOM_MAX = 1.75;
const BK_ZOOM_STEP = 0.1;
const BK_ZOOM_DEFAULT = 1;
const BK_VIEW_PAD = 40;

type BkSize = { w: number; h: number };

function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  tree: BkSize,
  viewport: BkSize,
): { x: number; y: number } {
  if (tree.w <= 0 || tree.h <= 0 || viewport.w <= 0 || viewport.h <= 0) return pan;

  const cw = tree.w * zoom;
  const ch = tree.h * zoom;
  const pad = BK_VIEW_PAD;

  const clampAxis = (p: number, content: number, view: number) => {
    if (content <= view - pad * 2) return (view - content) / 2;
    const min = view - content - pad;
    const max = pad;
    return Math.min(max, Math.max(min, p));
  };

  return {
    x: clampAxis(pan.x, cw, viewport.w),
    y: clampAxis(pan.y, ch, viewport.h),
  };
}

function centerPan(zoom: number, tree: BkSize, viewport: BkSize): { x: number; y: number } {
  return clampPan(
    { x: (viewport.w - tree.w * zoom) / 2, y: (viewport.h - tree.h * zoom) / 2 },
    zoom,
    tree,
    viewport,
  );
}

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
  /** Partner puede cargar sets en partidos pendientes. */
  reportable?: boolean;
  /** Partner puede corregir marcador ya reportado. */
  correctable?: boolean;
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
  thirdPlaceMatch?: BracketNode | null;
  /** Partner: guarda sets ganados directo desde la tarjeta. */
  onScoreSubmit?: (matchId: string, setsA: number, setsB: number) => void;
  reportingMatchId?: string | null;
};

function clampZoom(value: number): number {
  return Math.min(BK_ZOOM_MAX, Math.max(BK_ZOOM_MIN, Math.round(value * 100) / 100));
}

function isPanBlockTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("input, button, a, textarea, select");
}

function BracketZoomToolbar({
  zoom,
  onZoomChange,
  onReset,
}: {
  zoom: number;
  onZoomChange: (next: number) => void;
  onReset: () => void;
}) {
  const pct = Math.round(zoom * 100);
  return (
    <div className="mp-bk-toolbar">
      <span className="mp-bk-toolbar-label">Zoom del cuadro</span>
      <div className="mp-bk-toolbar-controls" role="group" aria-label="Zoom del cuadro">
        <button
          type="button"
          className="btn btn-outline btn-sm mp-bk-zoom-btn"
          disabled={zoom <= BK_ZOOM_MIN}
          aria-label="Alejar cuadro"
          onClick={() => onZoomChange(clampZoom(zoom - BK_ZOOM_STEP))}
        >
          <Icon name="minus" size={12} />
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm mp-bk-zoom-btn mp-bk-zoom-pct"
          aria-label={`Zoom ${pct} por ciento. Restablecer`}
          onClick={onReset}
        >
          {pct}%
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm mp-bk-zoom-btn"
          disabled={zoom >= BK_ZOOM_MAX}
          aria-label="Acercar cuadro"
          onClick={() => onZoomChange(clampZoom(zoom + BK_ZOOM_STEP))}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>
    </div>
  );
}

export function BracketView({ columns, champion, thirdPlaceMatch, onScoreSubmit, reportingMatchId }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(BK_ZOOM_DEFAULT);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [treeSize, setTreeSize] = useState<BkSize>({ w: 0, h: 0 });
  const [viewportSize, setViewportSize] = useState<BkSize>({ w: 0, h: 0 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const treeSizeRef = useRef(treeSize);
  const viewportSizeRef = useRef(viewportSize);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const didCenterRef = useRef(false);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    treeSizeRef.current = treeSize;
  }, [treeSize]);
  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  const setPanClamped = useCallback((next: { x: number; y: number }, z = zoomRef.current) => {
    setPan(clampPan(next, z, treeSizeRef.current, viewportSizeRef.current));
  }, []);

  useEffect(() => {
    didCenterRef.current = false;
  }, [columns, champion]);

  useEffect(() => {
    const measure = () => {
      const vp = viewportRef.current;
      const tree = treeRef.current;
      if (vp) setViewportSize({ w: vp.clientWidth, h: vp.clientHeight });
      if (tree) setTreeSize({ w: tree.offsetWidth, h: tree.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    if (treeRef.current) ro.observe(treeRef.current);
    return () => ro.disconnect();
  }, [columns, champion]);

  useEffect(() => {
    if (didCenterRef.current || treeSize.w <= 0 || viewportSize.w <= 0) return;
    didCenterRef.current = true;
    setPan(centerPan(BK_ZOOM_DEFAULT, treeSize, viewportSize));
  }, [treeSize, viewportSize]);

  useEffect(() => {
    if (treeSize.w <= 0 || viewportSize.w <= 0) return;
    setPanClamped(panRef.current);
  }, [treeSize, viewportSize, zoom, setPanClamped]);

  const applyZoomAt = useCallback(
    (nextZoom: number, anchorX: number, anchorY: number) => {
      const z = clampZoom(nextZoom);
      const p = panRef.current;
      const worldX = (anchorX - p.x) / zoomRef.current;
      const worldY = (anchorY - p.y) / zoomRef.current;
      setPanClamped({ x: anchorX - worldX * z, y: anchorY - worldY * z }, z);
      setZoom(z);
    },
    [setPanClamped],
  );

  const zoomFromViewportCenter = useCallback(
    (nextZoom: number) => {
      const el = viewportRef.current;
      if (!el) {
        setZoom(clampZoom(nextZoom));
        return;
      }
      const rect = el.getBoundingClientRect();
      applyZoomAt(nextZoom, rect.width / 2, rect.height / 2);
    },
    [applyZoomAt],
  );

  const resetView = useCallback(() => {
    setZoom(BK_ZOOM_DEFAULT);
    if (treeSizeRef.current.w > 0 && viewportSizeRef.current.w > 0) {
      setPan(centerPan(BK_ZOOM_DEFAULT, treeSizeRef.current, viewportSizeRef.current));
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setSpaceDown(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchorX = e.clientX - rect.left;
      const anchorY = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0018);
      applyZoomAt(zoomRef.current * factor, anchorX, anchorY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoomAt]);

  const canStartPan = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1) return true;
      if (e.button !== 0) return false;
      if (spaceDown) return !isPanBlockTarget(e.target);
      if (isPanBlockTarget(e.target)) return false;
      if (!(e.target instanceof Element)) return true;
      return !e.target.closest(".mp-bk-match, .mp-bk-champion");
    },
    [spaceDown],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canStartPan(e)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    setIsPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPanClamped({
      x: drag.panX + (e.clientX - drag.x),
      y: drag.panY + (e.clientY - drag.y),
    });
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsPanning(false);
    setPanClamped(panRef.current);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

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
    <div className="mp-bk-scroll">
      <div className="mp-bk-scroll-head">
        <p className="mp-bk-scroll-hint">Rueda para zoom · Arrastra el fondo para mover · Espacio + arrastrar en cualquier parte</p>
        <BracketZoomToolbar
          zoom={zoom}
          onZoomChange={zoomFromViewportCenter}
          onReset={resetView}
        />
      </div>
      <div
        ref={viewportRef}
        className={`mp-bk-viewport${isPanning ? " is-panning" : ""}${spaceDown ? " is-space-pan" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className="mp-bk-canvas"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <div className="mp-bk-tree" ref={treeRef}>
        {columns.map((col, i) => {
          const conn = connectorClass(i, counts[i - 1] ?? 0, counts[i]);
          return (
            <div key={col.label + i} className={`mp-bk-round ${conn}`}>
              <div className="mp-bk-round-label">{col.label}</div>
              <div className="mp-bk-cells">
                {col.matches.map((m, j) => (
                  <div key={m.id || j} className="mp-bk-cell">
                    <ScoreMatchCard
                      matchId={m.id}
                      labelA={m.a.label}
                      labelB={m.b.label}
                      scoreA={m.a.score}
                      scoreB={m.b.score}
                      winnerSide={m.a.isWinner ? "a" : m.b.isWinner ? "b" : null}
                      editable={!!m.reportable && !!onScoreSubmit}
                      correctable={!!m.correctable && !!onScoreSubmit}
                      busy={reportingMatchId === m.id}
                      live={m.live}
                      highlight={m.highlight}
                      dimmed={m.dimmed}
                      meta={m.meta}
                      onScoreSubmit={onScoreSubmit}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {thirdPlaceMatch && (
          <div className="mp-bk-round is-straight">
            <div className="mp-bk-round-label">3er puesto</div>
            <div className="mp-bk-cells">
              <div className="mp-bk-cell">
                <ScoreMatchCard
                  matchId={thirdPlaceMatch.id}
                  labelA={thirdPlaceMatch.a.label}
                  labelB={thirdPlaceMatch.b.label}
                  scoreA={thirdPlaceMatch.a.score}
                  scoreB={thirdPlaceMatch.b.score}
                  winnerSide={
                    thirdPlaceMatch.a.isWinner ? "a" : thirdPlaceMatch.b.isWinner ? "b" : null
                  }
                  editable={!!thirdPlaceMatch.reportable && !!onScoreSubmit}
                  correctable={!!thirdPlaceMatch.correctable && !!onScoreSubmit}
                  busy={reportingMatchId === thirdPlaceMatch.id}
                  live={thirdPlaceMatch.live}
                  dimmed={thirdPlaceMatch.dimmed}
                  meta={thirdPlaceMatch.meta}
                  onScoreSubmit={onScoreSubmit}
                />
              </div>
            </div>
          </div>
        )}

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
      </div>
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
