"use client";
// Sección Reglas del Club Config v2. CRUD real contra club_rules vía
// server actions en club-config-reglas.ts.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { VisualToggle, type SectionToast } from "./_shared";
import {
  createClubRule,
  deleteClubRule,
  toggleClubRule,
  updateClubRule,
} from "@/server/actions/club-config-reglas";

export type ClubRule = {
  id: string;
  label: string;
  description: string | null;
  icon: string;
  enabled: boolean;
  ordinal: number;
};
export type ReglasData = {
  rules: ClubRule[];
};

const MAX_RULES = 12;

// Iconos preset para el modal. Si quieres más, pedimos icono libre por texto
// pero estos cubren el 95% de casos de un club deportivo.
const ICON_PRESETS: { name: string; label: string }[] = [
  { name: "check", label: "General" },
  { name: "shirt", label: "Vestimenta" },
  { name: "footprints", label: "Calzado" },
  { name: "baby", label: "Menores" },
  { name: "paw-print", label: "Mascotas" },
  { name: "wine", label: "Alcohol" },
  { name: "music", label: "Música" },
  { name: "camera", label: "Fotos" },
  { name: "timer-off", label: "Tardanza" },
  { name: "user-plus", label: "Invitados" },
  { name: "cigarette", label: "Fumar" },
  { name: "alert-triangle", label: "Aviso" },
];

type ModalState =
  | { mode: "closed" }
  | { mode: "create"; clubId: string }
  | { mode: "edit"; rule: ClubRule };

export function ReglasSection({
  onAction,
  data,
  clubId,
}: {
  onAction: SectionToast;
  data?: ReglasData;
  clubId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });

  const rules = data?.rules ?? [];
  const activeCount = rules.filter((r) => r.enabled).length;
  const total = rules.length;
  const remaining = Math.max(0, MAX_RULES - total);
  const canCreate = Boolean(clubId) && remaining > 0;

  const refresh = () => router.refresh();

  const handleToggle = (rule: ClubRule) => {
    if (isPending) return;
    startTransition(async () => {
      const res = await toggleClubRule({ id: rule.id, enabled: !rule.enabled });
      if (res.ok) {
        onAction(!rule.enabled ? "Regla activada" : "Regla desactivada");
        refresh();
      } else {
        onAction(res.error?.message ?? "No pudimos actualizar la regla");
      }
    });
  };

  return (
    <>
      {rules.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)" }}>
          <Icon name="scroll-text" size={28} color="var(--muted-fg)" />
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a", marginTop: 8 }}>
            Todavía no hay reglas
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Agrega la primera regla para que tus clientes sepan qué se puede y qué no.
          </div>
        </div>
      ) : (
        <div className="mp-ccfg-reglas" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {rules.map((r) => (
            <div
              key={r.id}
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => setModal({ mode: "edit", rule: r })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setModal({ mode: "edit", rule: r });
                }
              }}
              style={{ padding: 16, opacity: r.enabled ? 1 : 0.55, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: r.enabled ? "rgba(16,185,129,0.1)" : "var(--muted)", color: r.enabled ? "var(--primary)" : "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={r.icon} size={16} color={r.enabled ? "var(--primary)" : "var(--muted-fg)"} />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <VisualToggle on={r.enabled} w={32} h={18} onClick={() => handleToggle(r)} />
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.25 }}>{r.label}</div>
              {r.description && (
                <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.4 }}>{r.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ padding: 16, marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--muted)", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="plus-circle" size={18} color="var(--primary)" />
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Añadir regla personalizada</div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>
              Hasta {MAX_RULES} reglas. Llevas {total} ({activeCount} activas).
            </div>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ fontSize: 10 }}
          disabled={!canCreate || isPending}
          onClick={() => {
            if (!clubId) {
              onAction("No hay club activo");
              return;
            }
            if (remaining <= 0) {
              onAction(`Máximo ${MAX_RULES} reglas`);
              return;
            }
            setModal({ mode: "create", clubId });
          }}
        >
          Nueva regla
          <Icon name="arrow-right" size={11} color="#fff" />
        </button>
      </div>

      {modal.mode !== "closed" && (
        <RuleModal
          state={modal}
          onClose={() => setModal({ mode: "closed" })}
          onToast={onAction}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function RuleModal({
  state,
  onClose,
  onToast,
  onChanged,
}: {
  state: Exclude<ModalState, { mode: "closed" }>;
  onClose: () => void;
  onToast: SectionToast;
  onChanged: () => void;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.rule : null;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "check");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      onToast("El título es obligatorio");
      return;
    }
    setBusy(true);
    try {
      if (isEdit) {
        const res = await updateClubRule({
          id: state.rule.id,
          label: trimmed,
          description: description.trim() || null,
          icon,
        });
        if (res.ok) {
          onToast("Regla actualizada");
          onChanged();
          onClose();
        } else {
          onToast(res.error?.message ?? "No pudimos guardar");
        }
      } else {
        const res = await createClubRule({
          clubId: state.clubId,
          label: trimmed,
          description: description.trim() || undefined,
          icon,
        });
        if (res.ok) {
          onToast("Regla creada");
          onChanged();
          onClose();
        } else {
          onToast(res.error?.message ?? "No pudimos crear la regla");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    setBusy(true);
    try {
      const res = await deleteClubRule({ id: state.rule.id });
      if (res.ok) {
        onToast("Regla eliminada");
        onChanged();
        onClose();
      } else {
        onToast(res.error?.message ?? "No pudimos eliminar");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 460, padding: 22, background: "#fff" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            {isEdit ? "Editar regla" : "Nueva regla"}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ background: "transparent", border: 0, cursor: "pointer", padding: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={18} color="var(--muted-fg)" />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
            Título
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="Ej. Vestimenta deportiva"
            style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
            Descripción <span style={{ color: "var(--muted-fg)", textTransform: "none", fontWeight: 600 }}>· opcional</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={240}
            rows={3}
            placeholder="Detalle corto que verán tus clientes."
            style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff", resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Icono
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
            {ICON_PRESETS.map((p) => {
              const selected = icon === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setIcon(p.name)}
                  title={p.label}
                  aria-pressed={selected}
                  style={{
                    padding: 8,
                    border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: 8,
                    background: selected ? "rgba(16,185,129,0.1)" : "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={p.name} size={16} color={selected ? "var(--primary)" : "var(--muted-fg)"} />
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="btn"
              style={{ fontSize: 11, color: "#dc2626", background: "transparent", border: "1px solid #fecaca" }}
            >
              <Icon name="trash-2" size={12} color="#dc2626" />
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn"
              style={{ fontSize: 11 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || label.trim().length === 0}
              className="btn btn-primary"
              style={{ fontSize: 11 }}
            >
              {busy ? "Guardando..." : isEdit ? "Guardar" : "Crear regla"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
