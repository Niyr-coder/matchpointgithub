"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  listCourtMonitors,
  assignCourtMonitor,
  removeCourtMonitor,
  searchUsersByUsername,
  type CourtMonitorAssignment,
} from "@/server/actions/tournament-monitors";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://matchpoint.top";

export function TournamentMonitorsPanel({
  tournamentId,
  slug,
  courts,
  readOnly,
  hasClub,
  className,
}: {
  tournamentId: string;
  slug: string;
  courts: Array<{ id: string; label: string }>;
  readOnly?: boolean;
  hasClub?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [, startTx] = useTransition();
  const [monitors, setMonitors] = useState<CourtMonitorAssignment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [courtId, setCourtId] = useState("");
  const [username, setUsername] = useState("");
  const [positionLabel, setPositionLabel] = useState("");
  const [resolvedUser, setResolvedUser] = useState<{
    id: string;
    displayName: string;
    username: string;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; displayName: string; username: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monitorUrl = `${APP_URL}/t/${slug}/monitor`;

  const load = () => {
    startTx(async () => {
      const res = await listCourtMonitors({ tournamentId });
      if (res.ok) setMonitors(res.data);
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tournamentId]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ icon: "check", title: `${label} copiado` });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", tone: "error" });
    }
  };

  const assignedCourtIds = new Set(monitors.map((m) => m.courtId));
  const availableCourts = courts.filter((c) => !assignedCourtIds.has(c.id));

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    setSearching(true);
    const res = await searchUsersByUsername({ query: q.trim() });
    setSearching(false);
    if (res.ok) {
      setSuggestions(res.data);
      setShowSuggestions(res.data.length > 0);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(username), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username, doSearch]);

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
    setSuggestions([]);
    setShowSuggestions(false);
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
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div className="label-mp">Monitores de cancha</div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.5 }}>
          Asigna un monitor a cada cancha para llevar el marcador desde su teléfono.
        </div>
      </div>

      {/* Empty state: sin canchas configuradas */}
      {courts.length === 0 && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            border: "1px dashed var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="square" size={14} color="var(--muted-fg)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>
              {hasClub ? "Sin canchas configuradas" : "Torneo sin club vinculado"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.6 }}>
            {hasClub
              ? "Para asignar monitores necesitas configurar las canchas de tu club primero."
              : "Este torneo no tiene un club vinculado. Edítalo y selecciona un club con canchas para activar los monitores."}
          </div>
          {hasClub && (
            <a
              href="/dashboard/owner/club-canchas"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                color: "var(--primary)",
                textDecoration: "none",
                marginTop: 2,
              }}
            >
              <Icon name="external-link" size={11} color="var(--primary)" />
              Ir a configuración de canchas
            </a>
          )}
        </div>
      )}

      {/* Contenido activo: solo cuando hay canchas */}
      {courts.length > 0 && <>

      {/* Caja del link compartible */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--muted)",
          marginBottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          Link de la app monitor
        </div>
        <code
          style={{
            fontSize: 11,
            color: "var(--foreground)",
            wordBreak: "break-all",
            lineHeight: 1.45,
          }}
        >
          {monitorUrl}
        </code>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => copy(monitorUrl, "Link monitor")}
            style={{ fontSize: 10.5, flex: 1 }}
          >
            <Icon name="copy" size={11} color="#fff" />
            Copiar link
          </button>
          <a
            href={monitorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              fontSize: 10.5,
              background: "#fff",
              border: "1px solid var(--border)",
              textDecoration: "none",
            }}
          >
            <Icon name="external-link" size={11} />
            Abrir
          </a>
        </div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          El monitor debe tener cuenta en MATCHPOINT. El link es el mismo para
          todos — cada uno ve su cancha al iniciar sesión.
        </div>
      </div>

      {/* Lista de monitores asignados */}
      {monitors.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-fg)",
            textAlign: "center",
            padding: "10px 0",
            marginBottom: 12,
          }}
        >
          Sin monitores asignados.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {monitors.map((m) => {
            const initials = m.displayName
              .split(" ")
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("");
            const courtLabel = m.courtCode ?? m.courtName ?? "Cancha";

            return (
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
                    background: "linear-gradient(135deg,#10b981,#047857)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 12,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.displayName}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 1 }}>
                    {courtLabel}
                    {m.positionLabel ? ` · ${m.positionLabel}` : ""}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn"
                  onClick={() => copy(monitorUrl, "Link monitor")}
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    fontSize: 10,
                    padding: "4px 8px",
                    flexShrink: 0,
                  }}
                  title="Copiar link para enviar al monitor"
                >
                  <Icon name="copy" size={10} />
                  Link
                </button>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onRemove(m.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                    title="Remover monitor"
                  >
                    <Icon name="x" size={13} color="var(--muted-fg)" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Formulario de asignación */}
      {!readOnly && (
        <>
          {!showForm ? (
            <button
              type="button"
              className="btn"
              disabled={availableCourts.length === 0}
              onClick={() => {
                setShowForm(true);
                setCourtId(availableCourts[0]?.id ?? "");
              }}
              style={{ background: "#fff", border: "1px solid var(--border)", width: "100%" }}
            >
              <Icon name="user-plus" size={12} />
              Asignar monitor
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
              <div>
                <label
                  style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}
                >
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
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}
                >
                  Buscar monitor por username
                </label>
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Escribe un username..."
                      value={username}
                      autoComplete="off"
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setResolvedUser(null);
                      }}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      style={{
                        width: "100%",
                        padding: "8px 32px 8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "#fff",
                        fontSize: 13,
                      }}
                    />
                    {searching && (
                      <span style={{ position: "absolute", right: 10, fontSize: 11, color: "var(--muted-fg)" }}>
                        …
                      </span>
                    )}
                  </div>
                  {showSuggestions && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        background: "#fff",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
                        zIndex: 50,
                        overflow: "hidden",
                      }}
                    >
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={() => {
                            setResolvedUser(s);
                            setUsername(s.username);
                            setSuggestions([]);
                            setShowSuggestions(false);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            width: "100%",
                            padding: "9px 12px",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{s.displayName}</span>
                          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>@{s.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {resolvedUser && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="check-circle" size={12} color="var(--primary)" />
                    {resolvedUser.displayName} (@{resolvedUser.username})
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{ fontSize: 11, color: "var(--muted-fg)", display: "block", marginBottom: 4 }}
                >
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
                  onClick={() => {
                    setShowForm(false);
                    setResolvedUser(null);
                    setUsername("");
                    setPositionLabel("");
                  }}
                  style={{ background: "#fff", border: "1px solid var(--border)" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Fin del bloque condicional de canchas */}
      </>}
    </div>
  );
}
