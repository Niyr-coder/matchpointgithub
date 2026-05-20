// Wizard de creación de una Quedada (juego social). Overlay tipo EditBioModal/
// RetarModal, sin cierre por click afuera (para no perder el progreso). 3 pasos:
// Básicos+categorías → Cuota+canchas → Pago+premios. Guarda todo con createQuedada
// (incl. logística, bancarios, premios y categorías iniciales). El cupo es POR
// categoría; los slots/parejas/pagos se llenan luego en gestión.
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { createQuedada } from "@/server/actions/quedadas";

type Format = "americano" | "mexicano" | "round_robin" | "kotc" | "canguil" | "libre";
type MatchMode = "singles" | "doubles";
type Visibility = "open" | "private";

// El nivel es la "Suma" (nivel combinado de la pareja): 2.0–14.0, paso 0.5.
// `noLevel` = categoría sin número (ej. Open Mixto) → oculta el slider.
type CatDraft = { name: string; suma: number; noLevel: boolean; hour: string; slots: string };

const SUMA_MIN = 2;
const SUMA_MAX = 14;

const FORMATS: { k: Format; label: string; sub: string }[] = [
  { k: "americano", label: "Americano", sub: "Rotación de parejas" },
  { k: "mexicano", label: "Mexicano", sub: "Emparejas por nivel" },
  { k: "round_robin", label: "Round Robin", sub: "Todos contra todos" },
  { k: "kotc", label: "Rey de Cancha", sub: "El que gana se queda" },
  { k: "canguil", label: "Canguil", sub: "Pozo / rotación libre" },
  { k: "libre", label: "Libre", sub: "Sin formato fijo" },
];

const STEPS = ["Básicos y categorías", "Cuota y canchas", "Pago y premios"];

function localToIso(local: string): string {
  return new Date(local).toISOString();
}
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CrearQuedadaModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);

  // Paso 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<Format>("americano");
  const [matchMode, setMatchMode] = useState<MatchMode>("doubles");
  const [visibility, setVisibility] = useState<Visibility>("open");
  const [startsLocal, setStartsLocal] = useState("");
  const [locationText, setLocationText] = useState("");
  // Paso 2
  const [feeUsd, setFeeUsd] = useState("0");
  const [courts, setCourts] = useState("");
  const [hours, setHours] = useState("");
  const [courtPriceUsd, setCourtPriceUsd] = useState("");
  // Paso 3
  const [paymentInfo, setPaymentInfo] = useState("");
  const [prizes, setPrizes] = useState("");
  const [perks, setPerks] = useState("");
  // Paso 4
  const [categories, setCategories] = useState<CatDraft[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const courtCost = useMemo(() => {
    const c = parseFloat(courts || "0");
    const h = parseFloat(hours || "0");
    const p = parseFloat(courtPriceUsd || "0");
    if (!Number.isFinite(c) || !Number.isFinite(h) || !Number.isFinite(p)) return 0;
    return Math.round(c * h * p * 100);
  }, [courts, hours, courtPriceUsd]);

  // El cupo es POR CATEGORÍA: jugadores estimados = suma de cupos × (2 dobles / 1 singles).
  const splitHint = useMemo(() => {
    const perSlot = matchMode === "doubles" ? 2 : 1;
    const players = categories.reduce((sum, c) => sum + (parseInt(c.slots || "0", 10) || 0) * perSlot, 0);
    if (courtCost <= 0 || players < 1) return null;
    return Math.round(courtCost / players);
  }, [courtCost, categories, matchMode]);

  function catHourToIso(hour: string): string | undefined {
    if (!hour) return undefined;
    const base = startsLocal ? startsLocal.split("T")[0] : new Date().toISOString().slice(0, 10);
    const d = new Date(`${base}T${hour}`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  // Validación para avanzar de paso.
  const canAdvance = (): boolean => {
    if (step === 0) {
      if (title.trim().length < 3) {
        toast({ icon: "alert-triangle", title: "Ponle un título", sub: "Mínimo 3 caracteres." });
        return false;
      }
      if (!startsLocal || Number.isNaN(Date.parse(localToIso(startsLocal)))) {
        toast({ icon: "alert-triangle", title: "Elige fecha y hora" });
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!canAdvance()) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const save = () => {
    if (pending) return;
    if (!canAdvance()) {
      setStep(0);
      return;
    }
    const feeNum = Math.round(parseFloat(feeUsd || "0") * 100);
    const feeCents = Number.isFinite(feeNum) && feeNum > 0 ? feeNum : 0;
    const courtsN = courts.trim() ? parseInt(courts, 10) : undefined;
    const hoursN = hours.trim() ? parseFloat(hours) : undefined;
    const priceCents = courtPriceUsd.trim() ? Math.round(parseFloat(courtPriceUsd) * 100) : undefined;

    const cats = categories
      .filter((c) => c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        levelLabel: c.noLevel ? undefined : `Suma ${c.suma.toFixed(1)}`,
        startsAt: catHourToIso(c.hour),
        maxSlots: c.slots.trim() ? parseInt(c.slots, 10) : undefined,
      }));

    startTransition(async () => {
      const res = await createQuedada({
        title: title.trim(),
        description: description.trim() || undefined,
        format,
        matchMode,
        visibility,
        startsAt: localToIso(startsLocal),
        locationText: locationText.trim() || undefined,
        feeCents,
        perks: perks.trim() || undefined,
        courtsCount: courtsN,
        hours: hoursN,
        courtPriceCents: priceCents,
        paymentInfo: paymentInfo.trim() || undefined,
        prizesText: prizes.trim() || undefined,
        categories: cats.length > 0 ? cats : undefined,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: res.error.message });
        return;
      }
      toast({ icon: "party-popper", title: "Quedada creada" });
      onClose();
      router.refresh();
    });
  };

  const isLast = step === STEPS.length - 1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
        animation: "mp-q-fade 160ms var(--ease-out, ease)",
      }}
    >
      <style>{`@keyframes mp-q-fade{from{opacity:0}to{opacity:1}}
        @keyframes mp-q-pop{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <div
        role="dialog"
        aria-modal="true"
        className="card"
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
          animation: "mp-q-pop 180ms var(--ease-out, ease)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "linear-gradient(135deg,#10b981,#047857)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="party-popper" size={16} color="#fff" />
            </div>
            <div>
              <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
                Crear quedada
              </h2>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 1 }}>
                Paso {step + 1} de {STEPS.length} · {STEPS[step]}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn" style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)" }} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Step bar */}
        <div style={{ display: "flex", gap: 4, padding: "0 22px 12px" }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 9999, background: i <= step ? "var(--primary)" : "var(--border)" }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 22, paddingTop: 8, display: "flex", flexDirection: "column", gap: 16, borderTop: "1px solid var(--border)" }}>
          {step === 0 && (
            <>
              <Field label="Título">
                <input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Americano del sábado en Cumbayá" style={inputStyle} />
              </Field>
              <Field label="Descripción · opcional">
                <textarea value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Cuéntale a la gente de qué va…" style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
              </Field>
              <Field label="Formato">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 8 }}>
                  {FORMATS.map((f) => {
                    const on = format === f.k;
                    return (
                      <button key={f.k} type="button" onClick={() => setFormat(f.k)} style={{ padding: 11, borderRadius: 10, border: on ? "2px solid var(--primary)" : "1px solid var(--border)", background: on ? "#ecfdf5" : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 900, color: on ? "#065f46" : "#0a0a0a" }}>{f.label}</div>
                        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{f.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Modo">
                  <div style={{ display: "flex", gap: 6 }}>
                    {([{ k: "doubles" as const, l: "Dobles", i: "users" }, { k: "singles" as const, l: "Singles", i: "user" }]).map((o) => {
                      const on = matchMode === o.k;
                      return (
                        <button key={o.k} type="button" onClick={() => setMatchMode(o.k)} style={{ ...segBtn, ...(on ? segBtnOn : {}) }}>
                          <Icon name={o.i} size={12} color={on ? "#065f46" : "#0a0a0a"} />{o.l}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Visibilidad">
                  <div style={{ display: "flex", gap: 6 }}>
                    {([{ k: "open" as const, l: "Abierta", i: "globe" }, { k: "private" as const, l: "Privada", i: "lock" }]).map((o) => {
                      const on = visibility === o.k;
                      return (
                        <button key={o.k} type="button" onClick={() => setVisibility(o.k)} style={{ ...segBtn, ...(on ? segBtnOn : {}) }}>
                          <Icon name={o.i} size={12} color={on ? "#065f46" : "#0a0a0a"} />{o.l}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Fecha y hora">
                  <input type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Lugar · opcional">
                  <input value={locationText} maxLength={140} onChange={(e) => setLocationText(e.target.value)} placeholder="Club, cancha o dirección" style={inputStyle} />
                </Field>
              </div>
              <Field label="Categorías · opcional">
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginBottom: 8 }}>
                  Define las categorías (ej. Suma 6.0 · 7pm, Open Mixto · 8pm). Las parejas y los slots los
                  llenas después en <strong>Gestionar</strong>.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {categories.map((c, i) => {
                    const setCat = (patch: Partial<CatDraft>) =>
                      setCategories((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input value={c.name} placeholder="Nombre (ej. Suma 6.0, Open Mixto)" style={{ ...inputStyle, flex: 1 }} onChange={(e) => setCat({ name: e.target.value })} />
                          <button type="button" onClick={() => setCategories((arr) => arr.filter((_, j) => j !== i))} className="btn" style={{ background: "#fff", border: "1px solid #fecaca", color: "#dc2626", padding: "0 12px" }} aria-label="Quitar categoría">
                            <Icon name="trash-2" size={14} />
                          </button>
                        </div>

                        {/* Nivel (Suma) */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: c.noLevel ? "var(--muted-fg)" : "#0a0a0a" }}>
                              Nivel (Suma){c.noLevel ? "" : <span style={{ color: "var(--primary)", marginLeft: 6 }}>{c.suma.toFixed(1)}</span>}
                            </span>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--muted-fg)", cursor: "pointer" }}>
                              <input type="checkbox" checked={c.noLevel} onChange={(e) => setCat({ noLevel: e.target.checked })} style={{ accentColor: "var(--primary)" }} />
                              Sin nivel (Open)
                            </label>
                          </div>
                          {!c.noLevel && (
                            <>
                              <input type="range" min={SUMA_MIN} max={SUMA_MAX} step={0.5} value={c.suma} onChange={(e) => setCat({ suma: parseFloat(e.target.value) })} style={{ width: "100%", accentColor: "var(--primary)", cursor: "pointer" }} />
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--muted-fg)" }}>
                                <span>{SUMA_MIN.toFixed(1)}</span>
                                <span>{SUMA_MAX.toFixed(1)}</span>
                              </div>
                            </>
                          )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <input type="time" value={c.hour} style={inputStyle} onChange={(e) => setCat({ hour: e.target.value })} />
                          <input type="number" min={1} value={c.slots} placeholder="Cupos" style={inputStyle} onChange={(e) => setCat({ slots: e.target.value })} />
                        </div>
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => setCategories((arr) => [...arr, { name: "", suma: 6, noLevel: false, hour: "", slots: "" }])} className="btn btn-outline" style={{ alignSelf: "flex-start" }}>
                    <Icon name="plus" size={13} /> Agregar categoría
                  </button>
                </div>
                <Hint>El cupo se define por categoría (cupos de arriba), no global.</Hint>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Cuota de inscripción · USD">
                <input type="number" min={0} step="0.5" value={feeUsd} onChange={(e) => setFeeUsd(e.target.value)} placeholder="0" style={inputStyle} />
                <Hint>0 = gratis. Si cobras cuota, el jugador sube comprobante (transferencia).</Hint>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="Canchas"><input type="number" min={1} max={64} value={courts} onChange={(e) => setCourts(e.target.value)} placeholder="Ej. 2" style={inputStyle} /></Field>
                <Field label="Horas"><input type="number" min={0.5} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Ej. 3" style={inputStyle} /></Field>
                <Field label="Precio/hora $"><input type="number" min={0} step="0.5" value={courtPriceUsd} onChange={(e) => setCourtPriceUsd(e.target.value)} placeholder="Ej. 10" style={inputStyle} /></Field>
              </div>
              {courtCost > 0 && (
                <div style={{ padding: 12, borderRadius: 10, background: "#f5f5f4", fontSize: 12.5 }}>
                  <div style={{ fontWeight: 800 }}>Costo de cancha: {money(courtCost)}</div>
                  {splitHint != null && (
                    <div style={{ color: "var(--muted-fg)", marginTop: 3 }}>
                      ≈ {money(splitHint)} por jugador {visibility === "private" ? "(reparto entre los cupos de las categorías)" : "(referencia para la cuota)"}.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Datos para el pago · opcional">
                <textarea value={paymentInfo} maxLength={500} onChange={(e) => setPaymentInfo(e.target.value)} placeholder={"Banco Pichincha\nAhorros · 2213691106\nCédula 1312865700\nIvette Ponce M."} style={{ ...inputStyle, minHeight: 90, resize: "vertical", whiteSpace: "pre-wrap" }} />
                <Hint>Lo verán los inscritos para transferir.</Hint>
              </Field>
              <Field label="Premios · opcional">
                <textarea value={prizes} maxLength={500} onChange={(e) => setPrizes(e.target.value)} placeholder={"🥇 1ro: $20\n🥈 2do: 50% próxima inscripción\n🥉 3ro: media Cañuela"} style={{ ...inputStyle, minHeight: 70, resize: "vertical", whiteSpace: "pre-wrap" }} />
              </Field>
              <Field label="Perks · opcional">
                <textarea value={perks} maxLength={280} onChange={(e) => setPerks(e.target.value)} placeholder="Ej. incluye pelotas, hidratación y snacks" style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} />
              </Field>
            </>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", background: "#fafafa", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button onClick={step === 0 ? onClose : back} className="btn btn-outline" disabled={pending}>
            {step === 0 ? "Cancelar" : "Atrás"}
          </button>
          {isLast ? (
            <button onClick={save} className="btn btn-primary" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
              {!pending && <Icon name="party-popper" size={13} color="#fff" />}
              {pending ? "Creando…" : "Crear quedada"}
            </button>
          ) : (
            <button onClick={next} className="btn btn-primary">
              Siguiente <Icon name="arrow-right" size={13} color="#fff" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-mp" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 5 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  color: "#0a0a0a",
};
const segBtn: React.CSSProperties = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "9px 6px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 800,
  color: "#0a0a0a",
};
const segBtnOn: React.CSSProperties = {
  border: "2px solid var(--primary)",
  background: "#ecfdf5",
  color: "#065f46",
};
