"use client";
// Cronograma editable del torneo. Lista por fecha con add/edit/delete inline.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import {
  createScheduleBlock,
  updateScheduleBlock,
  deleteScheduleBlock,
} from "@/server/actions/tournaments";

export type ScheduleBlock = {
  id: string;
  startsAt: string;
  label: string;
  categoryId: string | null;
  notes: string | null;
};

export type CategoryOption = {
  id: string;
  name: string;
};

type FormState = {
  id: string | null;
  startsAt: string;
  label: string;
  categoryId: string;
  notes: string;
};

const EMPTY: FormState = {
  id: null,
  startsAt: "",
  label: "",
  categoryId: "",
  notes: "",
};

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localToIso(local: string): string {
  return new Date(local).toISOString();
}
function fmt(iso: string): { dayKey: string; dayLabel: string; time: string } {
  const d = new Date(iso);
  const dayKey = d.toISOString().slice(0, 10);
  const dayLabel = d.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
  const time = d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  return { dayKey, dayLabel, time };
}

export function SchedulePanel({
  tournamentId,
  initialBlocks,
  categories,
  readOnly,
}: {
  tournamentId: string;
  initialBlocks: ScheduleBlock[];
  categories: CategoryOption[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Agrupar por día.
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: ScheduleBlock[] }>();
    const sorted = [...initialBlocks].sort(
      (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
    );
    for (const b of sorted) {
      const { dayKey, dayLabel } = fmt(b.startsAt);
      if (!map.has(dayKey)) map.set(dayKey, { label: dayLabel, items: [] });
      map.get(dayKey)!.items.push(b);
    }
    return Array.from(map.entries());
  }, [initialBlocks]);

  const openCreate = () => {
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (b: ScheduleBlock) => {
    setForm({
      id: b.id,
      startsAt: isoToLocal(b.startsAt),
      label: b.label,
      categoryId: b.categoryId ?? "",
      notes: b.notes ?? "",
    });
    setOpen(true);
  };

  const onSave = () => {
    if (saving) return;
    if (!form.startsAt) {
      toast({ icon: "alert-triangle", title: "Falta fecha/hora" });
      return;
    }
    if (form.label.trim().length < 1) {
      toast({ icon: "alert-triangle", title: "Falta el título" });
      return;
    }
    const body = {
      startsAt: localToIso(form.startsAt),
      label: form.label.trim(),
      categoryId: form.categoryId === "" ? null : form.categoryId,
      notes: form.notes.trim() === "" ? null : form.notes.trim(),
    };
    setSaving(true);
    startTx(async () => {
      const res = form.id
        ? await updateScheduleBlock({ tournamentId, blockId: form.id, body })
        : await createScheduleBlock({ tournamentId, body });
      setSaving(false);
      if (res.ok) {
        toast({ icon: "check", title: form.id ? "Bloque actualizado" : "Bloque añadido" });
        setOpen(false);
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo guardar",
          sub: res.error.message,
        });
      }
    });
  };

  const onDelete = (b: ScheduleBlock) => {
    if (!confirm(`¿Borrar "${b.label}"?`)) return;
    startTx(async () => {
      const res = await deleteScheduleBlock({ tournamentId, blockId: b.id });
      if (res.ok) {
        toast({ icon: "check", title: "Borrado" });
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo borrar",
          sub: res.error.message,
        });
      }
    });
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div className="label-mp">Cronograma</div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            {initialBlocks.length === 0
              ? "Sin bloques. Agrega entradas para mostrarle a los jugadores el plan del día."
              : `${initialBlocks.length} bloque${initialBlocks.length === 1 ? "" : "s"} programado${initialBlocks.length === 1 ? "" : "s"}.`}
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={openCreate}
            className="btn btn-primary"
            style={{ fontSize: 11.5, padding: "8px 12px" }}
          >
            <Icon name="plus" size={12} color="#fff" />
            Añadir bloque
          </button>
        )}
      </div>

      {grouped.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {grouped.map(([key, group]) => (
            <div key={key}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                  paddingBottom: 6,
                  borderBottom: "1px dashed var(--border)",
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {group.items.map((b) => {
                  const cat = categories.find((c) => c.id === b.categoryId);
                  const { time } = fmt(b.startsAt);
                  return (
                    <div
                      key={b.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 1fr auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 12px",
                        background: "var(--muted)",
                        borderRadius: 8,
                      }}
                    >
                      <div
                        className="font-heading tabular"
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          letterSpacing: "-0.02em",
                          color: "#0a0a0a",
                        }}
                      >
                        {time}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a" }}>
                          {b.label}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            marginTop: 3,
                            fontSize: 11,
                            color: "var(--muted-fg)",
                          }}
                        >
                          {cat && (
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 900,
                                letterSpacing: "0.08em",
                                padding: "2px 7px",
                                borderRadius: 4,
                                background: "#0a0a0a",
                                color: "#fff",
                              }}
                            >
                              {cat.name.toUpperCase()}
                            </span>
                          )}
                          {b.notes && <span>{b.notes}</span>}
                        </div>
                      </div>
                      {!readOnly && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => openEdit(b)}
                            style={iconBtnStyle}
                            aria-label="Editar"
                          >
                            <Icon name="pencil" size={12} />
                          </button>
                          <button
                            onClick={() => onDelete(b)}
                            style={{ ...iconBtnStyle, color: "#dc2626" }}
                            aria-label="Borrar"
                          >
                            <Icon name="trash-2" size={12} color="#dc2626" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mp-modal-panel"
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#fff",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div className="label-mp">{form.id ? "Editar bloque" : "Nuevo bloque"}</div>
                <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, margin: "4px 0 0" }}>
                  Cronograma
                  <span style={{ color: "var(--primary)" }}>.</span>
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--muted)",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              <Field label="Fecha y hora">
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Título">
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Ej: Cat. B · Fase de grupos"
                  style={inputStyle}
                />
              </Field>
              <Field label="Categoría (opcional)">
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">— Sin categoría —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notas (opcional)">
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Ej: Cancha 3 y 4"
                  style={inputStyle}
                />
              </Field>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 20,
                paddingTop: 14,
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                Cancelar
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="btn btn-primary"
                style={{ opacity: saving ? 0.7 : 1 }}
              >
                <Icon name="check" size={13} color="#fff" />
                {saving ? "Guardando…" : form.id ? "Actualizar" : "Añadir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  background: "#fff",
  border: "1px solid var(--border)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  color: "#0a0a0a",
  fontFamily: "inherit",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
