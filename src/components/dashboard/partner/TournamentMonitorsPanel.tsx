"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  listCourtMonitors,
  assignCourtMonitor,
  removeCourtMonitor,
  resolveUserByUsername,
  type CourtMonitorAssignment,
} from "@/server/actions/tournament-monitors";

export function TournamentMonitorsPanel({
  tournamentId,
  slug,
  courts,
  readOnly,
  className,
}: {
  tournamentId: string;
  slug: string;
  courts: Array<{ id: string; label: string }>;
  readOnly?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [, startTx] = useTransition();
  const [monitors, setMonitors] = useState<CourtMonitorAssignment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [courtId, setCourtId] = useState("");
  const [username, setUsername] = useState("");
  const [positionLabel, setPositionLabel] = useState("");
  const [resolvedUser, setResolvedUser] = useState<{ id: string; displayName: string; username: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const load = () => {
    startTx(async () => {
      const res = await listCourtMonitors({ tournamentId });
      if (res.ok) setMonitors(res.data);
    });
  };

  useEffect(() => { load(); }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignedCourtIds = new Set(monitors.map((m) => m.courtId));
  const availableCourts = courts.filter((c) => !assignedCourtIds.has(c.id));

  const onResolve = async () => {
    if (!username.trim()) return;
    setResolving(true);
    const res = await resolveUserByUsername({ username: username.trim() });
    setResolving(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error al buscar usuario", sub: res.error.message, tone: "error" });
      return;
    }
    if (!res.data) {
      toast({ icon: "alert-triangle", title: "Usuario no encontrado", tone: "error"});
      setResolvedUser(null);
      return;
    }
    setResolvedUser(res.data);
  };

  const onAssign = async () => {
    if (!resolvedUser || !courtId) return;
    setAssigning(true);
    const res = await assignCourtMonitor({
      tournamentId,
      courtId,
      userId: resolvedUser.id,
      positionLabel: positionLabel.trim() || undefined,
    });
    setAssigning(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error al asignar", sub: res.error.message, tone: "error" });
      return;
    }
    toast({ icon: "check", title: "Monitor asignado" });
    setShowForm(false);
    setCourtId("");
    setUsername("");
    setPositionLabel("");
    setResolvedUser(null);
    load();
  };

  const onRemove = (monitorId: string) => {
    startTx(async () => {
      const res = await removeCourtMonitor({ monitorId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "Error al remover", sub: res.error.message, tone: "error" });
        return;
      }
      toast({ icon: "check", title: "Monitor removido" });
      load();
    });
  };

  return (
    <div
      className={`card mp-partner-torneo-rail-card${className ? ` ${className}` : ""}`}
      style={{ padding: 18 }}
    >
      <div style={{ marginBottom: 14 }}>
        <div className="label-mp">Monitores de cancha</div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.5 }}>
          Asigna un monitor a cada cancha. El monitor puede llevar el marcador desde su teléfono.
        </div>
      </div>

      {/* Lista de monitores */}
      {monitors.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 12 }}>
          Sin monitores asignados.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {monitors.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--muted)",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "var(--primary-light, #d1fae5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 12,
                  color: "var(--primary, #10b981)",
                  flexShrink: 0,
                }}
              >
                {m.displayName
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.displayName}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                  {m.courtCode ?? m.courtName ?? "Cancha"}
                  {m.positionLabel ? ` · ${m.positionLabel}` : ""}
                </div>
              </div>
              <a
                href={`/t/${slug}/monitor`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--primary, #10b981)", textDecoration: "none", flexShrink: 0, marginRight: 4 }}
              >
                App ↗
              </a>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted-fg)",
                    fontSize: 16,
                    padding: "2px 4px",
                    lineHeight: 1,
                  }}
                  title="Remover monitor"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Formulario inline */}
      {!readOnly && (
        <>
          {!showForm ? (
            <button
              type="button"
              className="btn"
              disabled={availableCourts.length === 0}
              onClick={() => { setShowForm(true); setCourtId(availableCourts[0]?.id ?? ""); }}
              style={{ background: "#fff", border: "1px solid var(--border)", width: "100%" }}
            >
              + Añadir monitor
            </button>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 14,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--muted)",
              }}
            >
              {/* Select cancha */}
              <div>
                <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
                  Cancha
                </label>
                <select
                  value={courtId}
                  onChange={(e) => setCourtId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    fontSize: 13,
                  }}
                >
                  {availableCourts.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Username + buscar */}
              <div>
                <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
                  Username del monitor
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="username..."
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setResolvedUser(null); }}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "#fff",
                      fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={resolving || username.trim().length < 3}
                    onClick={onResolve}
                    style={{ background: "#fff", border: "1px solid var(--border)", flexShrink: 0 }}
                  >
                    {resolving ? "…" : "Buscar"}
                  </button>
                </div>
                {resolvedUser && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--primary, #10b981)" }}>
                    ✓ {resolvedUser.displayName} (@{resolvedUser.username})
                  </div>
                )}
              </div>

              {/* Posición */}
              <div>
                <label style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}>
                  Posición (opcional)
                </label>
                <input
                  type="text"
                  placeholder="ej. Recepción, Canchas Norte…"
                  value={positionLabel}
                  onChange={(e) => setPositionLabel(e.target.value)}
                  maxLength={60}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    fontSize: 13,
                  }}
                />
              </div>

              {/* Acciones */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!resolvedUser || !courtId || assigning}
                  onClick={onAssign}
                  style={{ flex: 1 }}
                >
                  {assigning ? "Asignando…" : "Asignar"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setShowForm(false); setResolvedUser(null); setUsername(""); setPositionLabel(""); }}
                  style={{ background: "#fff", border: "1px solid var(--border)" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
