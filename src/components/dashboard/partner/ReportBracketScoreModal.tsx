"use client";

import { Icon } from "@/components/Icon";

type Props = {
  open: boolean;
  busy?: boolean;
  setsA: string;
  setsB: string;
  onSetsA: (value: string) => void;
  onSetsB: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

/** Modal de reporte de sets — tokens mp-modal-*, mp-input, label-mp. */
export function ReportBracketScoreModal({
  open,
  busy = false,
  setsA,
  setsB,
  onSetsA,
  onSetsB,
  onCancel,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-bracket-score-title"
      className="mp-seek-modal-overlay mp-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="card mp-modal-panel mp-modal-pop"
        style={{ width: "min(360px, 100%)", padding: 0, overflow: "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="label-mp">Bracket · Resultado</div>
            <h2
              id="report-bracket-score-title"
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                color: "var(--fg)",
              }}
            >
              Sets ganados
              <span className="dot">.</span>
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.45, color: "var(--muted-fg)" }}>
              Indica cuántos sets ganó cada lado del partido.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onCancel}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              borderRadius: "50%",
              background: "var(--muted)",
              border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div className="mp-tournament-form-grid-2">
            <div>
              <label htmlFor="report-sets-a" className="label-mp" style={{ display: "block", marginBottom: 6 }}>
                Lado A
              </label>
              <input
                id="report-sets-a"
                type="number"
                min={0}
                inputMode="numeric"
                className="mp-input"
                value={setsA}
                disabled={busy}
                onChange={(e) => onSetsA(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="report-sets-b" className="label-mp" style={{ display: "block", marginBottom: 6 }}>
                Lado B
              </label>
              <input
                id="report-sets-b"
                type="number"
                min={0}
                inputMode="numeric"
                className="mp-input"
                value={setsB}
                disabled={busy}
                onChange={(e) => onSetsB(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mp-tournament-modal-footer">
          <span />
          <div className="mp-tournament-modal-footer-actions">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onSubmit}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
