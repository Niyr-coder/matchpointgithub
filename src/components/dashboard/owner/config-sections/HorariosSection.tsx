"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { VisualToggle, type SectionToast } from "./_shared";
import {
  updateClubHours,
  upsertScheduleException,
  deleteScheduleException,
} from "@/server/actions/club-config-horarios";

export type DayHours = {
  d: string;
  o: number;
  c: number;
  on: boolean;
  peak: [number, number] | null;
};
export type ScheduleException = {
  id: string;
  date: string;
  dateLabel: string;
  name: string;
  closed: boolean;
  openHour: number | null;
  closeHour: number | null;
  notes: string | null;
  icon: string;
  color: string;
};
export type HorariosData = {
  week: DayHours[];
  exceptions: ScheduleException[];
};

const DEFAULT_WEEK: DayHours[] = [
  { d: "Lunes", o: 6, c: 22, on: true, peak: null },
  { d: "Martes", o: 6, c: 22, on: true, peak: null },
  { d: "Miércoles", o: 6, c: 22, on: true, peak: null },
  { d: "Jueves", o: 6, c: 22, on: true, peak: null },
  { d: "Viernes", o: 6, c: 23, on: true, peak: [17, 22] },
  { d: "Sábado", o: 7, c: 23, on: true, peak: [9, 21] },
  { d: "Domingo", o: 7, c: 20, on: true, peak: [9, 19] },
];

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

type ExceptionDraft = {
  id?: string;
  date: string;
  name: string;
  closed: boolean;
  openHour: number | null;
  closeHour: number | null;
  notes: string;
};

function emptyDraft(): ExceptionDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    name: "",
    closed: false,
    openHour: 9,
    closeHour: 18,
    notes: "",
  };
}

export function HorariosSection({
  onAction,
  data,
  clubId,
}: {
  onAction: SectionToast;
  data?: HorariosData;
  clubId?: string;
}) {
  const [week, setWeek] = useState<DayHours[]>(data?.week ?? DEFAULT_WEEK);
  const [exceptions, setExceptions] = useState<ScheduleException[]>(data?.exceptions ?? []);
  const [draft, setDraft] = useState<ExceptionDraft | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isMutating, startMutate] = useTransition();

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const setDay = (idx: number, patch: Partial<DayHours>) => {
    setWeek((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const saveHours = () => {
    if (!clubId) {
      onAction("Falta clubId — no se puede guardar");
      return;
    }
    startSave(async () => {
      const res = await updateClubHours({ clubId, week });
      if (res.ok) onAction("Horarios guardados");
      else onAction(`Error: ${res.error.message}`);
    });
  };

  const applyMonToFri = () => {
    const mon = week[0];
    setWeek((prev) => prev.map((d, i) => (i < 5 ? { ...mon, d: d.d } : d)));
    onAction("Aplicado L–V (no olvides guardar)");
  };

  const openNewException = () => setDraft(emptyDraft());
  const openEditException = (ex: ScheduleException) =>
    setDraft({
      id: ex.id,
      date: ex.date,
      name: ex.name,
      closed: ex.closed,
      openHour: ex.openHour,
      closeHour: ex.closeHour,
      notes: ex.notes ?? "",
    });

  const submitException = () => {
    if (!clubId) {
      onAction("Falta clubId");
      return;
    }
    if (!draft) return;
    if (!draft.name.trim()) {
      onAction("Nombre obligatorio");
      return;
    }
    const payload = {
      clubId,
      id: draft.id,
      date: draft.date,
      name: draft.name.trim(),
      closed: draft.closed,
      openHour: draft.closed ? null : draft.openHour,
      closeHour: draft.closeHour,
      notes: draft.notes.trim() || null,
    };
    startMutate(async () => {
      const res = await upsertScheduleException(payload);
      if (res.ok) {
        setExceptions((prev) => {
          const next = prev.filter((e) => e.id !== res.data.id);
          next.push(res.data);
          next.sort((a, b) => (a.date < b.date ? -1 : 1));
          return next;
        });
        setDraft(null);
        onAction(draft.id ? "Excepción actualizada" : "Excepción añadida");
      } else {
        onAction(`Error: ${res.error.message}`);
      }
    });
  };

  const removeException = (id: string) => {
    if (!clubId) return;
    startMutate(async () => {
      const res = await deleteScheduleException({ clubId, id });
      if (res.ok) {
        setExceptions((prev) => prev.filter((e) => e.id !== id));
        onAction("Excepción eliminada");
      } else {
        onAction(`Error: ${res.error.message}`);
      }
    });
  };

  return (
    <>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Apertura · semana típica</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Cuándo está abierto el club<span className="dot">.</span></h3>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={applyMonToFri}><Icon name="copy" size={11} />Aplicar L–V</button>
            <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={openNewException}><Icon name="plus" size={11} color="#fff" />Excepción</button>
            <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={saveHours} disabled={isSaving}><Icon name="check" size={11} color="#fff" />{isSaving ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 160px", gap: 12, alignItems: "center", marginBottom: 6, fontSize: 9, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <span>Día</span>
              <span style={{ textAlign: "center" }}>Abierto</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 1 }}>
                {hours.map((h) => (
                  <div key={h} style={{ textAlign: "center", fontSize: 8 }}>{h % 4 === 0 ? h : ""}</div>
                ))}
              </div>
              <span style={{ textAlign: "right" }}>Horas</span>
            </div>

            {week.map((d, i) => (
              <div key={d.d} style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 160px", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i === 0 ? "1px solid var(--border)" : "1px dashed var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{d.d}</div>
                <div style={{ justifySelf: "center" }}>
                  <VisualToggle on={d.on} w={30} h={18} onClick={() => setDay(i, { on: !d.on })} />
                </div>
                <div style={{ position: "relative", height: 22, background: "#fafafa", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", opacity: d.on ? 1 : 0.4 }}>
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: (d.o / 24) * 100 + "%", width: ((d.c - d.o) / 24) * 100 + "%", background: "linear-gradient(90deg, var(--primary), #34d399)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px", fontSize: 9, fontWeight: 900, color: "#fff" }}>
                    <span>{String(d.o).padStart(2, "0")}:00</span>
                    <span>{String(d.c).padStart(2, "0")}:00</span>
                  </div>
                  {d.peak && <div style={{ position: "absolute", top: 0, bottom: 0, left: (d.peak[0] / 24) * 100 + "%", width: ((d.peak[1] - d.peak[0]) / 24) * 100 + "%", borderTop: "2px solid #fbbf24", borderBottom: "2px solid #fbbf24", pointerEvents: "none" }} />}
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={d.o}
                    disabled={!d.on}
                    onChange={(e) => setDay(i, { o: Math.max(0, Math.min(24, Number(e.target.value) || 0)) })}
                    style={{ width: 48, padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>—</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={d.c}
                    disabled={!d.on}
                    onChange={(e) => setDay(i, { c: Math.max(0, Math.min(24, Number(e.target.value) || 0)) })}
                    style={{ width: 48, padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, textAlign: "center" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--muted-fg)", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 8, background: "linear-gradient(90deg, var(--primary), #34d399)", borderRadius: 2 }} /> Horario abierto</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 8, borderTop: "2px solid #fbbf24", borderBottom: "2px solid #fbbf24" }} /> Pico (surge +20%)</div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
          <div>
            <div className="label-mp">Excepciones · feriados y cierres</div>
            <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Días especiales<span className="dot">.</span></h3>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={openNewException}><Icon name="plus" size={11} color="#fff" />Añadir</button>
        </div>
        {exceptions.length === 0 && (
          <div style={{ padding: "16px 0", fontSize: 11, color: "var(--muted-fg)" }}>Aún no añades feriados ni cierres especiales.</div>
        )}
        {exceptions.map((f, i) => (
          <div key={f.id} style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr 120px 90px", gap: 12, alignItems: "center", padding: "11px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: f.color === "#dc2626" ? "rgba(220,38,38,0.1)" : "rgba(251,191,36,0.15)", color: f.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={f.icon} size={14} color={f.color} />
            </div>
            <div className="font-heading tabular" style={{ fontSize: 11, fontWeight: 900, color: "#0a0a0a" }}>{f.dateLabel || formatDateLabel(f.date)}</div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{f.name}</div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{f.notes}</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => openEditException(f)} style={{ width: 26, height: 26, borderRadius: 6, background: "var(--muted)", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="pencil" size={11} /></button>
              <button onClick={() => removeException(f.id)} disabled={isMutating} style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(220,38,38,0.1)", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="trash" size={11} color="#dc2626" /></button>
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setDraft(null)}>
          <div className="card" style={{ padding: 22, width: "100%", maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="label-mp">{draft.id ? "Editar excepción" : "Nueva excepción"}</div>
            <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Feriado o cierre especial<span className="dot">.</span></h3>

            <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Fecha</label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, marginBottom: 10 }}
            />

            <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nombre</label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ej: Navidad"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, marginBottom: 10 }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <VisualToggle on={draft.closed} onClick={() => setDraft({ ...draft, closed: !draft.closed })} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>Cerrado todo el día</span>
            </div>

            {!draft.closed && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Abre</label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={draft.openHour ?? 0}
                    onChange={(e) => setDraft({ ...draft, openHour: Number(e.target.value) || 0 })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Cierra</label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={draft.closeHour ?? 0}
                    onChange={(e) => setDraft({ ...draft, closeHour: Number(e.target.value) || 0 })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                </div>
              </div>
            )}

            <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notas (opcional)</label>
            <input
              type="text"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, marginBottom: 14 }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 11 }} onClick={() => setDraft(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={submitException} disabled={isMutating}>{isMutating ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
