// Wizard de creación de una Quedada (juego social). Overlay tipo EditBioModal/
// RetarModal, sin cierre por click afuera (para no perder el progreso). 3 pasos:
// Básicos+categorías → Cuota+canchas → Pago+premios. Guarda todo con createQuedada
// (incl. logística, bancarios, premios y categorías iniciales). El cupo es POR
// categoría; los slots/parejas/pagos se llenan luego en gestión.
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LabelWithTip } from "@/components/dashboard/widgets/InfoTip";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  createQuedada,
  listQuedadaTemplates,
  saveQuedadaTemplate,
  deleteQuedadaTemplate,
} from "@/server/actions/quedadas";
import { DEFAULT_QUEDADA_DESCRIPTION } from "@/lib/quedadas/defaults";
import {
  BankAccountFields,
  EMPTY_BANK,
  bankDraftToAccount,
  bankDraftIsIncomplete,
  type BankDraft,
} from "./quedada-fields/BankAccountFields";
import { PrizesEditor, prizeDraftsToPrizes, type PrizeDraft } from "./quedada-fields/PrizesEditor";
import { ruleDraftsToRules, type RuleDraft } from "./quedada-fields/RulesEditor";
import { RulesPresetPicker } from "./quedada-fields/RulesPresetPicker";
import { mergeRuleDrafts, splitRuleDrafts } from "@/lib/quedadas/preset-rules";
import { SUMA_MIN, SUMA_MAX, sumaLabel } from "@/lib/quedadas/level";
import { rosterModeFor } from "@/lib/quedadas/engines/registry";
import { quedadaFormatOptions } from "@/lib/quedadas/format-labels";

type Format = "americano" | "mexicano" | "round_robin" | "kotc" | "canguil" | "libre";
type MatchMode = "singles" | "doubles";
type Visibility = "open" | "private";

// El nivel es la "Suma" (nivel combinado de la pareja): 2.0–14.0, paso 0.5.
// `noLevel` = categoría sin número (ej. Open Mixto) → oculta el slider.
type CatDraft = { name: string; suma: number; noLevel: boolean; hour: string; slots: string };

// Config precargable (duplicar / plantilla). Sin fecha (siempre se elige nueva).
export type QuedadaInitial = {
  title?: string;
  description?: string;
  format?: Format;
  matchMode?: MatchMode;
  visibility?: Visibility;
  locationText?: string;
  feeUsd?: string;
  courts?: string;
  hours?: string;
  courtPriceUsd?: string;
  bank?: BankDraft;
  prizeRows?: PrizeDraft[];
  ruleRows?: RuleDraft[];
  perks?: string;
  categories?: CatDraft[];
};

const FORMATS = quedadaFormatOptions();

const STEPS = ["Básicos y categorías", "Cuota y canchas", "Pago y premios"];

/** Ancho generoso: 3 columnas de formato + filas de dos campos sin apretar. */
const MODAL_MAX_WIDTH_PX = 960;

function localToIso(local: string): string {
  return new Date(local).toISOString();
}
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type TemplateRow = { id: string; name: string; config: QuedadaInitial };

export function CrearQuedadaModal({ onClose, initial }: { onClose: () => void; initial?: QuedadaInitial }) {
  const router = useRouter();
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  // Paso 1 — se siembran de `initial` (duplicar/plantilla) si viene.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? DEFAULT_QUEDADA_DESCRIPTION);
  const [format, setFormat] = useState<Format | "">(initial?.format ?? "");
  const [matchMode, setMatchMode] = useState<MatchMode | "">(initial?.matchMode ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "open");
  const [startsLocal, setStartsLocal] = useState(""); // nunca se precarga la fecha
  const [locationText, setLocationText] = useState(initial?.locationText ?? "");
  // Paso 2
  const [feeUsd, setFeeUsd] = useState(initial?.feeUsd ?? "0");
  const [courts, setCourts] = useState(initial?.courts ?? "");
  const [hours, setHours] = useState(initial?.hours ?? "");
  const [courtPriceUsd, setCourtPriceUsd] = useState(initial?.courtPriceUsd ?? "");
  // Paso 3 — bancarios estructurados + premios estructurados + perks
  const [bank, setBank] = useState<BankDraft>(initial?.bank ?? { ...EMPTY_BANK });
  const [prizeRows, setPrizeRows] = useState<PrizeDraft[]>(initial?.prizeRows ?? []);
  const initialRules = splitRuleDrafts(initial?.ruleRows ?? []);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>(initialRules.presetIds);
  const [customRuleRows, setCustomRuleRows] = useState<RuleDraft[]>(initialRules.customRules);
  const [perks, setPerks] = useState(initial?.perks ?? "");
  // Categorías iniciales
  const emptyCategory = (): CatDraft => ({
    name: sumaLabel(6),
    suma: 6,
    noLevel: false,
    hour: "",
    slots: "",
  });
  const [categories, setCategories] = useState<CatDraft[]>(
    initial?.categories?.length ? initial.categories : [emptyCategory()],
  );

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

  // El cupo es POR CATEGORÍA. El engine decide si cada cupo es 1 jugador o 1 pareja.
  const individualRoster =
    format !== "" && matchMode !== "" ? rosterModeFor(format, matchMode) === "individual" : false;
  const playersPerSlot = individualRoster ? 1 : 2;

  const costEstimate = useMemo(() => {
    const totalSlots = categories.reduce((sum, c) => sum + (parseInt(c.slots || "0", 10) || 0), 0);
    const courtsN = parseFloat(courts || "0");
    const hoursN = parseFloat(hours || "0");
    const priceN = parseFloat(courtPriceUsd || "0");
    const hasCourtInputs = Number.isFinite(courtsN) && courtsN > 0 && Number.isFinite(hoursN) && hoursN > 0 && Number.isFinite(priceN) && priceN > 0;

    if (courtCost <= 0) return null;

    const totalPlayers = totalSlots > 0 ? totalSlots * playersPerSlot : 0;
    const courtPerPlayerCents =
      totalPlayers > 0 ? Math.ceil(courtCost / totalPlayers) : null;

    return {
      totalSlots,
      totalPlayers,
      hasCourtInputs,
      courtsN: Number.isFinite(courtsN) ? courtsN : 0,
      hoursN: Number.isFinite(hoursN) ? hoursN : 0,
      priceN: Number.isFinite(priceN) ? priceN : 0,
      courtPerPlayerCents,
    };
  }, [courtCost, categories, courts, hours, courtPriceUsd, playersPerSlot]);

  const OPEN_CATEGORY_NAME = "Open Mixto";

  /** Nombre sugerido desde el nivel; solo pisa el input si aún va sincronizado con el slider. */
  function isSyncedCategoryName(name: string): boolean {
    const t = name.trim();
    if (!t) return true;
    if (t === OPEN_CATEGORY_NAME) return true;
    return /^Suma\s+\d+(?:\.\d)?$/i.test(t);
  }

  function nameFromLevel(suma: number, noLevel: boolean): string {
    return noLevel ? OPEN_CATEGORY_NAME : sumaLabel(suma);
  }

  function patchCategoryLevel(cat: CatDraft, patch: Partial<CatDraft>): CatDraft {
    const next = { ...cat, ...patch };
    if (("suma" in patch || "noLevel" in patch) && isSyncedCategoryName(cat.name)) {
      next.name = nameFromLevel(next.suma, next.noLevel);
    }
    return next;
  }

  function catHourToIso(hour: string): string | undefined {
    if (!hour) return undefined;
    const base = startsLocal ? startsLocal.split("T")[0] : new Date().toISOString().slice(0, 10);
    const d = new Date(`${base}T${hour}`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  /** Al menos una categoría con nombre y cupos ≥ 1 (obligatorio al crear). */
  function validateCategories(): boolean {
    const named = categories.filter((c) => c.name.trim());
    if (named.length === 0) {
      toast({ icon: "alert-triangle", title: "Agrega al menos una categoría", sub: "Nombre y cupos son obligatorios." });
      return false;
    }
    for (const c of named) {
      const slots = parseInt(c.slots, 10);
      if (!Number.isFinite(slots) || slots < 1) {
        toast({ icon: "alert-triangle", title: "Cupos por categoría", sub: `En "${c.name.trim()}" indica al menos 1 cupo.` });
        return false;
      }
    }
    return true;
  }

  function allRuleDrafts() {
    return mergeRuleDrafts(selectedRuleIds, customRuleRows);
  }

  function validateRules(): boolean {
    if (ruleDraftsToRules(allRuleDrafts()).length > 0) return true;
    toast({
      icon: "alert-triangle",
      title: "Elige al menos una regla",
      sub: "Marca una predefinida o agrega la tuya con «Agregar regla».",
    });
    return false;
  }

  function validateBank(): boolean {
    if (bankDraftToAccount(bank)) return true;
    if (bankDraftIsIncomplete(bank)) {
      toast({
        icon: "alert-triangle",
        title: "Completa los datos del banco",
        sub: "Banco, tipo de cuenta, número y titular son obligatorios.",
      });
      return false;
    }
    toast({
      icon: "alert-triangle",
      title: "Datos del organizador obligatorios",
      sub: "Indica banco, tipo, número y titular para que los inscritos puedan transferir.",
    });
    return false;
  }

  function categoriesPayload() {
    return categories
      .filter((c) => c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        levelLabel: c.noLevel ? undefined : sumaLabel(c.suma),
        startsAt: catHourToIso(c.hour),
        maxSlots: parseInt(c.slots, 10),
      }));
  }

  // ── Plantillas (hasta 5) ────────────────────────────────────────────────────
  const refreshTemplates = useCallback(async () => {
    const res = await listQuedadaTemplates({});
    if (res.ok) setTemplates(res.data as unknown as TemplateRow[]);
  }, []);
  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  // Snapshot del estado actual del wizard (sin fecha) para guardar como plantilla.
  const currentConfig = (): QuedadaInitial => ({
    title,
    description,
    format: format || undefined,
    matchMode: matchMode || undefined,
    visibility,
    locationText,
    feeUsd,
    courts,
    hours,
    courtPriceUsd,
    bank,
    prizeRows,
    ruleRows: allRuleDrafts(),
    perks,
    categories,
  });

  // Carga una plantilla/duplicado en todos los pasos (no toca la fecha).
  const loadInitial = (init: QuedadaInitial) => {
    setTitle(init.title ?? "");
    setDescription(init.description ?? DEFAULT_QUEDADA_DESCRIPTION);
    setFormat(init.format ?? "");
    setMatchMode(init.matchMode ?? "");
    if (init.visibility) setVisibility(init.visibility);
    setLocationText(init.locationText ?? "");
    setFeeUsd(init.feeUsd ?? "0");
    setCourts(init.courts ?? "");
    setHours(init.hours ?? "");
    setCourtPriceUsd(init.courtPriceUsd ?? "");
    setBank(init.bank ?? { ...EMPTY_BANK });
    setPrizeRows(init.prizeRows ?? []);
    const split = splitRuleDrafts(init.ruleRows ?? []);
    setSelectedRuleIds(split.presetIds);
    setCustomRuleRows(split.customRules);
    setPerks(init.perks ?? "");
    setCategories(init.categories?.length ? init.categories : [emptyCategory()]);
    setStep(0);
    toast({ icon: "check", title: "Plantilla cargada" });
  };

  const saveAsTemplate = async () => {
    if (templates.length >= 5) {
      toast({ icon: "alert-triangle", title: "Máximo 5 plantillas", sub: "Borra una para guardar otra." });
      return;
    }
    const name = await ask({
      title: "Guardar como plantilla",
      label: "Nombre de la plantilla",
      placeholder: "Ej. Quedada social de los sábados",
      required: true,
      confirmLabel: "Guardar",
      validate: (v) => (v.trim().length < 1 ? "Escribe un nombre" : null),
    });
    if (name == null) return;
    const res = await saveQuedadaTemplate({ name: name.trim(), config: currentConfig() });
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
      return;
    }
    toast({ icon: "check-circle-2", title: "Plantilla guardada" });
    void refreshTemplates();
  };

  const removeTemplate = async (id: string) => {
    const ok = await confirm({
      title: "Borrar plantilla",
      body: "¿Borrar esta plantilla? No afecta a las quedadas ya creadas.",
      confirmLabel: "Borrar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteQuedadaTemplate({ templateId: id });
    if (!res.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo borrar", sub: res.error.message });
      return;
    }
    toast({ icon: "check", title: "Plantilla borrada" });
    void refreshTemplates();
  };

  function validateStep0(): boolean {
    if (!format) {
      toast({ icon: "alert-triangle", title: "Elige un formato" });
      return false;
    }
    if (!matchMode) {
      toast({ icon: "alert-triangle", title: "Elige el modo", sub: "Dobles o singles." });
      return false;
    }
    if (title.trim().length < 3) {
      toast({ icon: "alert-triangle", title: "Ponle un título", sub: "Mínimo 3 caracteres." });
      return false;
    }
    if (description.trim().length < 3) {
      toast({ icon: "alert-triangle", title: "Escribe una descripción", sub: "Mínimo 3 caracteres." });
      return false;
    }
    if (!startsLocal || Number.isNaN(Date.parse(localToIso(startsLocal)))) {
      toast({ icon: "alert-triangle", title: "Elige fecha y hora" });
      return false;
    }
    if (!validateCategories()) return false;
    return true;
  }

  // Validación para avanzar de paso.
  const canAdvance = (): boolean => {
    if (step === 0 && !validateStep0()) return false;
    if (step === 2) {
      if (!validateRules()) return false;
      if (!validateBank()) return false;
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
    if (!validateStep0()) {
      setStep(0);
      return;
    }
    if (!validateRules() || !validateBank()) {
      setStep(2);
      return;
    }
    const feeNum = Math.round(parseFloat(feeUsd || "0") * 100);
    const feeCents = Number.isFinite(feeNum) && feeNum > 0 ? feeNum : 0;
    const paymentAccount = bankDraftToAccount(bank)!;
    const courtsN = courts.trim() ? parseInt(courts, 10) : undefined;
    const hoursN = hours.trim() ? parseFloat(hours) : undefined;
    const priceCents = courtPriceUsd.trim() ? Math.round(parseFloat(courtPriceUsd) * 100) : undefined;
    const cats = categoriesPayload();

    startTransition(async () => {
      const res = await createQuedada({
        title: title.trim(),
        description: description.trim(),
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
        paymentAccount,
        prizes: prizeDraftsToPrizes(prizeRows).length > 0 ? prizeDraftsToPrizes(prizeRows) : undefined,
        rules: ruleDraftsToRules(allRuleDrafts()),
        categories: cats,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: res.error.message });
        return;
      }
      toast({ icon: "party-popper", title: "Quedada creada", sub: "Configura inscripciones y pagos desde aquí." });
      onClose();
      router.push(`/dashboard/user/quedada/${res.data.id}`);
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
        @keyframes mp-q-pop{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
        .mp-crear-quedada-formats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        @media (max-width:640px){.mp-crear-quedada-formats{grid-template-columns:repeat(2,minmax(0,1fr))}}`}</style>
      <div
        role="dialog"
        aria-modal="true"
        className="card"
        style={{
          width: "100%",
          maxWidth: MODAL_MAX_WIDTH_PX,
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
          <button onClick={onClose} className="btn" style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }} aria-label="Cerrar">
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
              {templates.length > 0 && (
                <Field label={`Plantillas guardadas · ${templates.length}/5`}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {templates.map((t) => (
                      <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 10px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff" }}>
                        <button type="button" onClick={() => loadInitial(t.config)} title="Cargar plantilla" style={{ border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "var(--fg)", padding: 0 }}>
                          {t.name}
                        </button>
                        <button type="button" onClick={() => removeTemplate(t.id)} aria-label="Borrar plantilla" style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--muted-fg)", display: "inline-flex", padding: 0 }}>
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </Field>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                <Field label="Título">
                  <input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Rotación de parejas del sábado en Cumbayá" style={inputStyle} />
                </Field>
                <Field label="Descripción">
                  <textarea
                    required
                    value={description}
                    maxLength={500}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Cuéntale a la gente de qué va…"
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  />
                </Field>
              </div>
              <Field
                label="Formato"
                tip="Elige el formato (rotación de parejas, escalera por nivel, todos contra todos, etc.). Todos comparten roster, pagos y tabla; cambia cómo se arman las rondas."
              >
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginBottom: 8 }}>
                  Todos los formatos tienen vista de partidos, roster, pagos y tabla; cambia solo la mecánica del motor.
                </div>
                <div className="mp-crear-quedada-formats">
                  {FORMATS.map((f) => {
                    const on = format === f.k;
                    return (
                      <button key={f.k} type="button" onClick={() => setFormat(f.k)} style={{ padding: 11, borderRadius: 10, border: on ? "2px solid var(--primary)" : "1px solid var(--border)", background: on ? "var(--color-mp-primary-light)" : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 900, color: on ? "var(--color-mp-primary-active)" : "var(--fg)" }}>{f.label}</div>
                        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{f.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field
                  label="Modo"
                  tip="Dobles = parejas fijas por cupo. Singles = un jugador por cupo y el rival rota según el formato."
                >
                  <div style={{ display: "flex", gap: 6 }}>
                    {([{ k: "doubles" as const, l: "Dobles", i: "users" }, { k: "singles" as const, l: "Singles", i: "user" }]).map((o) => {
                      const on = matchMode === o.k;
                      return (
                        <button key={o.k} type="button" onClick={() => setMatchMode(o.k)} style={{ ...segBtn, ...(on ? segBtnOn : {}) }}>
                          <Icon name={o.i} size={12} color={on ? "var(--color-mp-primary-active)" : "var(--fg)"} />{o.l}
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
                          <Icon name={o.i} size={12} color={on ? "var(--color-mp-primary-active)" : "var(--fg)"} />{o.l}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field
                  label="Fecha y hora"
                  tip="Recomendamos poner la hora unos 30 minutos antes del inicio real del juego. Así el check-in y el aviso a inscritos encajan mejor con cuando la gente llega."
                >
                  <input type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Lugar · opcional">
                  <input value={locationText} maxLength={140} onChange={(e) => setLocationText(e.target.value)} placeholder="Club, cancha o dirección" style={inputStyle} />
                </Field>
              </div>
              <Field
                label="Categorías"
                tip="Obligatorio: al menos una categoría con nombre y cupos. La hora por categoría es opcional; las parejas las armas después en Gestionar."
              >
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginBottom: 8 }}>
                  Define al menos una categoría (ej. Suma 6.0 · 7pm, Open Mixto · 8pm). Las parejas y los slots los
                  llenas después en <strong>Gestionar</strong>.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {categories.map((c, i) => {
                    const setCat = (patch: Partial<CatDraft>) =>
                      setCategories((arr) => arr.map((x, j) => (j === i ? patchCategoryLevel(x, patch) : x)));
                    return (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input value={c.name} placeholder="Nombre (ej. Suma 6.0, Open Mixto)" style={{ ...inputStyle, flex: 1 }} onChange={(e) => setCat({ name: e.target.value })} />
                          <button
                            type="button"
                            onClick={() => setCategories((arr) => arr.filter((_, j) => j !== i))}
                            disabled={categories.length <= 1}
                            className="btn"
                            style={{ background: "#fff", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", padding: "0 12px", opacity: categories.length <= 1 ? 0.4 : 1 }}
                            aria-label="Quitar categoría"
                            title={categories.length <= 1 ? "Debe quedar al menos una categoría" : undefined}
                          >
                            <Icon name="trash-2" size={14} />
                          </button>
                        </div>

                        {/* Nivel (Suma) */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: c.noLevel ? "var(--muted-fg)" : "var(--fg)" }}>
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
                          <input type="number" min={1} required value={c.slots} placeholder="Cupos *" style={inputStyle} onChange={(e) => setCat({ slots: e.target.value })} />
                        </div>
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => setCategories((arr) => [...arr, emptyCategory()])} className="btn btn-outline" style={{ alignSelf: "flex-start" }}>
                    <Icon name="plus" size={13} /> Agregar categoría
                  </button>
                </div>
                <Hint>
                  El cupo se define por categoría (cupos de arriba), no global.
                  {format && matchMode
                    ? individualRoster
                      ? " En este formato cada cupo es un jugador (el compañero rota cada ronda)."
                      : " En parejas fijas cada cupo es una pareja."
                    : " Elige formato y modo para ver cómo se cuentan los cupos."}
                </Hint>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field
                label="Cuota de inscripción · USD"
                tip="Por lo general incluye la cancha. Usa el estimado de abajo como referencia. 0 = gratis."
              >
                <input type="number" min={0} step="0.5" value={feeUsd} onChange={(e) => setFeeUsd(e.target.value)} placeholder="0" style={inputStyle} />
                <Hint>0 = gratis. Si cobras, el jugador sube comprobante (transferencia).</Hint>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="Canchas" tip="Opcional. Con horas y precio/hora estimamos el costo de cancha repartido entre los jugadores (según cupos del paso 1).">
                  <input type="number" min={1} max={64} value={courts} onChange={(e) => setCourts(e.target.value)} placeholder="Ej. 2" style={inputStyle} />
                </Field>
                <Field
                  label="Horas"
                  tip="Horas totales de cancha reservadas. Se multiplican por canchas × precio/hora y se reparten entre los jugadores."
                >
                  <input type="number" min={0.5} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Ej. 3" style={inputStyle} />
                </Field>
                <Field
                  label="Precio x hora"
                  tip="Costo por hora de cada cancha en dólares. Se multiplica por canchas × horas para el estimado de abajo."
                >
                  <UsdNumberInput value={courtPriceUsd} onChange={setCourtPriceUsd} placeholder="10" step={0.5} />
                </Field>
              </div>
              {costEstimate != null && (
                <div style={{ padding: 12, borderRadius: 10, background: "#f5f5f4", fontSize: 12.5, display: "flex", flexDirection: "column", gap: 5 }}>
                  {courtCost > 0 && (
                    <>
                      <div style={{ fontWeight: 800 }}>Costo de canchas: {money(courtCost)}</div>
                      {costEstimate.hasCourtInputs && (
                        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                          {costEstimate.courtsN} cancha(s) × {costEstimate.hoursN} h × {money(Math.round(costEstimate.priceN * 100))}/h
                        </div>
                      )}
                    </>
                  )}
                  {costEstimate.totalPlayers > 0 ? (
                    <>
                      <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                        {costEstimate.totalPlayers} {costEstimate.totalPlayers === 1 ? "jugador" : "jugadores"} en total
                        {costEstimate.totalSlots > 0 && !individualRoster && (
                          <> · {costEstimate.totalSlots} cupos (parejas)</>
                        )}
                        {costEstimate.totalSlots > 0 && individualRoster && (
                          <> · {costEstimate.totalSlots} {costEstimate.totalSlots === 1 ? "cupo" : "cupos"}</>
                        )}
                      </div>
                      {costEstimate.courtPerPlayerCents != null && (
                        <div style={{ fontWeight: 800, color: "var(--color-mp-primary-active)" }}>
                          ≈ {money(costEstimate.courtPerPlayerCents)} de cancha por jugador
                          <span style={{ fontWeight: 500, color: "var(--muted-fg)", fontSize: 11 }}> · referencia para la cuota</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                      Define cupos en las categorías (paso 1) para ver el reparto por jugador.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Field
                label="Datos del organizador (para el pago)"
                tip="Obligatorio: banco, tipo, número y titular. Los inscritos los ven al pagar la cuota y en la pestaña Pagos."
              >
                <BankAccountFields value={bank} onChange={setBank} />
                <Hint>Banco, tipo, número y titular son obligatorios. Cédula y nota son opcionales.</Hint>
              </Field>
              <Field
                label="Premios · opcional"
                tip="Aparecen en el detalle de la quedada. Puedes poner solo descripción si el premio no tiene monto fijo."
              >
                <PrizesEditor value={prizeRows} onChange={setPrizeRows} />
              </Field>
              <Field
                label="Reglas clave"
                tip="Obligatorio: marca al menos una regla predefinida o agrega la tuya al final."
              >
                <RulesPresetPicker
                  selectedIds={selectedRuleIds}
                  onChange={setSelectedRuleIds}
                  customRules={customRuleRows}
                  onCustomRulesChange={setCustomRuleRows}
                />
              </Field>
              <Field label="Perks · opcional">
                <textarea value={perks} maxLength={280} onChange={(e) => setPerks(e.target.value)} placeholder="Ej. incluye pelotas, hidratación y snacks" style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} />
              </Field>
            </>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", background: "var(--muted)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={step === 0 ? onClose : back} className="btn btn-outline" disabled={pending}>
            {step === 0 ? "Cancelar" : "Atrás"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <button
              type="button"
              onClick={() => void saveAsTemplate()}
              className="btn btn-outline"
              disabled={pending || templates.length >= 5}
              title={templates.length >= 5 ? "Máximo 5 plantillas. Borra una para guardar otra." : "Guardar la configuración actual del wizard"}
              style={{ fontSize: 11.5, whiteSpace: "nowrap" }}
            >
              <Icon name="bookmark" size={12} />
              Guardar plantilla
              <span style={{ color: "var(--muted-fg)", fontWeight: 700 }}>({templates.length}/5)</span>
            </button>
            {isLast ? (
              <button onClick={save} className="btn btn-primary" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
                {!pending && <Icon name="party-popper" size={13} color="#fff" />}
                {pending ? "Creando…" : "Crear quedada"}
              </button>
            ) : (
              <button onClick={next} className="btn btn-primary" disabled={pending}>
                Siguiente <Icon name="arrow-right" size={13} color="#fff" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-mp" style={{ marginBottom: 6 }}>
        <LabelWithTip tip={tip}>{label}</LabelWithTip>
      </div>
      {children}
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 5 }}>{children}</div>;
}

/** Input numérico USD con prefijo $ siempre visible. */
function UsdNumberInput({
  value,
  onChange,
  placeholder,
  min = 0,
  step = 0.5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 13,
          fontWeight: 800,
          color: "var(--muted-fg)",
          pointerEvents: "none",
          lineHeight: 1,
        }}
      >
        $
      </span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingLeft: 26 }}
      />
    </div>
  );
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
  color: "var(--fg)",
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
  color: "var(--fg)",
};
const segBtnOn: React.CSSProperties = {
  border: "2px solid var(--primary)",
  background: "var(--color-mp-primary-light)",
  color: "var(--color-mp-primary-active)",
};
