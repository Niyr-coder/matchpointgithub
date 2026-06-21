"use client";

import { useEffect, useState } from "react";

export type ScoreMatchCardProps = {
  matchId: string;
  labelA: string;
  labelB: string;
  scoreA?: number | string | null;
  scoreB?: number | string | null;
  winnerSide?: "a" | "b" | null;
  editable?: boolean;
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

  useEffect(() => {
    setSetsA(hasScore(scoreA) ? String(scoreA) : "");
    setSetsB(hasScore(scoreB) ? String(scoreB) : "");
    setTouched(false);
  }, [matchId, scoreA, scoreB]);

  const trySubmit = () => {
    if (!editable || busy) return;
    const a = Number(setsA);
    const b = Number(setsB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a === b) return;
    onScoreSubmit?.(matchId, a, b);
  };

  const onBlurCard = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!editable || busy || !touched) return;
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      trySubmit();
    }
  };

  return (
    <div
      className={`mp-bk-match${live ? " is-live" : ""}${dimmed ? " is-dimmed" : ""}${
        highlight ? " is-mine" : ""
      }${editable ? " is-editable" : ""}${busy ? " is-saving" : ""}`}
      onBlur={editable ? onBlurCard : undefined}
    >
      {live && <span className="mp-bk-live">● LIVE</span>}
      {highlight && !live && <span className="mp-bk-mine-tag">TÚ</span>}
      <SeatRow
        label={labelA}
        isWinner={winnerSide === "a"}
        editable={editable}
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
        editable={editable}
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
