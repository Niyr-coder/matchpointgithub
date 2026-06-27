"use client";

import { useState } from "react";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  resolvePlayerByUsername,
  substituteRegistrationPlayer,
  type SubstitutionReason,
} from "@/server/actions/tournament-player-ops";

const REASON_OPTIONS: { value: SubstitutionReason; label: string; icon: string }[] = [
  { value: "injury", label: "Lesión", icon: "🩺" },
  { value: "no_show", label: "No llegó", icon: "⏰" },
  { value: "voluntary", label: "Voluntario", icon: "🚶" },
  { value: "other", label: "Otro", icon: "···" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  registrationId: string;
  registrationLabel: string;
  tournamentId: string;
  players: Array<{ id: string; name: string }>;
  onSuccess: () => void;
}

export function SubstitutePlayerModal({
  open,
  onClose,
  registrationId,
  registrationLabel,
  tournamentId,
  players,
  onSuccess,
}: Props) {
  const toast = useToast();

  const [outPlayerId, setOutPlayerId] = useState<string>(() =>
    players.length === 1 ? players[0].id : "",
  );
  const [username, setUsername] = useState("");
  const [resolvedUser, setResolvedUser] = useState<{
    id: string;
    displayName: string;
    username: string;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [reason, setReason] = useState<SubstitutionReason | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setOutPlayerId(players.length === 1 ? players[0].id : "");
    setUsername("");
    setResolvedUser(null);
    setReason(null);
    setNotes("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onResolve = async () => {
    if (!username.trim()) return;
    setResolving(true);
    const res = await resolvePlayerByUsername({ username: username.trim() });
    setResolving(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error al buscar", sub: res.error.message, tone: "error" });
      return;
    }
    if (!res.data) {
      toast({ icon: "alert-triangle", title: "Usuario no encontrado", tone: "error" });
      setUsername("");
      return;
    }
    setResolvedUser(res.data);
  };

  const onSubmit = async () => {
    if (!resolvedUser || !reason || !outPlayerId) return;
    setSubmitting(true);
    const res = await substituteRegistrationPlayer({
      registrationId,
      outPlayerId,
      inPlayerId: resolvedUser.id,
      reason,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error al sustituir", sub: res.error.message, tone: "error" });
      return;
    }
    toast({ icon: "check", title: "Jugador sustituido" });
    reset();
    onSuccess();
    onClose();
  };

  if (!open) return null;

  const showOutPlayerPicker = players.length > 1;

  return (
    <>
      <div className="mp-monitor-sheet-overlay" onClick={handleClose} />
      <div className="mp-monitor-sheet" style={{ maxHeight: "85dvh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 18px" }} />

        <div style={{ marginBottom: 4 }}>
          <div className="label-mp">Sustituir jugador</div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>{registrationLabel}</div>
        </div>

        {/* Selección de jugador que sale (solo si hay 2+) */}
        {showOutPlayerPicker && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Jugador que sale
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOutPlayerId(p.id)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `2px solid ${outPlayerId === p.id ? "#ef4444" : "var(--border)"}`,
                    background: outPlayerId === p.id ? "color-mix(in srgb, #ef4444 8%, transparent)" : "var(--surface, #fff)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    fontWeight: outPlayerId === p.id ? 700 : 400,
                    color: outPlayerId === p.id ? "#ef4444" : "var(--fg)",
                    transition: "border-color 150ms var(--ease-out), background 150ms var(--ease-out)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  {p.name}
                  {outPlayerId === p.id && <span style={{ flexShrink: 0 }}>✗</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Buscar jugador que entra */}
        <div style={{ marginTop: showOutPlayerPicker ? 20 : 18 }}>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Jugador que entra
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Username..."
              value={username}
              onChange={(e) => { setUsername(e.target.value); setResolvedUser(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") onResolve(); }}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface, #fff)",
                fontSize: 13,
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={resolving || username.trim().length < 3}
              onClick={onResolve}
              style={{ flexShrink: 0 }}
            >
              {resolving ? "…" : "Buscar"}
            </button>
          </div>
          {resolvedUser && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--primary)",
                background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ color: "var(--primary)", fontWeight: 700 }}>✓</span>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {resolvedUser.displayName}
              </span>
              <span style={{ color: "var(--muted-fg)", fontSize: 12, flexShrink: 0 }}>
                @{resolvedUser.username}
              </span>
            </div>
          )}
        </div>

        {/* Motivo */}
        {resolvedUser && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Motivo
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {REASON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setReason(opt.value)}
                  style={{
                    padding: "12px 10px",
                    borderRadius: 10,
                    border: `2px solid ${reason === opt.value ? "var(--primary)" : "var(--border)"}`,
                    background: reason === opt.value ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface, #fff)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: reason === opt.value ? 700 : 400,
                    color: reason === opt.value ? "var(--primary)" : "var(--fg)",
                    transition: "border-color 150ms var(--ease-out), background 150ms var(--ease-out)",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 6 }}>
                Notas (opcional)
              </div>
              <textarea
                placeholder="Observaciones adicionales..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={300}
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface, #fff)",
                  fontSize: 13,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!resolvedUser || !reason || !outPlayerId || submitting}
            onClick={onSubmit}
            style={{ flex: 1 }}
          >
            {submitting ? "Sustituyendo…" : "Sustituir jugador"}
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
