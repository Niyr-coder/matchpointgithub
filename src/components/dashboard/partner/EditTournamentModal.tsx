"use client";
// Modal de edición rápida del torneo para partner/admin.
// Campos: nombre, fechas, cupos, cuota, premio, política de pago.
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { updateTournamentByOrganizer } from "@/server/actions/tournaments";

export type EditableTournament = {
  id: string;
  name: string;
  startsAt: string; // ISO con offset
  endsAt: string | null;
  maxParticipants: number | null;
  entryFeeCents: number;
  prizePoolCents: number | null;
  paymentPolicy: "free" | "prepay" | "onsite" | "flexible";
};

type Props = {
  tournament: EditableTournament;
  open: boolean;
  onClose: () => void;
};

const POLICY_OPTIONS: Array<{ value: EditableTournament["paymentPolicy"]; label: string; sub: string }> = [
  { value: "prepay", label: "Online (transferencia)", sub: "El jugador sube comprobante antes" },
  { value: "onsite", label: "En club", sub: "Paga al llegar al torneo" },
  { value: "flexible", label: "Flexible", sub: "El jugador elige online o en club" },
  { value: "free", label: "Gratis", sub: "Sin cuota de inscripción" },
];

// Convierte ISO con offset a string para input datetime-local (YYYY-MM-DDTHH:mm).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  // new Date() en el navegador interpreta el datetime-local como tiempo local.
  return new Date(local).toISOString();
}

export function EditTournamentModal({ tournament, open, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(tournament.name);
  const [startsAt, setStartsAt] = useState(isoToLocalInput(tournament.startsAt));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(tournament.endsAt));
  const [singleDay, setSingleDay] = useState<boolean>(tournament.endsAt == null);
  const [maxParticipants, setMaxParticipants] = useState<string>(
    tournament.maxParticipants != null ? String(tournament.maxParticipants) : "",
  );
  const [entryFee, setEntryFee] = useState<string>(
    String(Math.round(tournament.entryFeeCents / 100)),
  );
  const [prize, setPrize] = useState<string>(
    tournament.prizePoolCents != null
      ? String(Math.round(tournament.prizePoolCents / 100))
      : "",
  );
  const [paymentPolicy, setPaymentPolicyRaw] = useState(tournament.paymentPolicy);

  // Mantener cuota y policy coherentes para que el validador del server no
  // se queje: "Gratis" implica cuota=0, y cualquier otra policy implica >0.
  const setPaymentPolicy = (next: EditableTournament["paymentPolicy"]) => {
    setPaymentPolicyRaw(next);
    if (next === "free") setEntryFee("0");
    else if (Number(entryFee) === 0) setEntryFee("");
  };
  const onEntryFeeChange = (v: string) => {
    setEntryFee(v);
    const n = Number(v);
    if (n > 0 && paymentPolicy === "free") setPaymentPolicyRaw("prepay");
    if (v !== "" && n === 0 && paymentPolicy !== "free") setPaymentPolicyRaw("free");
  };

  // Reset al abrir para que refleje el torneo actual.
  useEffect(() => {
    if (!open) return;
    setName(tournament.name);
    setStartsAt(isoToLocalInput(tournament.startsAt));
    setEndsAt(isoToLocalInput(tournament.endsAt));
    setSingleDay(tournament.endsAt == null);
    setMaxParticipants(
      tournament.maxParticipants != null ? String(tournament.maxParticipants) : "",
    );
    setEntryFee(String(Math.round(tournament.entryFeeCents / 100)));
    setPrize(
      tournament.prizePoolCents != null
        ? String(Math.round(tournament.prizePoolCents / 100))
        : "",
    );
    setPaymentPolicyRaw(tournament.paymentPolicy);
  }, [open, tournament]);

  if (!open) return null;

  const onSave = () => {
    if (saving) return;
    if (name.trim().length < 2) {
      toast({ icon: "alert-triangle", title: "Nombre inválido" });
      return;
    }
    const feeNum = paymentPolicy === "free" ? 0 : Number(entryFee);
    if (Number.isNaN(feeNum) || feeNum < 0) {
      toast({ icon: "alert-triangle", title: "Cuota inválida" });
      return;
    }
    if (feeNum > 0 && paymentPolicy === "free") {
      toast({
        icon: "alert-triangle",
        title: "Cuota y método no coinciden",
        sub: "Pon $0 o cambia el método de pago.",
      });
      return;
    }
    if (feeNum === 0 && paymentPolicy !== "free") {
      toast({
        icon: "alert-triangle",
        title: "Cuota y método no coinciden",
        sub: "Si la cuota es $0 el método debe ser Gratis.",
      });
      return;
    }
    const prizeNum = prize === "" ? null : Number(prize);
    if (prizeNum != null && (Number.isNaN(prizeNum) || prizeNum < 0)) {
      toast({ icon: "alert-triangle", title: "Premio inválido" });
      return;
    }
    const capNum = maxParticipants === "" ? null : Number(maxParticipants);
    if (capNum != null && (!Number.isInteger(capNum) || capNum <= 0)) {
      toast({ icon: "alert-triangle", title: "Cupos inválidos" });
      return;
    }

    setSaving(true);
    startTx(async () => {
      const res = await updateTournamentByOrganizer({
        tournamentId: tournament.id,
        patch: {
          name: name.trim(),
          startsAt: localInputToIso(startsAt),
          endsAt: singleDay || !endsAt ? null : localInputToIso(endsAt),
          maxParticipants: capNum,
          entryFeeCents: Math.round(feeNum * 100),
          prizePoolCents: prizeNum != null ? Math.round(prizeNum * 100) : null,
          paymentPolicy,
        },
      });
      setSaving(false);
      if (res.ok) {
        toast({ icon: "check", title: "Torneo actualizado" });
        onClose();
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

  return (
    <div
      className="mp-modal-backdrop mp-tournament-create-modal"
      onClick={onClose}
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
        className="mp-modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <div>
            <div className="label-mp">Editar torneo</div>
            <h2
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                margin: "4px 0 0",
              }}
            >
              {tournament.name}
              <span style={{ color: "var(--primary)" }}>.</span>
            </h2>
          </div>
          <button
            onClick={onClose}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
          <Field label="Nombre">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mp-input"
              style={inputStyle}
            />
          </Field>

          <div className="mp-tournament-form-grid-2">
            <Field label="Inicio">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Fin">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <div className="mp-tournament-form-grid-3">
            <Field label="Cupos">
              <input
                type="number"
                min={1}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                placeholder="Sin límite"
                style={inputStyle}
              />
            </Field>
            <Field label="Cuota (USD)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={entryFee}
                onChange={(e) => onEntryFeeChange(e.target.value)}
                disabled={paymentPolicy === "free"}
                placeholder={paymentPolicy === "free" ? "Gratis" : "0.00"}
                style={{
                  ...inputStyle,
                  opacity: paymentPolicy === "free" ? 0.55 : 1,
                  cursor: paymentPolicy === "free" ? "not-allowed" : "text",
                }}
              />
            </Field>
            <Field label="Premio (USD)">
              <input
                type="number"
                min={0}
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                placeholder="—"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Método de pago">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {POLICY_OPTIONS.map((opt) => {
                const active = paymentPolicy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPaymentPolicy(opt.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: active ? "#0a0a0a" : "#fff",
                      color: active ? "#fff" : "#0a0a0a",
                      border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      transition: "background 140ms var(--ease-out)",
                    }}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: `2px solid ${active ? "var(--primary)" : "var(--border)"}`,
                        background: active ? "var(--primary)" : "transparent",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800 }}>{opt.label}</div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: active ? "rgba(255,255,255,0.7)" : "var(--muted-fg)",
                          marginTop: 2,
                        }}
                      >
                        {opt.sub}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 22,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            onClick={onClose}
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
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
