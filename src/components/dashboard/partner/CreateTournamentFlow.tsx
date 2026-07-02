"use client";
// Wizard de creación de torneo: T&C → datos → logística → categorías → preview.
// Solo pickleball por ahora (sport bloqueado). Modalidad y scoring guiados.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { createTournament } from "@/server/actions/tournaments";
import { GENDERS, MprRangeSlider } from "./CategoriesPanel";
import type { ClubOption } from "./PartnerTorneosScreenView";

// ── Cláusulas estrictas (T&C) ─────────────────────────────────────────
// Texto editable aquí. Si crece, mover a `src/lib/content/tournament-terms.ts`.
export const TOURNAMENT_TERMS: Array<{ title: string; body: string }> = [
  {
    title: "Responsabilidad del organizador",
    body: "Como partner/admin que crea el torneo, asumes plena responsabilidad por la organización, la logística del evento, el cumplimiento de cupos, premios y horarios anunciados. MATCHPOINT es la plataforma, no el organizador legal del torneo.",
  },
  {
    title: "Información veraz y precisa",
    body: "Toda la información publicada (fechas, sede, premio, cupos, cuota, sistema de puntuación) debe coincidir con la realidad del evento. Cualquier discrepancia material puede causar la suspensión inmediata del torneo y la cuenta.",
  },
  {
    title: "Política de reembolsos",
    body: "Las inscripciones cobradas son no reembolsables salvo cancelación del torneo por parte tuya. Si cancelas, debes devolver el 100% de lo cobrado a cada jugador en un máximo de 7 días por transferencia o DeUna. MATCHPOINT NO procesa reembolsos automáticos.",
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
    title: "Cobro de comisiones MATCHPOINT",
    body: "MATCHPOINT puede retener una comisión sobre la cuota de inscripción, según lo acordado en tu contrato de partner. Las features pagadas como 'Torneo estelar' se cobran aparte y no se reembolsan al cancelar.",
  },
  {
    title: "Suspensión y descalificación",
    body: "MATCHPOINT se reserva el derecho de suspender el torneo, ocultarlo del listado público y revocar privilegios del partner si detecta incumplimiento de estas reglas, fraude, quejas reiteradas de jugadores o uso indebido de la plataforma.",
  },
];

// ── Configurador de scoring ───────────────────────────────────────────
type ScoringType = "side_out" | "rally";

const SCORING_QUICK_PRESETS: Array<{
  label: string;
  type: ScoringType;
  points: string;
  bestOf: 1 | 3 | 5;
}> = [
  { label: "Clásico BO3·11", type: "side_out", points: "11", bestOf: 3 },
  { label: "Rally PPA BO3·15", type: "rally", points: "15", bestOf: 3 },
  { label: "MLP BO1·21", type: "rally", points: "21", bestOf: 1 },
  { label: "Finales BO5·11", type: "side_out", points: "11", bestOf: 5 },
];

const TOURNAMENT_FORMATS: Array<{
  value: string;
  label: string;
  sub: string;
  disabled?: boolean;
  badge?: string;
}> = [
  { value: "single_elim", label: "Eliminación directa", sub: "Pierde uno, sale del cuadro" },
  {
    value: "groups_to_knockout",
    label: "Grupos + eliminación",
    sub: "Fase grupos + cuadro final",
  },
  {
    value: "double_elim",
    label: "Doble eliminación",
    sub: "Cada jugador tiene 2 vidas",
    disabled: true,
    badge: "Próximamente",
  },
  {
    value: "round_robin",
    label: "Round-robin (liga)",
    sub: "Todos contra todos, gana la tabla",
  },
  {
    value: "swiss",
    label: "Sistema suizo",
    sub: "Por puntaje, sin eliminaciones",
    disabled: true,
    badge: "Próximamente",
  },
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
  clubs: ClubOption[];
  open: boolean;
  onClose: () => void;
  initialClubId?: string;
};

const STEPS = ["terms", "details", "logistics", "categories", "preview"] as const;
type Step = (typeof STEPS)[number];

// ── Categoría en estado de wizard ─────────────────────────────────────
const MPR_DEFAULT_MIN = 3.0;
const MPR_DEFAULT_MAX = 4.0;

type CatDraft = {
  name: string;
  gender: "m" | "f" | "mixed" | "open";
  /** "" = hereda la modalidad del torneo. */
  modality: "" | "singles" | "doubles" | "mixed_doubles";
  mprMin: number;
  mprMax: number;
  noLevelLimit: boolean;
  noUpperCap: boolean;
  ageMin: string;
  ageMax: string;
  maxTeams: string;
};

type WizardCategory = CatDraft & { key: number };

const EMPTY_CAT: CatDraft = {
  name: "",
  gender: "open",
  modality: "",
  mprMin: MPR_DEFAULT_MIN,
  mprMax: MPR_DEFAULT_MAX,
  noLevelLimit: true,
  noUpperCap: false,
  ageMin: "",
  ageMax: "",
  maxTeams: "",
};

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

export function CreateTournamentFlow({ partnerId, clubs, open, onClose, initialClubId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [step, setStep] = useState<Step>("terms");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state — datos
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clubId, setClubId] = useState<string>("");
  const [format, setFormat] = useState<string>("single_elim");
  const [groupsCount, setGroupsCount] = useState<string>("2");
  const [advancePerGroup, setAdvancePerGroup] = useState<string>("4");
  // Scoring — partidos regulares
  const [mainType, setMainType] = useState<ScoringType>("side_out");
  const [mainPoints, setMainPoints] = useState<string>("11");
  const [mainBestOf, setMainBestOf] = useState<1 | 3 | 5>(3);
  // Scoring — fase de grupos (solo groups_to_knockout)
  const [groupScoringEnabled, setGroupScoringEnabled] = useState(false);
  const [groupType, setGroupType] = useState<ScoringType>("side_out");
  const [groupPoints, setGroupPoints] = useState<string>("11");
  const [groupBestOf, setGroupBestOf] = useState<1 | 3 | 5>(1);
  // Scoring — final (solo groups_to_knockout)
  const [finalScoringEnabled, setFinalScoringEnabled] = useState(false);
  const [finalType, setFinalType] = useState<ScoringType>("side_out");
  const [finalPoints, setFinalPoints] = useState<string>("11");
  const [finalBestOf, setFinalBestOf] = useState<1 | 3 | 5>(5);

  // Form state — logística
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");
  const [singleDay, setSingleDay] = useState<boolean>(false);
  const [regOpensAt, setRegOpensAt] = useState<string>("");
  const [regClosesAt, setRegClosesAt] = useState<string>("");
  const [maxParticipants, setMaxParticipants] = useState<string>("32");
  const [allowWaitlist, setAllowWaitlist] = useState<boolean>(false);
  const [entryFee, setEntryFee] = useState<string>("20");
  const [prize, setPrize] = useState<string>("");
  const [paymentPolicy, setPaymentPolicyRaw] = useState<
    "free" | "prepay" | "onsite" | "flexible"
  >("prepay");

  // Form state — categorías
  const [categories, setCategories] = useState<WizardCategory[]>([]);
  const catKeyRef = useRef(0);

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
    setDescription("");
    setClubId(initialClubId ?? "");
    setFormat("single_elim");
    setGroupsCount("2");
    setAdvancePerGroup("4");
    setMainType("side_out");
    setMainPoints("11");
    setMainBestOf(3);
    setGroupScoringEnabled(false);
    setGroupType("side_out");
    setGroupPoints("11");
    setGroupBestOf(1);
    setFinalScoringEnabled(false);
    setFinalType("side_out");
    setFinalPoints("11");
    setFinalBestOf(5);
    setStartsAt("");
    setEndsAt("");
    setSingleDay(false);
    setRegOpensAt("");
    setRegClosesAt("");
    setMaxParticipants("32");
    setAllowWaitlist(false);
    setEntryFee("20");
    setPrize("");
    setPaymentPolicyRaw("prepay");
    setCategories([]);
  }, [open, initialClubId]);

  const scoringSummary = useMemo(() => ({
    main: { type: mainType, points: Math.max(7, Math.min(31, Number(mainPoints) || 11)), bestOf: mainBestOf },
    group: groupScoringEnabled && format === "groups_to_knockout"
      ? { type: groupType, points: Math.max(7, Math.min(31, Number(groupPoints) || 11)), bestOf: groupBestOf }
      : null,
    final: finalScoringEnabled && format === "groups_to_knockout"
      ? { type: finalType, points: Math.max(7, Math.min(31, Number(finalPoints) || 11)), bestOf: finalBestOf }
      : null,
  }), [mainType, mainPoints, mainBestOf, groupScoringEnabled, groupType, groupPoints, groupBestOf, finalScoringEnabled, finalType, finalPoints, finalBestOf, format]);

  const formatLabel = useMemo(
    () => TOURNAMENT_FORMATS.find((f) => f.value === format)?.label ?? "",
    [format],
  );
  const policyLabel = useMemo(
    () => PAYMENT_POLICIES.find((p) => p.value === paymentPolicy)?.label ?? "",
    [paymentPolicy],
  );
  const clubLabel = useMemo(() => {
    if (!clubId) return "Sin sede · multi-club";
    const c = clubs.find((x) => x.id === clubId);
    return c ? `${c.name}${c.city ? ` · ${c.city}` : ""}` : "—";
  }, [clubId, clubs]);

  if (!open) return null;

  // ── Validaciones por paso ──
  const validateDetails = (): string | null => {
    if (name.trim().length < 2) return "El nombre debe tener al menos 2 caracteres.";
    const pts = Number(mainPoints);
    if (!mainPoints || isNaN(pts) || pts < 7 || pts > 31)
      return "Los puntos para ganar deben estar entre 7 y 31.";
    if (format === "groups_to_knockout") {
      const g = Number(groupsCount);
      const a = Number(advancePerGroup);
      if (!Number.isInteger(g) || g < 1) return "Número de grupos inválido.";
      if (!Number.isInteger(a) || a < 1) return "Clasificados por grupo inválido.";
    }
    return null;
  };

  const validateLogistics = (): string | null => {
    if (!startsAt) return "Falta la fecha de inicio.";
    if (!singleDay) {
      if (!endsAt) return "Falta la fecha de fin (o marca 'es de un solo día').";
      if (new Date(startsAt) >= new Date(endsAt))
        return "El inicio debe ser anterior al fin.";
    }
    if (regOpensAt && regClosesAt && new Date(regOpensAt) >= new Date(regClosesAt))
      return "La apertura de inscripciones debe ser anterior al cierre.";
    if (regClosesAt && new Date(regClosesAt) > new Date(startsAt))
      return "Las inscripciones deben cerrar antes (o al) inicio del torneo.";
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
    if (format === "groups_to_knockout") {
      const g = Number(groupsCount);
      const a = Number(advancePerGroup);
      const capN = maxParticipants === "" ? null : Number(maxParticipants);
      if (capN != null && capN > 0 && g * a > capN) {
        return "Grupos × clasificados supera el cupo del torneo.";
      }
    }
    return null;
  };

  // Validación del paso actual antes de avanzar.
  const validateStep = (s: Step): string | null => {
    if (s === "details") return validateDetails();
    if (s === "logistics") return validateLogistics();
    return null;
  };

  const addCategory = (draft: CatDraft) => {
    catKeyRef.current += 1;
    setCategories((prev) => [...prev, { ...draft, key: catKeyRef.current }]);
  };
  const removeCategory = (key: number) =>
    setCategories((prev) => prev.filter((c) => c.key !== key));

  const onSubmit = () => {
    if (saving) return;
    const err = validateDetails() ?? validateLogistics();
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
      const apiCategories = categories.map((c) => ({
        name: c.name.trim(),
        gender: c.gender,
        modality: c.modality === "" ? undefined : c.modality,
        mprMin: c.noLevelLimit ? null : c.mprMin,
        mprMax: c.noLevelLimit ? null : c.noUpperCap ? null : c.mprMax,
        ageMin: c.ageMin === "" ? null : Number(c.ageMin),
        ageMax: c.ageMax === "" ? null : Number(c.ageMax),
        maxTeams: c.maxTeams === "" ? null : Number(c.maxTeams),
      }));
      const clampPts = (s: string) => Math.round(Math.max(7, Math.min(31, Number(s) || 11)));
      const scoringConfigVal = { type: mainType, points: clampPts(mainPoints), winBy: 2 as const, bestOf: mainBestOf };
      const groupScoringOverride =
        groupScoringEnabled && format === "groups_to_knockout"
          ? { type: groupType, points: clampPts(groupPoints), winBy: 2 as const, bestOf: groupBestOf }
          : null;
      const finalScoringOverride =
        finalScoringEnabled && format === "groups_to_knockout"
          ? { type: finalType, points: clampPts(finalPoints), winBy: 2 as const, bestOf: finalBestOf }
          : null;

      const res = await createTournament({
        partnerId,
        clubId: clubId || undefined,
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        sport: "pickleball",
        format,
        startsAt: localInputToIso(startsAt),
        endsAt: singleDay || !endsAt ? null : localInputToIso(endsAt),
        registrationOpensAt: regOpensAt ? localInputToIso(regOpensAt) : undefined,
        registrationClosesAt: regClosesAt ? localInputToIso(regClosesAt) : undefined,
        maxParticipants: cap,
        allowWaitlist,
        entryFeeCents: Math.round(fee * 100),
        currency: "USD",
        paymentPolicy,
        prizePoolCents: prizeNum ?? undefined,
        scoringConfig: scoringConfigVal,
        groupPlayoffConfig:
          format === "groups_to_knockout"
            ? {
                groupsCount: Number(groupsCount),
                advancePerGroup: Number(advancePerGroup),
                groupScoringOverride,
                finalScoringOverride,
              }
            : undefined,
        categories: apiCategories.length > 0 ? apiCategories : undefined,
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

  const stepIndex = STEPS.indexOf(step);
  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      toast({ icon: "alert-triangle", title: "Revisa el formulario", sub: err });
      return;
    }
    if (step === "preview") {
      onSubmit();
      return;
    }
    setStep(STEPS[stepIndex + 1]);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  return (
    <div
      className="mp-modal-backdrop mp-tournament-create-modal"
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
        <Header step={step} stepIndex={stepIndex} onClose={onClose} />
        <div key={step} className="mp-tournament-step-anim" style={{ padding: 22, overflow: "auto", flex: 1 }}>
          {step === "terms" && (
            <StepTerms accepted={termsAccepted} setAccepted={setTermsAccepted} />
          )}
          {step === "details" && (
            <StepDetails
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              clubId={clubId}
              setClubId={setClubId}
              clubs={clubs}
              format={format}
              setFormat={setFormat}
              groupsCount={groupsCount}
              setGroupsCount={setGroupsCount}
              advancePerGroup={advancePerGroup}
              setAdvancePerGroup={setAdvancePerGroup}
              mainType={mainType}
              setMainType={setMainType}
              mainPoints={mainPoints}
              setMainPoints={setMainPoints}
              mainBestOf={mainBestOf}
              setMainBestOf={setMainBestOf}
              groupScoringEnabled={groupScoringEnabled}
              setGroupScoringEnabled={setGroupScoringEnabled}
              groupType={groupType}
              setGroupType={setGroupType}
              groupPoints={groupPoints}
              setGroupPoints={setGroupPoints}
              groupBestOf={groupBestOf}
              setGroupBestOf={setGroupBestOf}
              finalScoringEnabled={finalScoringEnabled}
              setFinalScoringEnabled={setFinalScoringEnabled}
              finalType={finalType}
              setFinalType={setFinalType}
              finalPoints={finalPoints}
              setFinalPoints={setFinalPoints}
              finalBestOf={finalBestOf}
              setFinalBestOf={setFinalBestOf}
            />
          )}
          {step === "logistics" && (
            <StepLogistics
              startsAt={startsAt}
              setStartsAt={setStartsAt}
              endsAt={endsAt}
              setEndsAt={setEndsAt}
              singleDay={singleDay}
              setSingleDay={setSingleDay}
              regOpensAt={regOpensAt}
              setRegOpensAt={setRegOpensAt}
              regClosesAt={regClosesAt}
              setRegClosesAt={setRegClosesAt}
              maxParticipants={maxParticipants}
              setMaxParticipants={setMaxParticipants}
              allowWaitlist={allowWaitlist}
              setAllowWaitlist={setAllowWaitlist}
              entryFee={entryFee}
              onEntryFeeChange={onEntryFeeChange}
              prize={prize}
              setPrize={setPrize}
              paymentPolicy={paymentPolicy}
              setPaymentPolicy={setPaymentPolicy}
            />
          )}
          {step === "categories" && (
            <StepCategories
              categories={categories}
              onAdd={addCategory}
              onRemove={removeCategory}
              isGroups={format === "groups_to_knockout"}
            />
          )}
          {step === "preview" && (
            <StepPreview
              name={name}
              description={description}
              clubLabel={clubLabel}
              scoringSummary={scoringSummary}
              formatLabel={formatLabel}
              startsAt={startsAt}
              endsAt={singleDay ? "" : endsAt}
              regOpensAt={regOpensAt}
              regClosesAt={regClosesAt}
              maxParticipants={maxParticipants}
              entryFee={paymentPolicy === "free" ? "0" : entryFee}
              prize={prize}
              policyLabel={policyLabel}
              categories={categories}
            />
          )}
        </div>
        <Footer
          step={step}
          canAdvance={step === "terms" ? termsAccepted : !saving}
          saving={saving}
          showBack={stepIndex > 0}
          onBack={goBack}
          onNext={goNext}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────

const STEP_TITLES: Record<Step, string> = {
  terms: "Reglas del organizador",
  details: "Datos del torneo",
  logistics: "Fechas, cupos y pago",
  categories: "Categorías",
  preview: "Confirma y publica",
};

function Header({
  step,
  stepIndex,
  onClose,
}: {
  step: Step;
  stepIndex: number;
  onClose: () => void;
}) {
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
          Paso {stepIndex + 1} de {STEPS.length}
        </div>
        <h2
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            margin: "4px 0 8px",
          }}
        >
          {STEP_TITLES[step]}
          <span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <div style={{ display: "flex", gap: 4 }}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              style={{
                height: 3,
                flex: 1,
                borderRadius: 2,
                background: i <= stepIndex ? "var(--primary)" : "var(--border)",
                transition: "background 200ms var(--ease-out)",
              }}
            />
          ))}
        </div>
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
  showBack,
  onBack,
  onNext,
  onCancel,
}: {
  step: Step;
  canAdvance: boolean;
  saving: boolean;
  showBack: boolean;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const nextLabel =
    step === "terms"
      ? "Continuar"
      : step === "preview"
        ? saving
          ? "Creando…"
          : "Crear torneo"
        : "Continuar";
  return (
    <div className="mp-tournament-modal-footer">
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
      <div className="mp-tournament-modal-footer-actions">
        {showBack && (
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
          {step !== "preview" && !saving ? (
            <Icon name="arrow-right" size={12} color="#fff" />
          ) : null}
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
        Antes de publicar un torneo en MATCHPOINT, lee y acepta las siguientes
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
          responsable del cumplimiento. Acepto que MATCHPOINT pueda suspender
          mi torneo si las incumplo.
        </span>
      </label>
    </div>
  );
}

function StepDetails(props: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  clubId: string;
  setClubId: (v: string) => void;
  clubs: ClubOption[];
  format: string;
  setFormat: (v: string) => void;
  groupsCount: string;
  setGroupsCount: (v: string) => void;
  advancePerGroup: string;
  setAdvancePerGroup: (v: string) => void;
  mainType: ScoringType;
  setMainType: (v: ScoringType) => void;
  mainPoints: string;
  setMainPoints: (v: string) => void;
  mainBestOf: 1 | 3 | 5;
  setMainBestOf: (v: 1 | 3 | 5) => void;
  groupScoringEnabled: boolean;
  setGroupScoringEnabled: (v: boolean) => void;
  groupType: ScoringType;
  setGroupType: (v: ScoringType) => void;
  groupPoints: string;
  setGroupPoints: (v: string) => void;
  groupBestOf: 1 | 3 | 5;
  setGroupBestOf: (v: 1 | 3 | 5) => void;
  finalScoringEnabled: boolean;
  setFinalScoringEnabled: (v: boolean) => void;
  finalType: ScoringType;
  setFinalType: (v: ScoringType) => void;
  finalPoints: string;
  setFinalPoints: (v: string) => void;
  finalBestOf: 1 | 3 | 5;
  setFinalBestOf: (v: 1 | 3 | 5) => void;
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

      <Field label="Descripción (opcional)">
        <textarea
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          placeholder="Cuéntales a los jugadores de qué trata el torneo, premios, reglas especiales, etc."
          rows={3}
          maxLength={2000}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Sede (club)">
        <select
          value={props.clubId}
          onChange={(e) => props.setClubId(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={inputStyle}
        >
          <option value="">Sin sede · multi-club</option>
          {props.clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` · ${c.city}` : ""}
            </option>
          ))}
        </select>
        {props.clubs.length === 0 && (
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
            No tienes clubes vinculados. El torneo quedará sin sede; puedes
            vincular clubes desde la sección Clubes.
          </span>
        )}
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

      <Field label="Sistema de puntuación">
        <ScoringConfigurator
          format={props.format}
          mainType={props.mainType}
          setMainType={props.setMainType}
          mainPoints={props.mainPoints}
          setMainPoints={props.setMainPoints}
          mainBestOf={props.mainBestOf}
          setMainBestOf={props.setMainBestOf}
          groupScoringEnabled={props.groupScoringEnabled}
          setGroupScoringEnabled={props.setGroupScoringEnabled}
          groupType={props.groupType}
          setGroupType={props.setGroupType}
          groupPoints={props.groupPoints}
          setGroupPoints={props.setGroupPoints}
          groupBestOf={props.groupBestOf}
          setGroupBestOf={props.setGroupBestOf}
          finalScoringEnabled={props.finalScoringEnabled}
          setFinalScoringEnabled={props.setFinalScoringEnabled}
          finalType={props.finalType}
          setFinalType={props.setFinalType}
          finalPoints={props.finalPoints}
          setFinalPoints={props.setFinalPoints}
          finalBestOf={props.finalBestOf}
          setFinalBestOf={props.setFinalBestOf}
        />
      </Field>

      <Field label="Estructura del cuadro">
        <select
          value={props.format}
          onChange={(e) => props.setFormat(e.target.value)}
          style={inputStyle}
        >
          {TOURNAMENT_FORMATS.map((f) => (
            <option key={f.value} value={f.value} disabled={f.disabled}>
              {f.label}
              {f.badge ? ` (${f.badge})` : ""} — {f.sub}
            </option>
          ))}
        </select>
      </Field>

      {props.format === "groups_to_knockout" && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--muted)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div className="label-mp">Fase de grupos</div>
          <div className="mp-tournament-form-grid-2">
            <Field label="Número de grupos">
              <input
                type="number"
                min={1}
                max={16}
                value={props.groupsCount}
                onChange={(e) => props.setGroupsCount(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Clasifican por grupo">
              <input
                type="number"
                min={1}
                max={16}
                value={props.advancePerGroup}
                onChange={(e) => props.setAdvancePerGroup(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.5 }}>
            Ej.: 2 grupos × 4 clasificados = 8 equipos en cuadro final. Los mejores
            de cada grupo pasan según la tabla del grupo.
          </p>
        </div>
      )}
    </div>
  );
}

function StepLogistics(props: {
  startsAt: string;
  setStartsAt: (v: string) => void;
  endsAt: string;
  setEndsAt: (v: string) => void;
  singleDay: boolean;
  setSingleDay: (v: boolean) => void;
  regOpensAt: string;
  setRegOpensAt: (v: string) => void;
  regClosesAt: string;
  setRegClosesAt: (v: string) => void;
  maxParticipants: string;
  setMaxParticipants: (v: string) => void;
  allowWaitlist: boolean;
  setAllowWaitlist: (v: boolean) => void;
  entryFee: string;
  onEntryFeeChange: (v: string) => void;
  prize: string;
  setPrize: (v: string) => void;
  paymentPolicy: "free" | "prepay" | "onsite" | "flexible";
  setPaymentPolicy: (v: "free" | "prepay" | "onsite" | "flexible") => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="mp-tournament-form-grid-2">
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

      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--muted)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div className="label-mp">Ventana de inscripción (opcional)</div>
        <div className="mp-tournament-form-grid-2">
          <Field label="Abre">
            <input
              type="datetime-local"
              value={props.regOpensAt}
              onChange={(e) => props.setRegOpensAt(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Cierra">
            <input
              type="datetime-local"
              value={props.regClosesAt}
              onChange={(e) => props.setRegClosesAt(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Define cuándo se abren y cierran las inscripciones. Si lo dejas vacío,
          controlas la apertura manualmente con el botón &quot;Publicar torneo&quot;.
        </p>
      </div>

      <div className="mp-tournament-form-grid-3">
        <Field label="Cupos">
          <input
            type="number"
            min={1}
            value={props.maxParticipants}
            onChange={(e) => props.setMaxParticipants(e.target.value)}
            placeholder="Sin límite"
            style={inputStyle}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 11.5,
              color: "var(--muted-fg)",
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            <input
              type="checkbox"
              checked={props.allowWaitlist}
              onChange={(e) => props.setAllowWaitlist(e.target.checked)}
              style={{ accentColor: "var(--primary)" }}
            />
            Permitir lista de espera al llenarse
          </label>
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
          options={PAYMENT_POLICIES.map((p) => ({ value: p.value, label: p.label, sub: p.sub }))}
          value={props.paymentPolicy}
          onChange={(v) => props.setPaymentPolicy(v as typeof props.paymentPolicy)}
        />
      </Field>
    </div>
  );
}

// ── Categorías ─────────────────────────────────────────────────────────
const CAT_MODALITIES = [
  { value: "" as const, label: "Igual que el torneo" },
  { value: "singles" as const, label: "Singles (1 vs 1)" },
  { value: "doubles" as const, label: "Dobles (2 vs 2)" },
  { value: "mixed_doubles" as const, label: "Dobles mixto" },
];

function catSummary(c: WizardCategory): string {
  const parts: string[] = [];
  if (c.modality) {
    parts.push(CAT_MODALITIES.find((m) => m.value === c.modality)?.label.split(" (")[0] ?? c.modality);
  }
  const gLabel = GENDERS.find((g) => g.value === c.gender)?.label;
  if (gLabel && c.gender !== "open") parts.push(gLabel);
  if (c.noLevelLimit) parts.push("Open");
  else if (c.noUpperCap) parts.push(`MPR ${c.mprMin.toFixed(2)}+`);
  else parts.push(`MPR ${c.mprMin.toFixed(2)}–${c.mprMax.toFixed(2)}`);
  if (c.ageMin !== "" || c.ageMax !== "")
    parts.push(`${c.ageMin || "0"}–${c.ageMax || "∞"} años`);
  if (c.maxTeams !== "") parts.push(`${c.maxTeams} cupos`);
  return parts.join(" · ");
}

function StepCategories({
  categories,
  onAdd,
  onRemove,
  isGroups,
}: {
  categories: WizardCategory[];
  onAdd: (c: CatDraft) => void;
  onRemove: (key: number) => void;
  isGroups: boolean;
}) {
  const [draft, setDraft] = useState<CatDraft>(EMPTY_CAT);
  const [formOpen, setFormOpen] = useState(false);

  const commit = () => {
    if (draft.name.trim().length < 1) return;
    onAdd(draft);
    setDraft(EMPTY_CAT);
    setFormOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.6 }}>
        Las categorías dividen el torneo por nivel (MPR), género o edad. Son{" "}
        <b>opcionales</b>: si no agregas ninguna, los jugadores se inscriben sin
        categoría. Puedes editarlas después desde la gestión del torneo.
      </p>

      {isGroups && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(251,191,36,0.12)",
            border: "1px solid rgba(251,191,36,0.4)",
            fontSize: 11.5,
            lineHeight: 1.5,
            color: "#92400e",
          }}
        >
          <Icon name="info" size={12} color="#92400e" /> En &quot;Grupos +
          eliminación&quot; cada categoría usa la configuración de grupos que
          definiste. Si no agregas categorías, creamos una con la modalidad.
        </div>
      )}

      {categories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categories.map((c) => (
            <div
              key={c.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                  {catSummary(c)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(c.key)}
                aria-label="Quitar categoría"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#dc2626",
                  flexShrink: 0,
                }}
              >
                <Icon name="trash-2" size={12} color="#dc2626" />
              </button>
            </div>
          ))}
        </div>
      )}

      {formOpen ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 14,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--muted)",
          }}
        >
          <Field label="Nombre de la categoría">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ej: Categoría A, +50, Mixto Open"
              style={inputStyle}
            />
          </Field>

          <Field label="Género">
            <select
              value={draft.gender}
              onChange={(e) =>
                setDraft({ ...draft, gender: e.target.value as CatDraft["gender"] })
              }
              style={inputStyle}
            >
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Modalidad">
            <select
              value={draft.modality}
              onChange={(e) =>
                setDraft({ ...draft, modality: e.target.value as CatDraft["modality"] })
              }
              style={inputStyle}
            >
              {CAT_MODALITIES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={
              draft.noLevelLimit
                ? "Rango MPR · Open (sin restricción)"
                : draft.noUpperCap
                  ? `Rango MPR · ${draft.mprMin.toFixed(2)}+ (sin tope)`
                  : `Rango MPR · ${draft.mprMin.toFixed(2)} – ${draft.mprMax.toFixed(2)}`
            }
          >
            <MprRangeSlider
              min={draft.mprMin}
              max={draft.mprMax}
              disabled={draft.noLevelLimit}
              noUpperCap={draft.noUpperCap}
              onChange={(lo, hi) => setDraft({ ...draft, mprMin: lo, mprMax: hi })}
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
                  checked={draft.noUpperCap}
                  disabled={draft.noLevelLimit}
                  onChange={(e) => setDraft({ ...draft, noUpperCap: e.target.checked })}
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
                  checked={draft.noLevelLimit}
                  onChange={(e) => setDraft({ ...draft, noLevelLimit: e.target.checked })}
                  style={{ accentColor: "var(--primary)" }}
                />
                Open (sin filtro de nivel)
              </label>
            </div>
          </Field>

          <div className="mp-tournament-form-grid-3">
            <Field label="Edad mín.">
              <input
                type="number"
                min={0}
                max={120}
                value={draft.ageMin}
                onChange={(e) => setDraft({ ...draft, ageMin: e.target.value })}
                placeholder="—"
                style={inputStyle}
              />
            </Field>
            <Field label="Edad máx.">
              <input
                type="number"
                min={0}
                max={120}
                value={draft.ageMax}
                onChange={(e) => setDraft({ ...draft, ageMax: e.target.value })}
                placeholder="—"
                style={inputStyle}
              />
            </Field>
            <Field label="Cupos">
              <input
                type="number"
                min={1}
                value={draft.maxTeams}
                onChange={(e) => setDraft({ ...draft, maxTeams: e.target.value })}
                placeholder="Sin límite"
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY_CAT);
                setFormOpen(false);
              }}
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={draft.name.trim().length < 1}
              className="btn btn-primary"
              style={{ opacity: draft.name.trim().length < 1 ? 0.6 : 1 }}
            >
              <Icon name="plus" size={12} color="#fff" />
              Agregar categoría
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="btn"
          style={{
            justifyContent: "center",
            background: "#fff",
            border: "1px dashed var(--border)",
            color: "#0a0a0a",
            padding: "12px",
          }}
        >
          <Icon name="plus" size={13} />
          {categories.length === 0 ? "Agregar categoría" : "Agregar otra categoría"}
        </button>
      )}
    </div>
  );
}

type ScoringSummary = {
  main: { type: ScoringType; points: number; bestOf: 1 | 3 | 5 };
  group?: { type: ScoringType; points: number; bestOf: 1 | 3 | 5 } | null;
  final?: { type: ScoringType; points: number; bestOf: 1 | 3 | 5 } | null;
};

function StepPreview(props: {
  name: string;
  description: string;
  clubLabel: string;
  scoringSummary: ScoringSummary;
  formatLabel: string;
  startsAt: string;
  endsAt: string;
  regOpensAt: string;
  regClosesAt: string;
  maxParticipants: string;
  entryFee: string;
  prize: string;
  policyLabel: string;
  categories: WizardCategory[];
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
  const hasRegWindow = props.regOpensAt || props.regClosesAt;
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
          Pickleball · {props.formatLabel}
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
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
          {fmtDate(props.startsAt)}
          {props.endsAt ? ` → ${fmtDate(props.endsAt)}` : " · Un solo día"}
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
          <Icon name="map-pin" size={11} color="rgba(255,255,255,0.7)" /> {props.clubLabel}
        </div>
        {props.description.trim() && (
          <div
            style={{
              fontSize: 11.5,
              color: "rgba(255,255,255,0.8)",
              marginTop: 10,
              lineHeight: 1.5,
              borderTop: "1px solid rgba(255,255,255,0.12)",
              paddingTop: 10,
            }}
          >
            {props.description.trim()}
          </div>
        )}
      </div>

      <div className="mp-tournament-preview-kpis">
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

      {hasRegWindow && (
        <div
          className="card"
          style={{
            padding: 14,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--muted)",
            marginTop: 12,
          }}
        >
          <div className="label-mp">Ventana de inscripción</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: "#0a0a0a" }}>
            {props.regOpensAt ? `Abre ${fmtDate(props.regOpensAt)}` : "Apertura manual"}
            {" · "}
            {props.regClosesAt ? `Cierra ${fmtDate(props.regClosesAt)}` : "Cierre manual"}
          </div>
        </div>
      )}

      {props.categories.length > 0 && (
        <div
          className="card"
          style={{
            padding: 14,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "#fff",
            marginTop: 12,
          }}
        >
          <div className="label-mp">Categorías · {props.categories.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {props.categories.map((c) => (
              <div key={c.key} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <b style={{ fontSize: 12, color: "#0a0a0a" }}>{c.name}</b>
                <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{catSummary(c)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--muted)",
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div className="label-mp">Sistema de puntuación</div>
        {(["main", "group", "final"] as const).map((key) => {
          const cfg = props.scoringSummary[key];
          if (!cfg) return null;
          const sectionLabel = key === "main" ? "Partidos regulares" : key === "group" ? "Fase de grupos" : "Final";
          return (
            <div key={key}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)", marginBottom: 6 }}>
                {sectionLabel}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Chip label={cfg.type === "side_out" ? "Side-out" : "Rally"} />
                <Chip label={`${cfg.points} pts`} />
                <Chip label={`Mejor de ${cfg.bestOf}`} />
                <Chip label="Gana por 2" />
              </div>
            </div>
          );
        })}
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

// ── Scoring configurator ─────────────────────────────────────────────

function ScoringSection({
  type, setType,
  points, setPoints,
  bestOf, setBestOf,
}: {
  type: ScoringType;
  setType: (v: ScoringType) => void;
  points: string;
  setPoints: (v: string) => void;
  bestOf: 1 | 3 | 5;
  setBestOf: (v: 1 | 3 | 5) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)", marginBottom: 6 }}>Tipo</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["side_out", "rally"] as const).map((t) => {
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                style={{
                  flex: 1, padding: "9px 10px", borderRadius: 10, cursor: "pointer",
                  background: active ? "#0a0a0a" : "#fff",
                  color: active ? "#fff" : "#0a0a0a",
                  border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`,
                  textAlign: "left", fontFamily: "inherit",
                  transition: "background 140ms var(--ease-out)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800 }}>{t === "side_out" ? "Side-out" : "Rally"}</div>
                <div style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.65)" : "var(--muted-fg)", marginTop: 2 }}>
                  {t === "side_out" ? "Solo el sacador puntúa" : "Cualquiera puntúa cada rally"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)", marginBottom: 6 }}>Puntos para ganar</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {["11", "15", "21"].map((p) => {
            const active = points === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPoints(p)}
                style={{
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 800, fontSize: 13,
                  background: active ? "#0a0a0a" : "#fff",
                  color: active ? "#fff" : "#0a0a0a",
                  border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`,
                  transition: "background 140ms var(--ease-out)",
                }}
              >
                {p}
              </button>
            );
          })}
          <input
            type="number"
            min={7}
            max={31}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="7-31"
            style={{ ...inputStyle, width: 76, flex: "none" }}
          />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)", marginBottom: 6 }}>Mejor de</div>
        <div style={{ display: "flex", gap: 6 }}>
          {([1, 3, 5] as const).map((n) => {
            const active = bestOf === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setBestOf(n)}
                style={{
                  flex: 1, padding: "9px 10px", borderRadius: 10, cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 800, fontSize: 12.5,
                  background: active ? "#0a0a0a" : "#fff",
                  color: active ? "#fff" : "#0a0a0a",
                  border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`,
                  transition: "background 140ms var(--ease-out)",
                }}
              >
                {n} {n === 1 ? "game" : "games"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScoringConfigurator(props: {
  format: string;
  mainType: ScoringType; setMainType: (v: ScoringType) => void;
  mainPoints: string; setMainPoints: (v: string) => void;
  mainBestOf: 1 | 3 | 5; setMainBestOf: (v: 1 | 3 | 5) => void;
  groupScoringEnabled: boolean; setGroupScoringEnabled: (v: boolean) => void;
  groupType: ScoringType; setGroupType: (v: ScoringType) => void;
  groupPoints: string; setGroupPoints: (v: string) => void;
  groupBestOf: 1 | 3 | 5; setGroupBestOf: (v: 1 | 3 | 5) => void;
  finalScoringEnabled: boolean; setFinalScoringEnabled: (v: boolean) => void;
  finalType: ScoringType; setFinalType: (v: ScoringType) => void;
  finalPoints: string; setFinalPoints: (v: string) => void;
  finalBestOf: 1 | 3 | 5; setFinalBestOf: (v: 1 | 3 | 5) => void;
}) {
  const isGroups = props.format === "groups_to_knockout";
  const [customizingMain, setCustomizingMain] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Presets rápidos */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SCORING_QUICK_PRESETS.map((p) => {
          const isActive =
            props.mainType === p.type && props.mainPoints === p.points && props.mainBestOf === p.bestOf;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => { props.setMainType(p.type); props.setMainPoints(p.points); props.setMainBestOf(p.bestOf); }}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: isActive ? "rgba(16,185,129,0.06)" : "#fff",
                border: isActive ? "2px solid var(--primary)" : "1px solid var(--border)",
                color: "#0a0a0a",
                fontFamily: "inherit", transition: "background 120ms var(--ease-out)",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {/* Partidos regulares */}
      <div>
        <button
          type="button"
          onClick={() => setCustomizingMain((v) => !v)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "inherit", fontSize: 10.5, fontWeight: 700, color: "var(--muted-fg)",
          }}
        >
          {customizingMain ? "Ocultar" : "Personalizar puntuación ›"}
        </button>
        {customizingMain && (
          <div style={{ marginTop: 10, padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--muted)" }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, color: "#0a0a0a" }}>
              Partidos regulares
            </div>
            <ScoringSection
              type={props.mainType} setType={props.setMainType}
              points={props.mainPoints} setPoints={props.setMainPoints}
              bestOf={props.mainBestOf} setBestOf={props.setMainBestOf}
            />
          </div>
        )}
      </div>
      {/* Fase de grupos */}
      {isGroups && (
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--muted)" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={props.groupScoringEnabled}
              onChange={(e) => props.setGroupScoringEnabled(e.target.checked)}
              style={{ accentColor: "var(--primary)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0a0a0a" }}>
                Fase de grupos — puntuación diferente
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                Si no lo activas, los grupos usan los puntos regulares
              </div>
            </div>
          </label>
          {props.groupScoringEnabled && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <ScoringSection
                type={props.groupType} setType={props.setGroupType}
                points={props.groupPoints} setPoints={props.setGroupPoints}
                bestOf={props.groupBestOf} setBestOf={props.setGroupBestOf}
              />
            </div>
          )}
        </div>
      )}
      {/* Final */}
      {isGroups && (
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--muted)" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={props.finalScoringEnabled}
              onChange={(e) => props.setFinalScoringEnabled(e.target.checked)}
              style={{ accentColor: "var(--primary)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0a0a0a" }}>
                Final — puntuación diferente
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                Si no lo activas, la final usa los puntos regulares
              </div>
            </div>
          </label>
          {props.finalScoringEnabled && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <ScoringSection
                type={props.finalType} setType={props.setFinalType}
                points={props.finalPoints} setPoints={props.setFinalPoints}
                bestOf={props.finalBestOf} setBestOf={props.setFinalBestOf}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
