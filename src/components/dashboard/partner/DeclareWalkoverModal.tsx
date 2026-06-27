"use client";

import { useState } from "react";
import { useToast } from "@/components/dashboard/ToastProvider";
import { declareWalkover } from "@/server/actions/tournament-player-ops";

type WalkoverReason = "no_show" | "injury" | "disqualification" | "voluntary_withdrawal";

const REASON_OPTIONS: { value: WalkoverReason; label: string }[] = [
  { value: "no_show", label: "No se presentó" },
  { value: "injury", label: "Lesión" },
  { value: "disqualification", label: "Descalificación" },
  { value: "voluntary_withdrawal", label: "Retiro voluntario" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  matchId: string;
  matchType: "bracket" | "group";
  teamA: string;
  teamB: string;
  tournamentId: string;
  onSuccess: () => void;
}

export function DeclareWalkoverModal({
  open,
  onClose,
  matchId,
  matchType,
  teamA,
  teamB,
  tournamentId,
  onSuccess,
}: Props) {
  const toast = useToast();
  const [absentSide, setAbsentSide] = useState<"a" | "b" | null>(null);
  const [reason, setReason] = useState<WalkoverReason | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAbsentSide(null);
    setReason(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async () => {
    if (!absentSide || !reason) return;
    const winnerSide = absentSide === "a" ? "b" : "a";
    setSubmitting(true);
    const res = await declareWalkover({ matchId, matchType, winnerSide, reason, tournamentId });
    setSubmitting(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error al declarar W/O", sub: res.error.message, tone: "error" });
      return;
    }
    toast({ icon: "check", title: "Walkover declarado" });
    reset();
    onSuccess();
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="mp-monitor-sheet-overlay" onClick={handleClose} />
      <div className="mp-monitor-sheet">
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 18px" }} />

        <div style={{ marginBottom: 4 }}>
          <div className="label-mp">Declarar W/O</div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
            {teamA} vs {teamB}
          </div>
        </div>

        {/* ¿Quién no se presentó? */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            ¿Quién no se presentó?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["a", "b"] as const).map((side) => {
              const name = side === "a" ? teamA : teamB;
              const isAbsent = absentSide === side;
              const isWinner = absentSide !== null && absentSide !== side;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => setAbsentSide(side)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: `2px solid ${isAbsent ? "#ef4444" : isWinner ? "var(--primary)" : "var(--border)"}`,
                    background: isAbsent
                      ? "color-mix(in srgb, #ef4444 8%, transparent)"
                      : isWinner
                        ? "color-mix(in srgb, var(--primary) 8%, transparent)"
                        : "var(--surface, #fff)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--fg)",
                    transition: "border-color 150ms var(--ease-out), background 150ms var(--ease-out)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </span>
                  {isAbsent && <span style={{ color: "#ef4444", flexShrink: 0 }}>✗</span>}
                  {isWinner && <span style={{ color: "var(--primary)", flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Motivo */}
        {absentSide && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Motivo
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {REASON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setReason(opt.value)}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: `2px solid ${reason === opt.value ? "var(--primary)" : "var(--border)"}`,
                    background: reason === opt.value ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface, #fff)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    fontWeight: reason === opt.value ? 700 : 400,
                    color: reason === opt.value ? "var(--primary)" : "var(--fg)",
                    transition: "border-color 150ms var(--ease-out), background 150ms var(--ease-out)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!absentSide || !reason || submitting}
            onClick={onSubmit}
            style={{ flex: 1 }}
          >
            {submitting ? "Declarando…" : "Confirmar walkover"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClose}
            style={{ flexShrink: 0 }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
