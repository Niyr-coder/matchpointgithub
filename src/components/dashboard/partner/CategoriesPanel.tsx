"use client";
// CRUD inline de categorías del torneo. Vive dentro de la página de gestión.
// Add/edit usa el mismo form en modo controlado.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import {
  createTournamentCategory,
  updateTournamentCategory,
  deleteTournamentCategory,
} from "@/server/actions/tournaments";

export type CategoryRow = {
  id: string;
  name: string;
  gender: string | null;
  level: string | null;
  mprMin: number | null;
  mprMax: number | null;
  ageMin: number | null;
  ageMax: number | null;
  maxTeams: number | null;
};

const GENDERS = [
  { value: "open", label: "Open" },
  { value: "m", label: "Masculino" },
  { value: "f", label: "Femenino" },
  { value: "mixed", label: "Mixto" },
] as const;


type FormState = {
  id: string | null;
  name: string;
  gender: string;
  mprMin: number; // 2.0 hasta MPR_MAX
  mprMax: number; // mprMin hasta 8.0
  noLevelLimit: boolean; // si true, no se guardan mprMin/mprMax (open)
  noUpperCap: boolean; // si true, mprMax = null (ej. "5.5+")
  ageMin: string;
  ageMax: string;
  maxTeams: string;
};

const MPR_MIN = 2.0;
const MPR_MAX = 8.0;
const MPR_STEP = 0.25;

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  gender: "open",
  mprMin: 3.0,
  mprMax: 4.0,
  noLevelLimit: false,
  noUpperCap: false,
  ageMin: "",
  ageMax: "",
  maxTeams: "",
};

export function CategoriesPanel({
  tournamentId,
  initialCategories,
  readOnly,
}: {
  tournamentId: string;
  initialCategories: CategoryRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (c: CategoryRow) => {
    const hasDupr = c.mprMin != null || c.mprMax != null;
    setForm({
      id: c.id,
      name: c.name,
      gender: c.gender ?? "open",
      mprMin: c.mprMin ?? 3.0,
      mprMax: c.mprMax ?? 4.0,
      noLevelLimit: !hasDupr,
      noUpperCap: hasDupr && c.mprMax == null,
      ageMin: c.ageMin != null ? String(c.ageMin) : "",
      ageMax: c.ageMax != null ? String(c.ageMax) : "",
      maxTeams: c.maxTeams != null ? String(c.maxTeams) : "",
    });
    setFormOpen(true);
  };

  const onSave = () => {
    if (saving) return;
    if (form.name.trim().length < 1) {
      toast({ icon: "alert-triangle", title: "Nombre requerido" });
      return;
    }
    const body = {
      name: form.name.trim(),
      gender: (form.gender || null) as "m" | "f" | "mixed" | "open" | null,
      level: null as null,
      mprMin: form.noLevelLimit ? null : form.mprMin,
      mprMax: form.noLevelLimit ? null : form.noUpperCap ? null : form.mprMax,
      ageMin: form.ageMin === "" ? null : Number(form.ageMin),
      ageMax: form.ageMax === "" ? null : Number(form.ageMax),
      maxTeams: form.maxTeams === "" ? null : Number(form.maxTeams),
    };
    setSaving(true);
    startTx(async () => {
      const res = form.id
        ? await updateTournamentCategory({ tournamentId, categoryId: form.id, body })
        : await createTournamentCategory({ tournamentId, body });
      setSaving(false);
      if (res.ok) {
        toast({ icon: "check", title: form.id ? "Categoría actualizada" : "Categoría creada" });
        setFormOpen(false);
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

  const onDelete = (c: CategoryRow) => {
    if (!confirm(`¿Borrar la categoría "${c.name}"? No se puede deshacer.`)) return;
    startTx(async () => {
      const res = await deleteTournamentCategory({ tournamentId, categoryId: c.id });
      if (res.ok) {
        toast({ icon: "check", title: "Categoría borrada" });
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
          marginBottom: 12,
        }}
      >
        <div>
          <div className="label-mp">Categorías</div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            {initialCategories.length === 0
              ? "Sin categorías. Los jugadores se inscriben sin categoría."
              : `${initialCategories.length} categoría${initialCategories.length === 1 ? "" : "s"} configurada${initialCategories.length === 1 ? "" : "s"}.`}
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={openCreate}
            className="btn btn-primary"
            style={{ fontSize: 11.5, padding: "8px 12px" }}
          >
            <Icon name="plus" size={12} color="#fff" />
            Nueva categoría
          </button>
        )}
      </div>

      {initialCategories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {initialCategories.map((c) => (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 110px 90px 110px 90px",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                background: "var(--muted)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <div>
                <b style={{ color: "#0a0a0a" }}>{c.name}</b>
              </div>
              <div style={{ color: "var(--muted-fg)", textTransform: "uppercase", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em" }}>
                {GENDERS.find((g) => g.value === c.gender)?.label ?? "—"}
              </div>
              <div style={{ color: "var(--muted-fg)", fontSize: 11, fontWeight: 700 }}>
                {c.mprMin != null || c.mprMax != null
                  ? `MPR ${c.mprMin ?? "—"}${c.mprMax != null ? `–${c.mprMax}` : "+"}`
                  : "Open"}
              </div>
              <div style={{ color: "var(--muted-fg)", fontSize: 11 }}>
                {c.ageMin != null || c.ageMax != null
                  ? `${c.ageMin ?? "0"}–${c.ageMax ?? "∞"}`
                  : "—"}
              </div>
              <div style={{ color: "var(--muted-fg)", fontSize: 11 }}>
                {c.maxTeams != null ? `${c.maxTeams} cupos` : "Sin límite"}
              </div>
              {!readOnly && (
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => openEdit(c)}
                    style={iconBtnStyle}
                    aria-label="Editar"
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                  <button
                    onClick={() => onDelete(c)}
                    style={{ ...iconBtnStyle, color: "#dc2626" }}
                    aria-label="Borrar"
                  >
                    <Icon name="trash-2" size={12} color="#dc2626" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div
          onClick={() => setFormOpen(false)}
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
              maxWidth: 520,
              background: "#fff",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="label-mp">{form.id ? "Editar categoría" : "Nueva categoría"}</div>
                <h3 className="font-heading" style={{ fontSize: 20, fontWeight: 900, margin: "4px 0 0" }}>
                  {form.name || "—"}
                  <span style={{ color: "var(--primary)" }}>.</span>
                </h3>
              </div>
              <button
                onClick={() => setFormOpen(false)}
                aria-label="Cerrar"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--muted)",
                  border: 0,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              <Field label="Nombre">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Categoría A, +50, Mixto Open"
                  style={inputStyle}
                />
              </Field>

              <Field label="Género">
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  style={inputStyle}
                >
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={
                  form.noLevelLimit
                    ? "Rango MPR · Open (sin restricción)"
                    : form.noUpperCap
                      ? `Rango MPR · ${form.mprMin.toFixed(2)}+ (sin tope)`
                      : `Rango MPR · ${form.mprMin.toFixed(2)} – ${form.mprMax.toFixed(2)}`
                }
              >
                <MprRangeSlider
                  min={form.mprMin}
                  max={form.mprMax}
                  disabled={form.noLevelLimit}
                  noUpperCap={form.noUpperCap}
                  onChange={(lo, hi) => setForm({ ...form, mprMin: lo, mprMax: hi })}
                />
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: "var(--muted-fg)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.noUpperCap}
                      disabled={form.noLevelLimit}
                      onChange={(e) => setForm({ ...form, noUpperCap: e.target.checked })}
                      style={{ accentColor: "var(--primary)" }}
                    />
                    Sin tope superior (ej. 5.5+)
                  </label>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: "var(--muted-fg)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.noLevelLimit}
                      onChange={(e) => setForm({ ...form, noLevelLimit: e.target.checked })}
                      style={{ accentColor: "var(--primary)" }}
                    />
                    Open (sin filtro de nivel)
                  </label>
                </div>
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <Field label="Edad mín.">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={form.ageMin}
                    onChange={(e) => setForm({ ...form, ageMin: e.target.value })}
                    placeholder="—"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Edad máx.">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={form.ageMax}
                    onChange={(e) => setForm({ ...form, ageMax: e.target.value })}
                    placeholder="—"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Cupos">
                  <input
                    type="number"
                    min={1}
                    value={form.maxTeams}
                    onChange={(e) => setForm({ ...form, maxTeams: e.target.value })}
                    placeholder="Sin límite"
                    style={inputStyle}
                  />
                </Field>
              </div>
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
                onClick={() => setFormOpen(false)}
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
                {saving ? "Guardando…" : form.id ? "Actualizar" : "Crear"}
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

// ── MprRangeSlider ────────────────────────────────────────────────────
// Dos thumbs sobre el rango MPR 2.0-8.0 step 0.25. Implementación nativa
// usando dos <input type="range"> superpuestos + visualización de la barra.
function MprRangeSlider({
  min,
  max,
  disabled,
  noUpperCap,
  onChange,
}: {
  min: number;
  max: number;
  disabled?: boolean;
  noUpperCap?: boolean;
  onChange: (lo: number, hi: number) => void;
}) {
  const lo = Math.max(MPR_MIN, Math.min(min, MPR_MAX - MPR_STEP));
  const hi = Math.max(lo + MPR_STEP, Math.min(max, MPR_MAX));
  const pctLo = ((lo - MPR_MIN) / (MPR_MAX - MPR_MIN)) * 100;
  const pctHi = noUpperCap ? 100 : ((hi - MPR_MIN) / (MPR_MAX - MPR_MIN)) * 100;

  const handleLo = (v: number) => {
    const newLo = Math.min(v, hi - MPR_STEP);
    onChange(newLo, hi);
  };
  const handleHi = (v: number) => {
    const newHi = Math.max(v, lo + MPR_STEP);
    onChange(lo, newHi);
  };

  return (
    <div
      className="mp-mpr-track"
      style={{
        position: "relative",
        height: 44,
        padding: "0 4px",
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : undefined,
      }}
    >
      {/* Track de fondo */}
      <div
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          top: 20,
          height: 4,
          borderRadius: 2,
          background: "var(--muted)",
        }}
      />
      {/* Track activo */}
      <div
        style={{
          position: "absolute",
          left: `calc(${pctLo}% + 4px)`,
          width: `${pctHi - pctLo}%`,
          top: 20,
          height: 4,
          borderRadius: 2,
          background: "var(--primary)",
        }}
      />
      {/* Inputs */}
      <input
        type="range"
        min={MPR_MIN}
        max={MPR_MAX}
        step={MPR_STEP}
        value={lo}
        onChange={(e) => handleLo(Number(e.target.value))}
        disabled={disabled}
        style={{ ...rangeInputStyle, zIndex: 2 }}
      />
      <input
        type="range"
        min={MPR_MIN}
        max={MPR_MAX}
        step={MPR_STEP}
        value={hi}
        onChange={(e) => handleHi(Number(e.target.value))}
        disabled={disabled || noUpperCap}
        style={{ ...rangeInputStyle, zIndex: 3 }}
      />
      {/* Scale ticks */}
      <div
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          top: 30,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--muted-fg)",
        }}
      >
        {[2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0].map((n) => (
          <span key={n}>{n.toFixed(1)}</span>
        ))}
      </div>
    </div>
  );
}

const rangeInputStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 12,
  width: "100%",
  height: 20,
  appearance: "none",
  background: "transparent",
  pointerEvents: "auto",
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
