"use client";

// Cronograma por cancha (Fase A2): asigna cancha + hora en grilla a los
// partidos sin programar con ambos lados definidos. Re-ejecutable: al llenarse
// rondas nuevas, se vuelve a correr y programa solo lo pendiente. Con esto los
// monitores trabajan con partidos pre-asignados y el jugador ve hora y cancha.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { scheduleTournamentMatches } from "@/server/actions/tournament-operation";

const SLOT_OPTIONS = [30, 45, 60, 90];

export function TournamentMatchSchedulerPanel({
  tournamentId,
  courts,
}: {
  tournamentId: string;
  courts: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(courts.map((c) => c.id)),
  );
  const [startsAt, setStartsAt] = useState("");
  const [slotMinutes, setSlotMinutes] = useState(45);
  const [busy, setBusy] = useState(false);

  if (courts.length === 0) return null;

  const toggleCourt = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canRun = selected.size > 0 && startsAt !== "" && !busy;

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    const res = await scheduleTournamentMatches({
      tournamentId,
      courtIds: Array.from(selected),
      startsAt: new Date(startsAt).toISOString(),
      slotMinutes,
    });
    setBusy(false);
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message, tone: "error" });
      return;
    }
    toast({
      icon: res.data.scheduled > 0 ? "check" : "info",
      title:
        res.data.scheduled > 0
          ? `${res.data.scheduled} partido${res.data.scheduled === 1 ? "" : "s"} programado${res.data.scheduled === 1 ? "" : "s"}`
          : "No hay partidos pendientes de programar",
      sub:
        res.data.scheduled > 0
          ? "Cancha y hora asignadas. Vuelve a correrlo cuando se llenen rondas nuevas."
          : undefined,
      tone: "success",
    });
    router.refresh();
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon name="calendar-clock" size={14} />
        <span className="label-mp" style={{ margin: 0 }}>
          Cronograma por cancha
        </span>
      </div>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Asigna cancha y hora a los partidos listos (con ambos lados definidos).
        Cuando avancen las rondas, vuelve a correrlo para programar lo nuevo.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {courts.map((c) => {
          const on = selected.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCourt(c.id)}
              className="btn"
              style={{
                padding: "6px 12px",
                fontSize: 11.5,
                fontWeight: 800,
                background: on ? "var(--primary)" : "#fff",
                color: on ? "#fff" : "var(--muted-fg)",
                border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-fg)" }}>
          Primer partido
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "inherit", fontSize: 13 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-fg)" }}>
          Minutos por partido
          <select
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "inherit", fontSize: 13, background: "#fff" }}
          >
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={run} disabled={!canRun}>
          {busy ? (
            <>
              <Icon name="loader" size={12} color="#fff" />
              Programando…
            </>
          ) : (
            <>
              <Icon name="calendar-clock" size={12} color="#fff" />
              Programar pendientes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
