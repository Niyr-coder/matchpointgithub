"use client";
// Wizard de creación de torneo: T&C → form → preview → submit.
// Solo pickleball por ahora (sport bloqueado). Modalidad y scoring guiados.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { createTournament } from "@/server/actions/tournaments";

// ── Cláusulas estrictas (T&C) ─────────────────────────────────────────
// Texto editable aquí. Si crece, mover a `src/lib/content/tournament-terms.ts`.
export const TOURNAMENT_TERMS: Array<{ title: string; body: string }> = [
  {
    title: "Responsabilidad del organizador",
    body: "Como partner/admin que crea el torneo, asumes plena responsabilidad por la organización, la logística del evento, el cumplimiento de cupos, premios y horarios anunciados. MatchPoint es la plataforma, no el organizador legal del torneo.",
  },
  {
    title: "Información veraz y precisa",
    body: "Toda la información publicada (fechas, sede, premio, cupos, cuota, sistema de puntuación) debe coincidir con la realidad del evento. Cualquier discrepancia material puede causar la suspensión inmediata del torneo y la cuenta.",
  },
  {
    title: "Política de reembolsos",
    body: "Las inscripciones cobradas son no reembolsables salvo cancelación del torneo por parte tuya. Si cancelas, debes devolver el 100% de lo cobrado a cada jugador en un máximo de 7 días por transferencia o DeUna. MatchPoint NO procesa reembolsos automáticos.",
  },
  {
    title: "Juego limpio y antitrampas",
    body: "Cualquier inscripción con identidad falsificada, suplantación de jugador, manipulación de resultados, soborno de jueces o conducta antideportiva grave conlleva descalificación inmediata, pérdida de la cuota pagada y reporte al federativo correspondiente.",
  },
  {
    title: "Reglas oficiales y arbitraje",
    body: "El torneo se rige por las reglas oficiales de pickleball según el sistema de puntuación elegido (side-out tradicional o rally). El partner organizador asigna jueces o referees. Las decisiones del referee del torneo son finales.",
  },
  {
    title: "Datos personales de los inscritos",
    body: "Los datos personales de los jugadores inscritos (nombre, contacto, rating, historial) solo pueden usarse para la operación del torneo. Está prohibido exportarlos para marketing externo, compartirlos con terceros o usarlos para fines distintos al evento.",
  },
  {
    title: "Cobro de comisiones MatchPoint",
    body: "MatchPoint puede retener una comisión sobre la cuota de inscripción, según lo acordado en tu contrato de partner. Las features pagadas como 'Torneo estelar' se cobran aparte y no se reembolsan al cancelar.",
  },
  {
    title: "Suspensión y descalificación",
    body: "MatchPoint se reserva el derecho de suspender el torneo, ocultarlo del listado público y revocar privilegios del partner si detecta incumplimiento de estas reglas, fraude, quejas reiteradas de jugadores o uso indebido de la plataforma.",
  },
];

// ── Catálogo de modalidades + scoring presets para pickleball ────────
type ScoringConfig = {
  type: "side_out" | "rally";
  points: number;
  winBy: number;
  bestOf: number;
};

const MODALITIES: Array<{
  value: "singles" | "doubles" | "mixed_doubles";
  label: string;
  sub: string;
}> = [
  { value: "doubles", label: "Dobles", sub: "2 vs 2 — la modalidad más jugada" },
  { value: "singles", label: "Singles", sub: "1 vs 1" },
  { value: "mixed_doubles", label: "Mixto", sub: "2 vs 2, un hombre y una mujer por lado" },
];

const SCORING_PRESETS: Array<{
  id: string;
  label: string;
  sub: string;
  config: ScoringConfig;
}> = [
  {
    id: "trad_11_bo3",
    label: "Tradicional · Best of 3 a 11",
    sub: "Side-out (solo el sacador puntúa) · Gana por 2 · Formato clásico de torneo",
    config: { type: "side_out", points: 11, winBy: 2, bestOf: 3 },
  },
  {
    id: "rally_15_bo3",
    label: "Rally · Best of 3 a 15",
    sub: "Rally scoring · Gana por 2 · Formato pro / PPA Tour moderno",
    config: { type: "rally", points: 15, winBy: 2, bestOf: 3 },
  },
  {
    id: "rally_21_single",
    label: "Rally · 1 game a 21",
    sub: "Rally scoring · Gana por 2 · Formato corto tipo MLP regular season",
    config: { type: "rally", points: 21, winBy: 2, bestOf: 1 },
  },
  {
    id: "trad_11_bo5",
    label: "Tradicional · Best of 5 a 11",
    sub: "Side-out · Gana por 2 · Formato extendido para finales",
    config: { type: "side_out", points: 11, winBy: 2, bestOf: 5 },
  },
  {
    id: "popcorn",
    label: "Popcorn · Rotación de parejas",
    sub: "Cada game cambias de pareja. Rally a 15 gana por 2, mejor de 1. Ideal para social leagues y mixers.",
    config: { type: "rally", points: 15, winBy: 2, bestOf: 1 },
  },
];

const TOURNAMENT_FORMATS: Array<{ value: string; label: string; sub: string }> = [
  { value: "single_elim", label: "Eliminación directa", sub: "Pierde uno, sale del cuadro" },
  { value: "double_elim", label: "Doble eliminación", sub: "Cada jugador tiene 2 vidas" },
  { value: "round_robin", label: "Round-robin", sub: "Todos contra todos en grupos" },
  { value: "groups_to_knockout", label: "Grupos + eliminación", sub: "Fase grupos + cuadro final" },
  { value: "swiss", label: "Sistema suizo", sub: "Por puntaje, sin eliminaciones" },
];

const PAYMENT_POLICIES: Array<{
  value: "free" | "prepay" | "onsite" | "flexible";
  label: string;
  sub: string;
}> = [
  { value: "prepay", label: "Online (transferencia)", sub: "El jugador sube comprobante antes" },
  { value: "onsite", label: "En club", sub: "Paga al llegar al torneo" },
  { value: "flexible", label: "Flexible", sub: "El jugador elige online o en club" },
  { value: "free", label: "Gratis", sub: "Sin cuota" },
];

type Props = {
  partnerId: string;
  open: boolean;
  onClose: () => void;
};

type Step = "terms" | "form" | "preview";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

export function CreateTournamentFlow({ partnerId, open, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [step, setStep] = useState<Step>("terms");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [modality, setModality] = useState<"singles" | "doubles" | "mixed_doubles">("doubles");
  const [scoringId, setScoringId] = useState<string>("trad_11_bo3");
  const [format, setFormat] = useState<string>("single_elim");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");
  const [singleDay, setSingleDay] = useState<boolean>(false);
  const [maxParticipants, setMaxParticipants] = useState<string>("32");
  const [entryFee, setEntryFee] = useState<string>("20");
  const [prize, setPrize] = useState<string>("");
  const [paymentPolicy, setPaymentPolicyRaw] = useState<
    "free" | "prepay" | "onsite" | "flexible"
  >("prepay");

  const setPaymentPolicy = (next: typeof paymentPolicy) => {
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

  // Reset al abrir.
  useEffect(() => {
    if (!open) return;
    setStep("terms");
    setTermsAccepted(false);
    setName("");
    setModality("doubles");
    setScoringId("trad_11_bo3");
    setFormat("single_elim");
    setStartsAt("");
    setEndsAt("");
    setSingleDay(false);
    setMaxParticipants("32");
    setEntryFee("20");
    setPrize("");
    setPaymentPolicyRaw("prepay");
  }, [open]);

  const scoring = useMemo(
    () => SCORING_PRESETS.find((s) => s.id === scoringId) ?? SCORING_PRESETS[0],
    [scoringId],
  );
  const modalityLabel = useMemo(
    () => MODALITIES.find((m) => m.value === modality)?.label ?? "",
    [modality],
  );
  const formatLabel = useMemo(
    () => TOURNAMENT_FORMATS.find((f) => f.value === format)?.label ?? "",
    [format],
  );
  const policyLabel = useMemo(
    () => PAYMENT_POLICIES.find((p) => p.value === paymentPolicy)?.label ?? "",
    [paymentPolicy],
  );

  if (!open) return null;

  // ── Validación del form (step 'form') ──
  const validateForm = (): string | null => {
    if (name.trim().length < 2) return "El nombre debe tener al menos 2 caracteres.";
    if (!startsAt) return "Falta la fecha de inicio.";
    if (!singleDay) {
      if (!endsAt) return "Falta la fecha de fin (o marca 'es de un solo día').";
      if (new Date(startsAt) >= new Date(endsAt))
        return "El inicio debe ser anterior al fin.";
    }
    const cap = Number(maxParticipants);
    if (maxParticipants !== "" && (!Number.isInteger(cap) || cap <= 0))
      return "Cupos inválidos.";
    const fee = paymentPolicy === "free" ? 0 : Number(entryFee);
    if (Number.isNaN(fee) || fee < 0) return "Cuota inválida.";
    if (fee > 0 && paymentPolicy === "free")
      return "Cuota y método no coinciden: cambia uno.";
    if (fee === 0 && paymentPolicy !== "free")
      return "Si la cuota es $0 el método debe ser Gratis.";
    if (prize !== "" && (Number.isNaN(Number(prize)) || Number(prize) < 0))
      return "Premio inválido.";
    return null;
  };

  const onSubmit = () => {
    if (saving) return;
    const err = validateForm();
    if (err) {
      toast({ icon: "alert-triangle", title: "Revisa el formulario", sub: err });
      return;
    }
    setSaving(true);
    startTx(async () => {
      const fee = paymentPolicy === "free" ? 0 : Number(entryFee);
      const prizeNum = prize === "" ? null : Math.round(Number(prize) * 100);
      const cap = maxParticipants === "" ? undefined : Number(maxParticipants);
      const slug = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
      const res = await createTournament({
        partnerId,
        name: name.trim(),
        slug,
        sport: "pickleball",
        format,
        startsAt: localInputToIso(startsAt),
        endsAt: singleDay || !endsAt ? null : localInputToIso(endsAt),
        maxParticipants: cap,
        entryFeeCents: Math.round(fee * 100),
        currency: "USD",
        paymentPolicy,
        prizePoolCents: prizeNum ?? undefined,
        modality,
        scoringConfig: scoring.config,
        termsAccepted: true,
      });
      setSaving(false);
      if (res.ok) {
        toast({ icon: "check", title: "Torneo creado" });
        onClose();
        router.push(`/dashboard/partner/torneo/${res.data.id}`);
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo crear",
          sub: res.error.message,
        });
      }
    });
  };

  return (
    <div
      className="mp-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        className="mp-modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          background: "#fff",
          borderRadius: 14,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
        }}
      >
        <Header step={step} onClose={onClose} />
        <div style={{ padding: 22, overflow: "auto", flex: 1 }}>
          {step === "terms" && (
            <StepTerms
              accepted={termsAccepted}
              setAccepted={setTermsAccepted}
            />
          )}
          {step === "form" && (
            <StepForm
              name={name}
              setName={setName}
              modality={modality}
              setModality={setModality}
              scoringId={scoringId}
              setScoringId={setScoringId}
              format={format}
              setFormat={setFormat}
              startsAt={startsAt}
              setStartsAt={setStartsAt}
              endsAt={endsAt}
              setEndsAt={setEndsAt}
              singleDay={singleDay}
              setSingleDay={setSingleDay}
              maxParticipants={maxParticipants}
              setMaxParticipants={setMaxParticipants}
              entryFee={entryFee}
              onEntryFeeChange={onEntryFeeChange}
              prize={prize}
              setPrize={setPrize}
              paymentPolicy={paymentPolicy}
              setPaymentPolicy={setPaymentPolicy}
            />
          )}
          {step === "preview" && (
            <StepPreview
              name={name}
              modalityLabel={modalityLabel}
              scoring={scoring}
              formatLabel={formatLabel}
              startsAt={startsAt}
              endsAt={singleDay ? "" : endsAt}
              maxParticipants={maxParticipants}
              entryFee={paymentPolicy === "free" ? "0" : entryFee}
              prize={prize}
              policyLabel={policyLabel}
            />
          )}
        </div>
        <Footer
          step={step}
          canAdvance={
            step === "terms"
              ? termsAccepted
              : step === "form"
                ? true
                : !saving
          }
          saving={saving}
          onBack={() => {
            if (step === "form") setStep("terms");
            if (step === "preview") setStep("form");
          }}
          onNext={() => {
            if (step === "terms") setStep("form");
            else if (step === "form") {
              const err = validateForm();
              if (err) {
                toast({ icon: "alert-triangle", title: "Revisa el formulario", sub: err });
                return;
              }
              setStep("preview");
            } else if (step === "preview") onSubmit();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────

function Header({ step, onClose }: { step: Step; onClose: () => void }) {
  const titles: Record<Step, string> = {
    terms: "Reglas del organizador",
    form: "Datos del torneo",
    preview: "Confirma y publica",
  };
  const stepNum = step === "terms" ? 1 : step === "form" ? 2 : 3;
  return (
    <div
      style={{
        padding: "20px 22px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          Paso {stepNum} de 3
        </div>
        <h2
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            margin: "4px 0 0",
          }}
        >
          {titles[step]}
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
          flexShrink: 0,
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function Footer({
  step,
  canAdvance,
  saving,
  onBack,
  onNext,
  onCancel,
}: {
  step: Step;
  canAdvance: boolean;
  saving: boolean;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const nextLabel =
    step === "terms"
      ? "Continuar"
      : step === "form"
        ? "Revisar"
        : saving
          ? "Creando…"
          : "Crear torneo";
  return (
    <div
      style={{
        padding: "14px 22px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <button
        onClick={onCancel}
        disabled={saving}
        className="btn"
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
        }}
      >
        Cancelar
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        {step !== "terms" && (
          <button
            onClick={onBack}
            disabled={saving}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            <Icon name="arrow-left" size={12} />
            Atrás
          </button>
        )}
        <button
          onClick={onNext}
          disabled={!canAdvance || saving}
          className="btn btn-primary"
          style={{ opacity: !canAdvance || saving ? 0.6 : 1 }}
        >
          {step === "preview" ? <Icon name="check" size={13} color="#fff" /> : null}
          {nextLabel}
          {step !== "preview" && !saving ? <Icon name="arrow-right" size={12} color="#fff" /> : null}
        </button>
      </div>
    </div>
  );
}

function StepTerms({
  accepted,
  setAccepted,
}: {
  accepted: boolean;
  setAccepted: (v: boolean) => void;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--muted-fg)",
          marginTop: 0,
          marginBottom: 14,
        }}
      >
        Antes de publicar un torneo en MatchPoint, lee y acepta las siguientes
        reglas. Aplican a todos los partners y administradores. Incumplirlas
        puede suspender el torneo y la cuenta.
      </p>
      <ol
        style={{
          margin: 0,
          paddingLeft: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {TOURNAMENT_TERMS.map((t, i) => (
          <li
            key={i}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: "#0a0a0a",
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#0a0a0a",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              {t.title}
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--muted-fg)" }}>
              {t.body}
            </div>
          </li>
        ))}
      </ol>
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginTop: 18,
          padding: 14,
          borderRadius: 10,
          border: `2px solid ${accepted ? "var(--primary)" : "var(--border)"}`,
          background: accepted ? "rgba(16,185,129,0.06)" : "#fff",
          cursor: "pointer",
          transition: "border-color 160ms var(--ease-out), background 160ms var(--ease-out)",
        }}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--primary)" }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0a0a0a", lineHeight: 1.5 }}>
          He leído las {TOURNAMENT_TERMS.length} cláusulas y entiendo que soy
          responsable del cumplimiento. Acepto que MatchPoint pueda suspender
          mi torneo si las incumplo.
        </span>
      </label>
    </div>
  );
}

function StepForm(props: {
  name: string;
  setName: (v: string) => void;
  modality: "singles" | "doubles" | "mixed_doubles";
  setModality: (v: "singles" | "doubles" | "mixed_doubles") => void;
  scoringId: string;
  setScoringId: (v: string) => void;
  format: string;
  setFormat: (v: string) => void;
  startsAt: string;
  setStartsAt: (v: string) => void;
  endsAt: string;
  setEndsAt: (v: string) => void;
  singleDay: boolean;
  setSingleDay: (v: boolean) => void;
  maxParticipants: string;
  setMaxParticipants: (v: string) => void;
  entryFee: string;
  onEntryFeeChange: (v: string) => void;
  prize: string;
  setPrize: (v: string) => void;
  paymentPolicy: "free" | "prepay" | "onsite" | "flexible";
  setPaymentPolicy: (v: "free" | "prepay" | "onsite" | "flexible") => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Nombre del torneo">
        <input
          type="text"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          placeholder="Ej: Copa Verano 2026"
          style={inputStyle}
        />
      </Field>

      <Field label="Deporte">
        <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
          <Icon name="trophy" size={13} />
          <span style={{ fontWeight: 700 }}>Pickleball</span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9.5,
              fontWeight: 900,
              letterSpacing: "0.1em",
              color: "var(--muted-fg)",
              textTransform: "uppercase",
            }}
          >
            Único disponible
          </span>
        </div>
      </Field>

      <Field label="Modalidad">
        <RadioCards
          options={MODALITIES.map((m) => ({
            value: m.value,
            label: m.label,
            sub: m.sub,
          }))}
          value={props.modality}
          onChange={(v) => props.setModality(v as typeof props.modality)}
        />
      </Field>

      <Field label="Sistema de puntuación">
        <RadioCards
          options={SCORING_PRESETS.map((s) => ({
            value: s.id,
            label: s.label,
            sub: s.sub,
          }))}
          value={props.scoringId}
          onChange={props.setScoringId}
        />
      </Field>

      <Field label="Estructura del cuadro">
        <select
          value={props.format}
          onChange={(e) => props.setFormat(e.target.value)}
          style={inputStyle}
        >
          {TOURNAMENT_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label} — {f.sub}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Inicio">
          <input
            type="datetime-local"
            value={props.startsAt}
            onChange={(e) => props.setStartsAt(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Fin">
          <input
            type="datetime-local"
            value={props.endsAt}
            onChange={(e) => props.setEndsAt(e.target.value)}
            disabled={props.singleDay}
            placeholder={props.singleDay ? "Un solo día" : ""}
            style={{
              ...inputStyle,
              opacity: props.singleDay ? 0.5 : 1,
              cursor: props.singleDay ? "not-allowed" : "text",
            }}
          />
        </Field>
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--muted-fg)",
          cursor: "pointer",
          marginTop: -6,
        }}
      >
        <input
          type="checkbox"
          checked={props.singleDay}
          onChange={(e) => {
            props.setSingleDay(e.target.checked);
            if (e.target.checked) props.setEndsAt("");
          }}
          style={{ accentColor: "var(--primary)" }}
        />
        Es de un solo día (sin fecha de fin)
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Cupos">
          <input
            type="number"
            min={1}
            value={props.maxParticipants}
            onChange={(e) => props.setMaxParticipants(e.target.value)}
            placeholder="Sin límite"
            style={inputStyle}
          />
        </Field>
        <Field label="Cuota (USD)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={props.entryFee}
            onChange={(e) => props.onEntryFeeChange(e.target.value)}
            disabled={props.paymentPolicy === "free"}
            placeholder={props.paymentPolicy === "free" ? "Gratis" : "0.00"}
            style={{
              ...inputStyle,
              opacity: props.paymentPolicy === "free" ? 0.55 : 1,
              cursor: props.paymentPolicy === "free" ? "not-allowed" : "text",
            }}
          />
        </Field>
        <Field label="Premio (USD)">
          <input
            type="number"
            min={0}
            value={props.prize}
            onChange={(e) => props.setPrize(e.target.value)}
            placeholder="—"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Método de pago">
        <RadioCards
          options={PAYMENT_POLICIES.map((p) => ({
            value: p.value,
            label: p.label,
            sub: p.sub,
          }))}
          value={props.paymentPolicy}
          onChange={(v) => props.setPaymentPolicy(v as typeof props.paymentPolicy)}
        />
      </Field>
    </div>
  );
}

function StepPreview(props: {
  name: string;
  modalityLabel: string;
  scoring: { label: string; sub: string; config: ScoringConfig };
  formatLabel: string;
  startsAt: string;
  endsAt: string;
  maxParticipants: string;
  entryFee: string;
  prize: string;
  policyLabel: string;
}) {
  const fmtDate = (s: string) =>
    s
      ? new Date(s).toLocaleString("es-EC", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  return (
    <div>
      <div
        className="card"
        style={{
          padding: 20,
          background: "linear-gradient(135deg, #0a0a0a, #1a1a1a)",
          color: "#fff",
          borderRadius: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Pickleball · {props.modalityLabel} · {props.formatLabel}
        </div>
        <div
          className="font-heading"
          style={{
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            marginTop: 4,
            textTransform: "uppercase",
          }}
        >
          {props.name || "Sin nombre"}
          <span style={{ color: "var(--primary)" }}>.</span>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "rgba(255,255,255,0.7)",
            marginTop: 6,
          }}
        >
          {fmtDate(props.startsAt)}
          {props.endsAt ? ` → ${fmtDate(props.endsAt)}` : " · Un solo día"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <PreviewKV
          label="Cupos"
          value={props.maxParticipants === "" ? "Sin límite" : props.maxParticipants}
        />
        <PreviewKV
          label="Cuota"
          value={Number(props.entryFee) > 0 ? `$${Number(props.entryFee).toFixed(2)}` : "Gratis"}
        />
        <PreviewKV
          label="Premio"
          value={props.prize !== "" ? `$${Number(props.prize).toFixed(0)}` : "Sin premio"}
        />
        <PreviewKV label="Pago" value={props.policyLabel} />
      </div>

      <div
        className="card"
        style={{
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--muted)",
        }}
      >
        <div className="label-mp">Sistema de puntuación</div>
        <div style={{ fontSize: 13, fontWeight: 900, marginTop: 4 }}>{props.scoring.label}</div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.5 }}>
          {props.scoring.sub}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          <Chip label={`Tipo: ${props.scoring.config.type === "side_out" ? "Side-out" : "Rally"}`} />
          <Chip label={`Game a ${props.scoring.config.points}`} />
          <Chip label={`Gana por ${props.scoring.config.winBy}`} />
          <Chip label={`Best of ${props.scoring.config.bestOf}`} />
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 10,
          background: "rgba(251,191,36,0.12)",
          border: "1px solid rgba(251,191,36,0.4)",
          fontSize: 11.5,
          lineHeight: 1.55,
          color: "#92400e",
        }}
      >
        <Icon name="info" size={12} color="#92400e" /> Al confirmar, el torneo se
        crea en estado <b>Borrador</b>. Puedes editarlo o publicarlo desde la
        página de gestión.
      </div>
    </div>
  );
}

function PreviewKV({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: "#fff",
        border: "1px solid var(--border)",
      }}
    >
      <div className="label-mp">{label}</div>
      <div
        className="font-heading"
        style={{ fontSize: 16, fontWeight: 900, marginTop: 4, color: "#0a0a0a" }}
      >
        {value}
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        padding: "4px 9px",
        borderRadius: 6,
        background: "#fff",
        color: "#0a0a0a",
        border: "1px solid var(--border)",
      }}
    >
      {label}
    </span>
  );
}

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

function RadioCards({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string; sub: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
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
