"use client";
// CRUD inline de premios del torneo: puesto + premio + valor opcional +
// patrocinador opcional. La suma de valueCents alimenta el "prize pool"
// total que se muestra en el header.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  createTournamentPrize,
  updateTournamentPrize,
  deleteTournamentPrize,
} from "@/server/actions/tournaments";

export type PrizeRow = {
  id: string;
  position: number;
  placeLabel: string;
  prizeLabel: string;
  valueCents: number | null;
  sponsor: string | null;
};

type FormState = {
  id: string | null;
  placeLabel: string;
  prizeLabel: string;
  value: string;
  sponsor: string;
};

const EMPTY: FormState = {
  id: null,
  placeLabel: "1°",
  prizeLabel: "",
  value: "",
  sponsor: "",
};

// Sugerencias de puestos para el quick-pick.
const PLACE_SUGGESTIONS = ["1°", "2°", "3°", "4°", "Mejor remontada", "Fair play", "Otros"];

export function PrizesPanel({
  tournamentId,
  initialPrizes,
  readOnly,
}: {
  tournamentId: string;
  initialPrizes: PrizeRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () => initialPrizes.reduce((s, p) => s + (p.valueCents ?? 0), 0),
    [initialPrizes],
  );

  const openCreate = () => {
    // Próximo puesto sugerido según los ya existentes.
    const usedPlaces = new Set(initialPrizes.map((p) => p.placeLabel));
    const suggested = PLACE_SUGGESTIONS.find((s) => !usedPlaces.has(s)) ?? "1°";
    setForm({ ...EMPTY, placeLabel: suggested });
    setOpen(true);
  };
  const openEdit = (p: PrizeRow) => {
    setForm({
      id: p.id,
      placeLabel: p.placeLabel,
      prizeLabel: p.prizeLabel,
      value: p.valueCents != null ? String(Math.round(p.valueCents / 100)) : "",
      sponsor: p.sponsor ?? "",
    });
    setOpen(true);
  };

  const onSave = () => {
    if (saving) return;
    if (form.placeLabel.trim().length < 1) {
      toast({ icon: "alert-triangle", title: "Falta el puesto" });
      return;
    }
    if (form.prizeLabel.trim().length < 1) {
      toast({ icon: "alert-triangle", title: "Falta la descripción del premio" });
      return;
    }
    const valueNum = form.value.trim() === "" ? null : Number(form.value);
    if (valueNum != null && (Number.isNaN(valueNum) || valueNum < 0)) {
      toast({ icon: "alert-triangle", title: "Valor inválido" });
      return;
    }
    const body = {
      placeLabel: form.placeLabel.trim(),
      prizeLabel: form.prizeLabel.trim(),
      valueCents: valueNum != null ? Math.round(valueNum * 100) : null,
      sponsor: form.sponsor.trim() === "" ? null : form.sponsor.trim(),
    };
    setSaving(true);
    startTx(async () => {
      const res = form.id
        ? await updateTournamentPrize({ tournamentId, prizeId: form.id, body })
        : await createTournamentPrize({ tournamentId, body });
      setSaving(false);
      if (res.ok) {
        toast({ icon: "check", title: form.id ? "Premio actualizado" : "Premio añadido" });
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

  const onDelete = async (p: PrizeRow) => {
    const ok = await confirm({
      title: "Borrar premio",
      body: `¿Borrar el premio "${p.placeLabel} · ${p.prizeLabel}"?`,
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    startTx(async () => {
      const res = await deleteTournamentPrize({ tournamentId, prizeId: p.id });
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
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div>
          <div className="label-mp">Premios</div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            {initialPrizes.length === 0
              ? "Sin premios. Agrega trofeos, kits o efectivo por puesto."
              : `${initialPrizes.length} premio${initialPrizes.length === 1 ? "" : "s"} · Total monetario: $${(total / 100).toLocaleString("en-US")}`}
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={openCreate}
            className="btn btn-primary"
            style={{ fontSize: 11.5, padding: "8px 12px" }}
          >
            <Icon name="plus" size={12} color="#fff" />
            Añadir premio
          </button>
        )}
      </div>

      {initialPrizes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...initialPrizes]
            .sort((a, b) => a.position - b.position || a.placeLabel.localeCompare(b.placeLabel))
            .map((p) => (
              <div key={p.id} className="mp-tournament-prize-row">
                <div
                  className="font-heading"
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    color: "#0a0a0a",
                  }}
                >
                  {p.placeLabel}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a" }}>
                    {p.prizeLabel}
                  </div>
                  {p.sponsor && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        color: "var(--muted-fg)",
                        textTransform: "uppercase",
                        marginTop: 3,
                      }}
                    >
                      <Icon name="award" size={10} /> {p.sponsor}
                    </div>
                  )}
                </div>
                <div
                  className="font-heading tabular"
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color: p.valueCents ? "var(--primary)" : "var(--muted-fg)",
                    textAlign: "right",
                  }}
                >
                  {p.valueCents ? `$${Math.round(p.valueCents / 100).toLocaleString("en-US")}` : "—"}
                </div>
                {!readOnly && (
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => openEdit(p)}
                      style={iconBtnStyle}
                      aria-label="Editar"
                    >
                      <Icon name="pencil" size={12} />
                    </button>
                    <button
                      onClick={() => onDelete(p)}
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
              maxWidth: 520,
              background: "#fff",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div className="label-mp">{form.id ? "Editar premio" : "Nuevo premio"}</div>
                <h3 className="font-heading" style={{ fontSize: 20, fontWeight: 900, margin: "4px 0 0" }}>
                  {form.placeLabel || "Premio"}
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
              <Field label="Puesto / categoría">
                <input
                  type="text"
                  value={form.placeLabel}
                  onChange={(e) => setForm({ ...form, placeLabel: e.target.value })}
                  placeholder='Ej: "1°", "Mejor remontada"'
                  style={inputStyle}
                />
                {/* Quick-pick */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {PLACE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, placeLabel: s })}
                      style={{
                        padding: "4px 10px",
                        fontSize: 10.5,
                        fontWeight: 700,
                        borderRadius: 6,
                        background:
                          form.placeLabel === s ? "#0a0a0a" : "var(--muted)",
                        color: form.placeLabel === s ? "#fff" : "var(--muted-fg)",
                        border: 0,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Premio">
                <input
                  type="text"
                  value={form.prizeLabel}
                  onChange={(e) => setForm({ ...form, prizeLabel: e.target.value })}
                  placeholder="Ej: Trofeo + $500 + kit Selkirk"
                  style={inputStyle}
                />
              </Field>

              <div className="mp-tournament-form-grid-2">
                <Field label="Valor monetario (USD, opcional)">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="—"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Patrocinador (opcional)">
                  <input
                    type="text"
                    value={form.sponsor}
                    onChange={(e) => setForm({ ...form, sponsor: e.target.value })}
                    placeholder="Ej: Selkirk"
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
