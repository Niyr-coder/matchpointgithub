"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

export type ScoreMatchCardProps = {
  matchId: string;
  labelA: string;
  labelB: string;
  scoreA?: number | string | null;
  scoreB?: number | string | null;
  winnerSide?: "a" | "b" | null;
  editable?: boolean;
  /** Partido ya reportado: permite entrar en modo corrección. */
  correctable?: boolean;
  busy?: boolean;
  live?: boolean;
  highlight?: boolean;
  dimmed?: boolean;
  meta?: string | null;
  onScoreSubmit?: (matchId: string, setsA: number, setsB: number) => void;
};

function hasScore(s: number | string | null | undefined): boolean {
  return s != null && s !== "" && s !== "-";
}

export function ScoreMatchCard({
  matchId,
  labelA,
  labelB,
  scoreA,
  scoreB,
  winnerSide,
  editable = false,
  correctable = false,
  busy = false,
  live = false,
  highlight = false,
  dimmed = false,
  meta,
  onScoreSubmit,
}: ScoreMatchCardProps) {
  const [setsA, setSetsA] = useState("");
  const [setsB, setSetsB] = useState("");
  const [touched, setTouched] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);

  useEffect(() => {
    setSetsA(hasScore(scoreA) ? String(scoreA) : "");
    setSetsB(hasScore(scoreB) ? String(scoreB) : "");
    setTouched(false);
    setCorrectionMode(false);
  }, [matchId, scoreA, scoreB]);

  const inputMode = editable || correctionMode;

  const trySubmit = () => {
    if (!inputMode || busy) return;
    const a = Number(setsA);
    const b = Number(setsB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a === b) return;
    onScoreSubmit?.(matchId, a, b);
  };

  const onBlurCard = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!inputMode || busy || !touched) return;
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      trySubmit();
    }
  };

  return (
    <div
      className={`mp-bk-match${live ? " is-live" : ""}${dimmed && !correctionMode ? " is-dimmed" : ""}${
        highlight ? " is-mine" : ""
      }${inputMode ? " is-editable" : ""}${busy ? " is-saving" : ""}${
        correctionMode ? " is-correcting" : ""
      }`}
      onBlur={inputMode ? onBlurCard : undefined}
    >
      {live && <span className="mp-bk-live">● LIVE</span>}
      {highlight && !live && <span className="mp-bk-mine-tag">TÚ</span>}
      <SeatRow
        label={labelA}
        isWinner={winnerSide === "a"}
        editable={inputMode}
        value={setsA}
        displayScore={scoreA}
        disabled={busy}
        inputId={`score-a-${matchId}`}
        onChange={(v) => {
          setTouched(true);
          setSetsA(v);
        }}
        onEnter={trySubmit}
      />
      <div className="mp-bk-seat-divider" />
      <SeatRow
        label={labelB}
        isWinner={winnerSide === "b"}
        editable={inputMode}
        value={setsB}
        displayScore={scoreB}
        disabled={busy}
        inputId={`score-b-${matchId}`}
        onChange={(v) => {
          setTouched(true);
          setSetsB(v);
        }}
        onEnter={trySubmit}
      />
      {meta && <div className="mp-bk-meta">{meta}</div>}
      {correctable && !editable && !correctionMode && (
        <button
          type="button"
          className="mp-bk-correct-btn"
          disabled={busy}
          onClick={() => setCorrectionMode(true)}
        >
          <Icon name="pencil" size={11} />
          Corregir marcador
        </button>
      )}
      {correctionMode && (
        <div className="mp-bk-correct-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={trySubmit}
          >
            Guardar corrección
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={() => {
              setCorrectionMode(false);
              setSetsA(hasScore(scoreA) ? String(scoreA) : "");
              setSetsB(hasScore(scoreB) ? String(scoreB) : "");
              setTouched(false);
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function SeatRow({
  label,
  isWinner,
  editable,
  value,
  disabled,
  inputId,
  displayScore,
  onChange,
  onEnter,
}: {
  label: string;
  isWinner?: boolean;
  editable?: boolean;
  value?: string;
  disabled?: boolean;
  inputId?: string;
  displayScore?: number | string | null;
  onChange?: (value: string) => void;
  onEnter?: () => void;
}) {
  return (
    <div className={`mp-bk-seat${isWinner ? " is-winner" : ""}`}>
      <span className="mp-bk-seat-name">
        {isWinner && <span className="mp-bk-seat-dot" />}
        {label}
      </span>
      {editable ? (
        <input
          id={inputId}
          type="number"
          min={0}
          inputMode="numeric"
          className="mp-input mp-bk-score-input"
          value={value ?? ""}
          disabled={disabled}
          placeholder="0"
          aria-label={`Sets de ${label}`}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
        />
      ) : (
        hasScore(displayScore) && (
          <span className="mp-bk-seat-score">{displayScore}</span>
        )
      )}
    </div>
  );
}
