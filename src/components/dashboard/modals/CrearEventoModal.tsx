// CrearEventoModal — migrado 1:1 desde ui_kits/dashboard/CrearEventoModal.jsx
// Wizard 4 pasos (Tipo → Básicos → Cupos+Premios → Publicar). Escucha 'mp-open-crear-evento'
// con CustomEvent.detail = { clubId, clubName? } para resolver la sede.
"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { createEvent, publishEvent } from "@/server/actions/events";

type EvType = "torneo" | "liga" | "social" | "clinic";
type Sport = "pickleball" | "padel" | "tenis" | "futbol";
type Visibility = "public" | "members" | "private";
type PaymentPolicy = "prepay" | "onsite" | "flexible";

const PAYMENT_POLICY_OPTIONS: { value: PaymentPolicy; label: string; hint: string }[] = [
  {
    value: "prepay",
    label: "Pago previo (online)",
    hint: "El jugador sube comprobante. Admin lo aprueba antes del evento.",
  },
  {
    value: "onsite",
    label: "Pago en sitio",
    hint: "El jugador paga en mostrador el día del evento. Inscripción inmediata.",
  },
  {
    value: "flexible",
    label: "Elige el jugador",
    hint: "Cada jugador decide entre pagar online o en sitio al inscribirse.",
  },
];

type Form = {
  type: EvType;
  sport: Sport;
  name: string;
  start: string; // datetime-local
  end: string;   // datetime-local
  clubId: string | null;
  venue: string;
  format: string;
  level: string;
  desc: string;
  slots: number;
  fee: number;
  paymentPolicy: PaymentPolicy;
  prize: number;
  waitlist: boolean;
  levelGate: boolean;
  pairTogether: boolean;
  membersOnly: boolean;
  visibility: Visibility;
  boost: boolean;
};

function defaultDateTime(daysFromNow: number, hour = 18): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const INITIAL: Form = {
  type: "torneo",
  sport: "pickleball",
  name: "",
  start: defaultDateTime(7),
  end: defaultDateTime(9),
  clubId: null,
  venue: "",
  format: "Eliminación directa · mejor de 3",
  level: "3.0–4.5",
  desc: "",
  slots: 16,
  fee: 0,
  paymentPolicy: "prepay",
  prize: 0,
  waitlist: true,
  levelGate: false,
  pairTogether: false,
  membersOnly: false,
  visibility: "public",
  boost: false,
};

// Mapeo del tipo del wizard a `kind` del enum mp_event_status events.kind.
// "torneo" se modela como "other" en `events` (los tournaments reales viven en tabla aparte).
const KIND_MAP: Record<EvType, "other" | "league_meet" | "social" | "clinic"> = {
  torneo: "other",
  liga: "league_meet",
  social: "social",
  clinic: "clinic",
};

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `evento-${Date.now().toString(36)}`
  );
}

const STEPS = ["Tipo", "Básicos", "Cupos & Premios", "Publicar"];

export function CrearEventoModal() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pub, setPub] = useState<{ id: string; slug: string } | false>(false);
  const [form, setForm] = useState<Form>(INITIAL);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ clubId?: string; clubName?: string }>).detail;
      setOpen(true);
      setStep(0);
      setPub(false);
      setForm({
        ...INITIAL,
        clubId: detail?.clubId ?? null,
        venue: detail?.clubName ?? "",
      });
    };
    window.addEventListener("mp-open-crear-evento", handler);
    return () => window.removeEventListener("mp-open-crear-evento", handler);
  }, []);

  if (!open) return null;
  const close = () => setOpen(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): string | null => {
    if (!form.clubId) return "Falta el club anfitrión. Abre el modal desde la pantalla del club.";
    if (form.name.trim().length < 2) return "El nombre del evento es obligatorio.";
    if (!form.start || !form.end) return "Las fechas son obligatorias.";
    const s = new Date(form.start);
    const e = new Date(form.end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return "Fechas inválidas.";
    if (e <= s) return "La fecha de fin debe ser posterior a la de inicio.";
    return null;
  };

  const handlePublish = () => {
    const err = validate();
    if (err) {
      toast({ icon: "alert-triangle", title: "No se puede publicar", sub: err });
      return;
    }
    startSubmit(async () => {
      const created = await createEvent({
        clubId: form.clubId!,
        name: form.name.trim(),
        slug: slugify(form.name),
        description: form.desc.trim() || undefined,
        kind: KIND_MAP[form.type],
        startsAt: new Date(form.start).toISOString(),
        endsAt: new Date(form.end).toISOString(),
        capacity: form.slots > 0 ? form.slots : undefined,
        priceCents: Math.round((form.fee || 0) * 100),
        currency: "USD",
        paymentPolicy: form.fee > 0 ? form.paymentPolicy : undefined,
        visibility: form.visibility,
      });
      if (!created.ok) {
        toast({ icon: "alert-triangle", title: "Error al crear", sub: created.error.message });
        return;
      }
      const ev = created.data;
      const published = await publishEvent({ id: ev.id });
      if (!published.ok) {
        toast({
          icon: "alert-triangle",
          title: "Evento creado pero no publicado",
          sub: published.error.message,
        });
        setPub({ id: ev.id, slug: ev.slug });
        return;
      }
      toast({ icon: "rocket", title: "Evento publicado", sub: ev.name });
      setPub({ id: ev.id, slug: ev.slug });
    });
  };

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "100%",
          maxWidth: 980,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            padding: "14px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#0a0a0a",
            color: "#fff",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--primary)", fontSize: 16, fontWeight: 900 }}>●</span>
            <span
              className="font-heading"
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              MATCHPOINT
            </span>
            <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
              {pub ? "Evento publicado" : "Crear evento"}
            </span>
            {!pub && (
              <span
                style={{
                  marginLeft: 6,
                  padding: "3px 8px",
                  borderRadius: 9999,
                  background: "rgba(16,185,129,0.18)",
                  color: "var(--primary)",
                  fontSize: 8.5,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                ● OWNER · Club Norte
              </span>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {!pub && (
              <span
                style={{
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.7)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icon name="save" size={11} color="rgba(255,255,255,0.7)" />
                Borrador guardado
              </span>
            )}
            <button
              onClick={close}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="x" size={14} color="#fff" />
            </button>
          </div>
        </div>

        {!pub && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 24px",
              borderBottom: "1px solid var(--border)",
              background: "#fff",
            }}
          >
            {STEPS.map((s, i) => {
              const done = i < step;
              const cur = i === step;
              return (
                <div key={s} style={{ display: "contents" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      opacity: done || cur ? 1 : 0.45,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: done ? "var(--primary)" : cur ? "#0a0a0a" : "#fff",
                        border: done || cur ? "0" : "1px solid var(--border)",
                        color: done || cur ? "#fff" : "#0a0a0a",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10.5,
                        fontWeight: 900,
                        fontFamily: "Plus Jakarta Sans",
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: cur ? 900 : 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: cur ? "#0a0a0a" : "var(--muted-fg)",
                      }}
                    >
                      {s}
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        background: i < step ? "var(--primary)" : "var(--border)",
                        margin: "0 12px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {pub ? (
            <CEDone form={form} eventId={pub.id} eventSlug={pub.slug} close={close} />
          ) : step === 0 ? (
            <CEStep1 form={form} set={set} />
          ) : step === 1 ? (
            <CEStep2 form={form} set={set} />
          ) : step === 2 ? (
            <CEStep3 form={form} set={set} />
          ) : (
            <CEStep4 form={form} set={set} />
          )}
        </div>

        {!pub && (
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              background: "#fafafa",
            }}
          >
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
              onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
              disabled={submitting}
            >
              <Icon name="arrow-left" size={13} />
              {step === 0 ? "Cancelar" : "Atrás"}
            </button>
            <button
              className="btn btn-primary"
              disabled={submitting}
              onClick={() => (step === 3 ? handlePublish() : setStep((s) => s + 1))}
            >
              {step === 3 ? (
                <>
                  <Icon name="rocket" size={13} color="#fff" />
                  {submitting ? "Publicando…" : "Publicar evento"}
                </>
              ) : step === 2 ? (
                <>
                  Revisar y publicar
                  <Icon name="arrow-right" size={13} color="#fff" />
                </>
              ) : (
                <>
                  Continuar
                  <Icon name="arrow-right" size={13} color="#fff" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type Setter = <K extends keyof Form>(k: K, v: Form[K]) => void;

const TYPES: { k: EvType; t: string; sub: string; d: string; i: string; tag?: string; n?: string; dimmed?: boolean }[] = [
  { k: "torneo", t: "Torneo", sub: "Eliminación directa o mejor de N", d: "Cuadro, llaves, premios. Lo más común — fin de semana intensivo.", tag: "POPULAR", i: "trophy", n: "124 al mes" },
  { k: "liga", t: "Liga", sub: "Round-robin · varias fechas", d: "Múltiples jornadas, tabla de posiciones, ascensos / descensos.", i: "list-ordered", n: "38 al mes" },
  { k: "social", t: "Social", sub: "Mixto sorteado · sin tabla", d: "Mezcla niveles, conoce gente, snacks y música. Sin presión.", i: "sparkles", n: "92 al mes" },
  { k: "clinic", t: "Clinic / clase", sub: "Entreno grupal con coach", d: "Sesión técnica de 1–3 horas. Cupos cerrados, sin premios.", i: "graduation-cap", n: "COACH", dimmed: true },
];

const SPORTS: { k: Sport; t: string; i: string; disabled?: boolean }[] = [
  { k: "pickleball", t: "Pickleball", i: "🏓" },
  { k: "padel", t: "Pádel", i: "🎾" },
  { k: "tenis", t: "Tenis", i: "🏸" },
  { k: "futbol", t: "Fútbol", i: "⚽", disabled: true },
];

function CEStep1({ form, set }: { form: Form; set: Setter }) {
  return (
    <div>
      <div className="label-mp">Paso 1 de 4</div>
      <h2
        className="font-heading"
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          margin: "6px 0 4px",
        }}
      >
        ¿Qué quieres crear?<span style={{ color: "var(--primary)" }}>.</span>
      </h2>
      <div style={{ fontSize: 12.5, color: "var(--muted-fg)", marginBottom: 18 }}>
        Cada tipo trae plantilla de cronograma, formato y reglas. Puedes ajustar todo en el paso 2.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 10,
          marginBottom: 22,
        }}
      >
        {TYPES.map((t) => {
          const active = form.type === t.k;
          return (
            <button
              key={t.k}
              disabled={t.dimmed}
              onClick={() => !t.dimmed && set("type", t.k)}
              style={{
                textAlign: "left",
                padding: 14,
                borderRadius: 12,
                fontFamily: "inherit",
                cursor: t.dimmed ? "not-allowed" : "pointer",
                background: active ? "#ecfdf5" : "#fff",
                border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
                opacity: t.dimmed ? 0.55 : 1,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {t.tag && (
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "#fbbf24",
                    color: "#0a0a0a",
                    fontSize: 8.5,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                  }}
                >
                  {t.tag}
                </span>
              )}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: active ? "var(--primary)" : "#0a0a0a",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                <Icon name={t.i} size={15} color="#fff" />
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em" }}
              >
                {t.t}
              </div>
              <div
                style={{
                  fontSize: 9.5,
                  color: "var(--primary)",
                  fontWeight: 800,
                  marginTop: 2,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {t.sub}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--muted-fg)",
                  marginTop: 8,
                  lineHeight: 1.4,
                  minHeight: 42,
                }}
              >
                {t.d}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--muted-fg)",
                  marginTop: 6,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {t.dimmed ? "○ Solo rol coach" : "● " + t.n}
              </div>
            </button>
          );
        })}
      </div>

      <div className="label-mp" style={{ marginBottom: 8 }}>
        Deporte
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {SPORTS.map((s) => {
          const active = form.sport === s.k;
          return (
            <button
              key={s.k}
              disabled={s.disabled}
              onClick={() => !s.disabled && set("sport", s.k)}
              style={{
                padding: "10px 18px",
                borderRadius: 9999,
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: active ? "#0a0a0a" : "#fff",
                color: active ? "#fff" : s.disabled ? "var(--muted-fg)" : "#0a0a0a",
                border: "1px solid " + (active ? "#0a0a0a" : "var(--border)"),
                cursor: s.disabled ? "not-allowed" : "pointer",
                opacity: s.disabled ? 0.55 : 1,
              }}
            >
              <span style={{ fontSize: 14 }}>{s.i}</span>
              {s.t}
              {s.disabled && (
                <span
                  style={{
                    fontSize: 8.5,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "var(--muted)",
                    color: "var(--muted-fg)",
                  }}
                >
                  Pronto
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CEField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span className="label-mp">{label}</span>
        {hint && <span style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const ceInputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: "inherit",
  background: "#fff",
} as const;

function CEStep2({ form, set }: { form: Form; set: Setter }) {
  const inp = (val: string, k: keyof Form) => (
    <input value={val} onChange={(e) => set(k, e.target.value as never)} style={ceInputStyle} />
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22 }}>
      <div>
        <div className="label-mp">Paso 2 de 4</div>
        <h2
          className="font-heading"
          style={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "6px 0 18px",
          }}
        >
          Lo básico<span style={{ color: "var(--primary)" }}>.</span>
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CEField label="Nombre del evento" hint="Aparece en la card destacada">
            {inp(form.name, "name")}
          </CEField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <CEField label="Desde">
              <input
                type="datetime-local"
                value={form.start}
                onChange={(e) => set("start", e.target.value)}
                style={ceInputStyle}
              />
            </CEField>
            <CEField label="Hasta">
              <input
                type="datetime-local"
                value={form.end}
                onChange={(e) => set("end", e.target.value)}
                style={ceInputStyle}
              />
            </CEField>
          </div>
          <CEField label="Sede" hint="Club anfitrión">
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: form.clubId ? "#fff" : "#fafafa",
                opacity: form.clubId ? 1 : 0.7,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: form.clubId
                    ? "linear-gradient(135deg,#10b981,#064e3b)"
                    : "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                }}
              >
                <Icon name="building-2" size={13} color={form.clubId ? "#fff" : "var(--muted-fg)"} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 900 }}>
                  {form.venue || "Sin club resuelto"}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                  {form.clubId ? "Club activo del owner" : "Abre el modal desde la pantalla del club"}
                </div>
              </div>
            </div>
          </CEField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <CEField label="Formato">
              <select
                value={form.format}
                onChange={(e) => set("format", e.target.value)}
                style={ceInputStyle}
              >
                <option>Eliminación directa · mejor de 3</option>
                <option>Round-robin</option>
                <option>Grupos + playoffs</option>
              </select>
            </CEField>
            <CEField label="Nivel">
              <div style={{ display: "flex", gap: 4 }}>
                {["2.0", "3.0", "3.5", "4.0", "4.5", "5.0"].map((n, i) => (
                  <span
                    key={n}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      textAlign: "center",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 900,
                      fontFamily: "Plus Jakarta Sans",
                      background: i >= 1 && i <= 4 ? "var(--primary)" : "#fff",
                      color: i >= 1 && i <= 4 ? "#fff" : "#0a0a0a",
                      border:
                        "1px solid " + (i >= 1 && i <= 4 ? "var(--primary)" : "var(--border)"),
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </CEField>
          </div>
          <CEField label="Descripción corta" hint="Máx 180 caracteres">
            <textarea
              value={form.desc}
              onChange={(e) => set("desc", e.target.value)}
              style={{ ...ceInputStyle, minHeight: 64, resize: "none" }}
            />
          </CEField>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="label-mp">Imagen de portada</div>
        <div
          style={{
            height: 140,
            borderRadius: 12,
            background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
            position: "relative",
            overflow: "hidden",
            border: "1.5px dashed var(--border)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <Icon name="image-up" size={22} color="#fff" />
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                marginTop: 6,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Arrastra una foto
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              16:9 · JPG / PNG · máx 4 MB
            </div>
            <button
              style={{
                marginTop: 8,
                padding: "5px 12px",
                borderRadius: 9999,
                background: "var(--primary)",
                color: "#fff",
                border: 0,
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Subir archivo
            </button>
          </div>
        </div>

        <div className="label-mp" style={{ marginTop: 4 }}>
          Vista previa
        </div>
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
            color: "#fff",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 120,
              color: "rgba(16,185,129,0.07)",
              letterSpacing: "-0.06em",
              lineHeight: 0.8,
              transform: "rotate(-6deg) translate(15%, -15%)",
              textTransform: "uppercase",
            }}
          >
            OPEN
          </div>
          <div style={{ position: "relative", padding: 16 }}>
            <span
              style={{
                padding: "3px 9px",
                background: "var(--primary)",
                borderRadius: 9999,
                fontSize: 8.5,
                fontWeight: 900,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
              }}
            >
              ★ Estelar
            </span>
            <div
              className="font-heading"
              style={{
                fontSize: 17,
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                marginTop: 10,
              }}
            >
              {form.name}
              <span style={{ color: "#10b981" }}>.</span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.7)",
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="map-pin" size={10} color="#fff" />
              {form.venue}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CEToggle({
  on,
  onClick,
  l,
  s,
}: {
  on: boolean;
  onClick: () => void;
  l: string;
  s: string;
}) {
  return (
    <label
      onClick={onClick}
      style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
    >
      <div
        style={{
          width: 32,
          height: 18,
          borderRadius: 9999,
          background: on ? "var(--primary)" : "#e5e5e5",
          position: "relative",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: on ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            transition: "left 0.2s",
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{l}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{s}</div>
      </div>
    </label>
  );
}

function CEStep3({ form, set }: { form: Form; set: Setter }) {
  return (
    <div>
      <div className="label-mp">Paso 3 de 4</div>
      <h2
        className="font-heading"
        style={{
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          margin: "6px 0 18px",
        }}
      >
        Cupos & premios<span style={{ color: "var(--primary)" }}>.</span>
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>
            Inscripción
          </div>

          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800 }}>Tamaño del cuadro</span>
              <span
                className="font-heading"
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "var(--primary)",
                }}
              >
                {form.slots} parejas
              </span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[8, 16, 24, 32, 48, 64].map((n) => (
                <button
                  key={n}
                  onClick={() => set("slots", n)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 900,
                    fontFamily: "Plus Jakarta Sans",
                    background: form.slots === n ? "#0a0a0a" : "#fff",
                    color: form.slots === n ? "#fff" : "#0a0a0a",
                    border: "1px solid " + (form.slots === n ? "#0a0a0a" : "var(--border)"),
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              borderTop: "1px dashed var(--border)",
              paddingTop: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="label-mp" style={{ marginBottom: 5 }}>
                  Precio inscripción
                </div>
                <div style={{ display: "flex" }}>
                  <span
                    style={{
                      padding: "10px 12px",
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      borderRight: 0,
                      borderRadius: "8px 0 0 8px",
                      fontSize: 12.5,
                      fontWeight: 900,
                    }}
                  >
                    $
                  </span>
                  <input
                    value={form.fee}
                    onChange={(e) => set("fee", +e.target.value || 0)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderLeft: 0,
                      borderRadius: "0 8px 8px 0",
                      fontSize: 12.5,
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="label-mp" style={{ marginBottom: 5 }}>
                  Comisión MP · 10%
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--muted)",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "var(--muted-fg)",
                  }}
                >
                  ${(form.fee * 0.1).toFixed(2)} por inscrito
                </div>
              </div>
            </div>

            {form.fee > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="label-mp" style={{ marginBottom: 8 }}>
                  ¿Cómo cobras la inscripción?
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {PAYMENT_POLICY_OPTIONS.map((opt) => {
                    const active = form.paymentPolicy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set("paymentPolicy", opt.value)}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                          background: active ? "rgba(16,185,129,0.06)" : "#fff",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0a0a0a" }}>
                          {opt.label}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.4 }}>
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "1px dashed var(--border)",
              paddingTop: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <CEToggle on={form.waitlist} onClick={() => set("waitlist", !form.waitlist)} l="Permitir lista de espera" s="Si se llena, los siguientes entran si alguien cancela" />
            <CEToggle on={form.levelGate} onClick={() => set("levelGate", !form.levelGate)} l="Validar nivel mínimo (3.0+)" s="Bloquea jugadores con ranking < 3.0" />
            <CEToggle on={form.pairTogether} onClick={() => set("pairTogether", !form.pairTogether)} l="Pareja inscribe junta" s="No se puede inscribir sin compañero/a" />
            <CEToggle on={form.membersOnly} onClick={() => set("membersOnly", !form.membersOnly)} l="Solo socios del club" s="Limita a jugadores afiliados a tu club" />
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>
            Premios
          </div>

          <div
            style={{
              padding: 14,
              background: "linear-gradient(135deg, #fef3c7, #fde68a)",
              border: "1px solid #fbbf24",
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span className="label-mp" style={{ color: "#78350f" }}>
                Bolsa total
              </span>
              <span style={{ fontSize: 10, color: "#78350f", fontWeight: 800 }}>
                {form.slots} × ${form.fee} × 0.6 = $
                {(form.slots * form.fee * 0.6).toFixed(0)}
              </span>
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "#92400e",
                marginTop: 4,
              }}
            >
              ${form.prize.toLocaleString("en-US")}
            </div>
            <div style={{ fontSize: 10.5, color: "#78350f", marginTop: 2 }}>
              Tu club añade $
              {Math.max(0, form.prize - form.slots * form.fee * 0.6).toFixed(0)} al pozo
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { p: "1°", l: "50%", amt: (form.prize * 0.5).toFixed(0), extra: "Trofeo + kit Wilson · gold" },
              { p: "2°", l: "30%", amt: (form.prize * 0.3).toFixed(0), extra: "Medalla + kit" },
              { p: "3°", l: "20%", amt: (form.prize * 0.2).toFixed(0), extra: "Medalla" },
            ].map((p, i) => (
              <div
                key={p.p}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : "#d97706",
                    color: i === 0 ? "#0a0a0a" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {p.p}
                </div>
                <div
                  style={{
                    width: 40,
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 12,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {p.l}
                </div>
                <div style={{ flex: 1, fontSize: 11, color: "var(--muted-fg)" }}>{p.extra}</div>
                <div
                  className="font-heading"
                  style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em" }}
                >
                  ${p.amt}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <input
              type="range"
              min="500"
              max="3000"
              step="100"
              value={form.prize}
              onChange={(e) => set("prize", +e.target.value)}
              style={{ flex: 1, accentColor: "var(--primary)" }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--muted-fg)",
              marginTop: 4,
            }}
          >
            <span>Min $500</span>
            <span>Max $3000</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const VISIBILITY_OPTS: { k: Visibility; l: string; s: string; i: string }[] = [
  { k: "public", l: "Público", s: "Visible para todos", i: "globe" },
  { k: "members", l: "Solo socios", s: "Solo afiliados al club", i: "shield" },
  { k: "private", l: "Privado", s: "Solo con link directo", i: "lock" },
];

function CEStep4({ form, set }: { form: Form; set: Setter }) {
  const check = [
    { l: "Tipo, deporte y nivel", ok: true },
    { l: "Fechas y sede confirmadas", ok: true },
    { l: "Formato y descripción", ok: true },
    { l: "Cupos, precio y reglas", ok: true },
    { l: "Premios definidos · $" + form.prize, ok: true },
    { l: "Imagen de portada", ok: false, w: "Usaremos la plantilla por defecto" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22 }}>
      <div>
        <div className="label-mp">Paso 4 de 4</div>
        <h2
          className="font-heading"
          style={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "6px 0 18px",
          }}
        >
          Revisa y publica<span style={{ color: "var(--primary)" }}>.</span>
        </h2>

        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            position: "relative",
            background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
            color: "#fff",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 160,
              color: "rgba(16,185,129,0.06)",
              letterSpacing: "-0.06em",
              lineHeight: 0.8,
              transform: "rotate(-6deg) translate(15%, -15%)",
              textTransform: "uppercase",
            }}
          >
            OPEN
          </div>
          <div style={{ position: "relative", padding: 22 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <span
                style={{
                  padding: "3px 10px",
                  background: "var(--primary)",
                  borderRadius: 9999,
                  fontSize: 9,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                }}
              >
                {form.type}
              </span>
              <span
                style={{
                  padding: "3px 10px",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 9999,
                  fontSize: 9,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                }}
              >
                {form.sport}
              </span>
              <span
                style={{
                  padding: "3px 10px",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 9999,
                  fontSize: 9,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                }}
              >
                Nivel {form.level}
              </span>
            </div>
            <h3
              className="font-heading"
              style={{
                fontSize: 26,
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                margin: "12px 0 8px",
              }}
            >
              {form.name}
              <span style={{ color: "#10b981" }}>.</span>
            </h3>
            <div
              style={{
                display: "flex",
                gap: 14,
                fontSize: 11.5,
                color: "rgba(255,255,255,0.85)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="map-pin" size={11} color="#fff" /> {form.venue}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="trophy" size={11} color="#fff" /> ${form.prize} premio
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="users" size={11} color="#fff" /> {form.slots} parejas · ${form.fee}
              </span>
            </div>
          </div>
        </div>

        <div className="label-mp" style={{ marginTop: 16, marginBottom: 8 }}>
          Visibilidad
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {VISIBILITY_OPTS.map((v) => {
            const on = form.visibility === v.k;
            return (
              <button
                key={v.k}
                onClick={() => set("visibility", v.k)}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  fontFamily: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  background: on ? "#ecfdf5" : "#fff",
                  border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                }}
              >
                <Icon name={v.i} size={14} color={on ? "var(--primary)" : "#0a0a0a"} />
                <div style={{ fontSize: 12, fontWeight: 900, marginTop: 6 }}>{v.l}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{v.s}</div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: "#fafafa",
            color: "var(--muted-fg)",
            border: "1px dashed var(--border)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            opacity: 0.7,
          }}
        >
          <Icon name="megaphone" size={15} color="var(--muted-fg)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, fontWeight: 900 }}>
              Boost al evento <span style={{ color: "var(--muted-fg)" }}>· próximamente</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
              Promoción pagada en home de jugadores. Disponible cuando integremos el módulo de ads.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="label-mp" style={{ marginBottom: 10 }}>
            Listo para publicar
          </div>
          {check.map((c) => (
            <div
              key={c.l}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "6px 0",
                borderTop: "1px dashed var(--border)",
              }}
            >
              <Icon
                name={c.ok ? "check-circle-2" : "alert-circle"}
                size={13}
                color={c.ok ? "var(--primary)" : "#d97706"}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800 }}>{c.l}</div>
                {c.w && <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{c.w}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            Resumen
          </div>
          {(
            [
              ["Cuadro", form.slots + " parejas · mixto"],
              ["Inscripción", "$" + form.fee + " / pareja"],
              ["Ingresos brutos", "$" + (form.slots * form.fee).toFixed(0)],
              ["Comisión MP (10%)", "–$" + (form.slots * form.fee * 0.1).toFixed(0)],
              ["Premio (60% pozo)", "–$" + (form.slots * form.fee * 0.6).toFixed(0)],
              [
                "Club aporta",
                "–$" + Math.max(0, form.prize - form.slots * form.fee * 0.6).toFixed(0),
              ],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                fontSize: 11,
                borderTop: "1px dashed var(--border)",
              }}
            >
              <span style={{ color: "var(--muted-fg)" }}>{k}</span>
              <span style={{ fontWeight: 800 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CEDone({
  form,
  eventId,
  eventSlug,
  close,
}: {
  form: Form;
  eventId: string;
  eventSlug: string;
  close: () => void;
}) {
  const toast = useToast();
  const shortId = eventId.slice(0, 8).toUpperCase();
  return (
    <div>
      <div
        style={{
          padding: "26px 22px",
          borderRadius: 14.4,
          background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 200,
            color: "rgba(255,255,255,0.07)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(10%, -25%)",
            textTransform: "uppercase",
          }}
        >
          LIVE
        </div>
        <div style={{ position: "relative", display: "flex", gap: 20, alignItems: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="rocket" size={26} color="#fff" />
          </div>
          <div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
              Evento #{shortId} · Publicado
            </div>
            <h2
              className="font-heading"
              style={{
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              ¡Tu evento está vivo!<span style={{ color: "#fbbf24" }}>.</span>
            </h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 5 }}>
              {form.name} ya aparece en /eventos · los jugadores pueden inscribirse
            </div>
          </div>
        </div>
      </div>

      <div className="label-mp" style={{ marginBottom: 10 }}>
        Compártelo
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 10,
          background: "#fafafa",
          border: "1px solid var(--border)",
          borderRadius: 9999,
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <span style={{ marginLeft: 8 }}>
          <Icon name="link" size={14} color="var(--muted-fg)" />
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            color: "var(--muted-fg)",
          }}
        >
          matchpoint.top/e/{eventSlug}
        </span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(`https://matchpoint.top/e/${eventSlug}`).catch(() => {});
            toast({ icon: "copy", title: "Link copiado", sub: "Listo para compartir" });
          }}
          className="btn"
          style={{ background: "#0a0a0a", color: "#fff", fontSize: 10.5, padding: "6px 14px" }}
        >
          Copiar link
        </button>
      </div>

      <div className="label-mp" style={{ marginBottom: 8 }}>
        Próximos pasos
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { i: "message-circle", l: "Avisar a socios", sub: "Push a 142 socios del club", primary: true },
          { i: "instagram", l: "Compartir IG", sub: "Story con plantilla MP" },
          { i: "qr-code", l: "QR / poster", sub: "PDF imprimible" },
          { i: "pencil", l: "Editar evento", sub: "Cualquier campo" },
        ].map((a) => (
          <button
            key={a.l}
            className="card"
            style={{
              padding: 12,
              textAlign: "left",
              cursor: "pointer",
              border: a.primary ? "2px solid var(--primary)" : undefined,
              background: a.primary ? "#ecfdf5" : "#fff",
              fontFamily: "inherit",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: a.primary ? "var(--primary)" : "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Icon name={a.i} size={12} color={a.primary ? "#fff" : "#0a0a0a"} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 900 }}>{a.l}</div>
            <div
              style={{
                fontSize: 9.5,
                color: "var(--muted-fg)",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {a.sub}
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
        <button
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            flex: 1,
            justifyContent: "center",
          }}
          onClick={close}
        >
          Cerrar
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={close}
        >
          <Icon name="external-link" size={13} color="#fff" />
          Ver evento publicado
        </button>
      </div>
    </div>
  );
}
