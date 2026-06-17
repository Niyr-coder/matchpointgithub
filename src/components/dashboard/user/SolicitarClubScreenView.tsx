// SolicitarClubScreen — wizard de 5 steps + Submitted + Approved.
// State del draft de la card pública lift'eado a context para que el preview
// sticky se actualice en vivo mientras se llenan los inputs.
"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useEnabledSports } from "@/components/SportsProvider";
import type { Sport } from "@/lib/sports";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  addApplicationCourt,
  getApplicationDetail,
  removeApplicationCourt,
  submitApplication,
  updateApplication,
  updateApplicationCourt,
} from "@/server/actions/clubApplications";
import { switchRole } from "@/server/actions/auth";
import {
  uploadApplicationDocument,
  removeApplicationDocument,
  uploadApplicationPhoto,
  removeApplicationPhoto,
} from "@/server/actions/clubApplicationUploads";

type StepKey = 1 | 2 | 3 | 4 | 5;
type ViewMode = StepKey | "submitted" | "approved" | "rejected";

// ── Draft context: lo que el preview público necesita + persist ─────────
export type CourtDraft = {
  id: string; // UUID real de club_application_courts (o "tmp-..." si no persistido)
  name: string;
  surf: string;
  hours: string;
  price: number;
  lights: boolean;
  sport: string;
  surface: string | null;
  indoor: boolean;
};

export type OrgType = "private" | "public" | "concession";
export type ParkingType = "unknown" | "street" | "private" | "valet";
export type CancellationPolicy = "flexible_24h" | "moderate_48h" | "strict_7d";

// Mapa de horario por día. Cada día puede ser cerrado (null) o tener un
// rango HH:MM-HH:MM. Estructura simple para que persista como jsonb sin
// complicarse con franjas múltiples (eso es post-MVP).
export type WeeklyHours = {
  mon: { open: string; close: string } | null;
  tue: { open: string; close: string } | null;
  wed: { open: string; close: string } | null;
  thu: { open: string; close: string } | null;
  fri: { open: string; close: string } | null;
  sat: { open: string; close: string } | null;
  sun: { open: string; close: string } | null;
};

// Convención: la foto con ordinal=0 es la portada (hero). Las del 1-5
// son galería. Una sola cover por application; subir nueva reemplaza la
// anterior (remove + insert).
export type CoverPhoto = { id: string; previewUrl: string | null } | null;

export type ClubDraft = {
  applicationId: string | null;
  name: string;
  orgType: OrgType;
  sports: string[];
  description: string;
  accentColor: string;
  coverPhoto: CoverPhoto;
  locationCity: string;
  sector: string;
  province: string;
  country: string;
  address: string;
  referenceNote: string;
  parking: ParkingType;
  geoLat: number | null;
  geoLng: number | null;
  weeklyHours: WeeklyHours;
  cancellationPolicy: CancellationPolicy;
  legalName: string;
  taxId: string;
  foundedYear: number | null;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  websiteOrSocial: string;
  courts: CourtDraft[];
};

export type InitialDraft = ClubDraft;

type ClubDraftContextValue = {
  draft: ClubDraft;
  set: <K extends keyof ClubDraft>(key: K, value: ClubDraft[K]) => void;
  // Persist helpers
  saveStep1: () => Promise<boolean>;
  saveStep2: () => Promise<boolean>;
  saveStep3: () => Promise<boolean>;
  saveStep4: () => Promise<boolean>;
  addCourt: () => Promise<void>;
  updateCourt: (id: string, patch: Partial<CourtDraft>) => Promise<void>;
  removeCourt: (id: string) => Promise<void>;
  submit: () => Promise<boolean>;
  pending: boolean;
};

const EMPTY_WEEKLY_HOURS: WeeklyHours = {
  mon: { open: "06:00", close: "22:00" },
  tue: { open: "06:00", close: "22:00" },
  wed: { open: "06:00", close: "22:00" },
  thu: { open: "06:00", close: "22:00" },
  fri: { open: "06:00", close: "22:00" },
  sat: { open: "07:00", close: "22:00" },
  sun: { open: "07:00", close: "21:00" },
};

const EMPTY_DRAFT: ClubDraft = {
  applicationId: null,
  name: "",
  orgType: "public",
  sports: ["pickleball"],
  description: "",
  accentColor: "#10b981",
  coverPhoto: null,
  locationCity: "",
  sector: "",
  province: "",
  country: "Ecuador",
  address: "",
  referenceNote: "",
  parking: "unknown",
  geoLat: null,
  geoLng: null,
  weeklyHours: EMPTY_WEEKLY_HOURS,
  cancellationPolicy: "flexible_24h",
  legalName: "",
  taxId: "",
  foundedYear: null,
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  websiteOrSocial: "",
  courts: [],
};

import { formatActionError } from "@/lib/user-facing/errors";
import {
  getCitiesForProvince,
  getEcuadorProvinces,
  getSectorsForCity,
} from "@/lib/geo/ecuador-locations";

const ClubDraftCtx = createContext<ClubDraftContextValue | null>(null);

function useClubDraft(): ClubDraftContextValue {
  const v = useContext(ClubDraftCtx);
  if (!v) throw new Error("useClubDraft must be used inside ClubDraftProvider");
  return v;
}

function ClubDraftProvider({
  initial,
  children,
}: {
  initial: InitialDraft | null;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<ClubDraft>(initial ?? EMPTY_DRAFT);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const saveStep1 = async (): Promise<boolean> => {
    if (!draft.applicationId) return false;
    const sports =
      draft.sports.length > 0 ? draft.sports : (["pickleball"] as string[]);
    const r = await updateApplication({
      applicationId: draft.applicationId,
      patch: {
        step: 1,
        data: {
          name: draft.name,
          orgType: "public",
          sports,
          shortDescription: draft.description,
        },
      },
    });
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: formatActionError(r.error) });
      return false;
    }
    return true;
  };

  const saveStep2 = async (): Promise<boolean> => {
    if (!draft.applicationId) return false;
    if (!draft.address || draft.address.trim().length < 3) {
      toast({
        icon: "alert-triangle",
        title: "Dirección obligatoria",
        sub: "Mínimo 3 caracteres.",
      });
      return false;
    }
    if (!draft.sector || draft.sector.trim().length < 2) {
      toast({
        icon: "alert-triangle",
        title: "Parroquia o sector obligatorio",
        sub: "Elige una opción de la lista.",
      });
      return false;
    }
    if (!draft.locationCity || draft.locationCity.trim().length < 2) {
      toast({
        icon: "alert-triangle",
        title: "Ciudad obligatoria",
        sub: "Elige una ciudad de la lista.",
      });
      return false;
    }
    if (!draft.province || draft.province.trim().length < 2) {
      toast({
        icon: "alert-triangle",
        title: "Provincia obligatoria",
        sub: "Elige una provincia de la lista.",
      });
      return false;
    }
    // Solo enviamos lo que esté presente; Step2Schema es partial pero cada
    // campo, si va, debe cumplir su min.
    const data: Record<string, unknown> = {
      address: draft.address.trim(),
      district: draft.sector.trim(),
      parking: draft.parking,
    };
    if (draft.country && draft.country.trim().length > 0) {
      data.country = draft.country.trim();
    }
    if (draft.province && draft.province.trim().length > 0) {
      data.province = draft.province.trim();
    }
    if (draft.referenceNote && draft.referenceNote.trim().length > 0) {
      data.referenceNote = draft.referenceNote.trim();
    }
    if (draft.geoLat != null) data.geoLat = draft.geoLat;
    if (draft.geoLng != null) data.geoLng = draft.geoLng;
    const r = await updateApplication({
      applicationId: draft.applicationId,
      patch: { step: 2, data },
    });
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: formatActionError(r.error) });
      return false;
    }
    return true;
  };

  const saveStep3 = async (): Promise<boolean> => {
    if (!draft.applicationId) return false;
    const r = await updateApplication({
      applicationId: draft.applicationId,
      patch: {
        step: 3,
        data: {
          cancellationPolicy: draft.cancellationPolicy,
          weeklyHours: draft.weeklyHours as Record<string, unknown>,
        },
      },
    });
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: formatActionError(r.error) });
      return false;
    }
    return true;
  };

  const saveStep4 = async (): Promise<boolean> => {
    if (!draft.applicationId) return false;
    // Validación cliente: requeridos por el wizard. El backend acepta partial,
    // pero cada campo presente debe cumplir su formato.
    const legalName = draft.legalName.trim();
    const taxId = draft.taxId.trim();
    const contactPerson = draft.contactPerson.trim();
    const contactEmail = draft.contactEmail.trim();
    const contactPhone = draft.contactPhone.trim();
    if (legalName.length < 2) {
      toast({ icon: "alert-triangle", title: "Razón social requerida", sub: "Mínimo 2 caracteres." });
      return false;
    }
    if (taxId.length < 5) {
      toast({ icon: "alert-triangle", title: "RUC requerido", sub: "Mínimo 5 caracteres." });
      return false;
    }
    if (contactPerson.length < 2) {
      toast({ icon: "alert-triangle", title: "Persona de contacto requerida" });
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      toast({ icon: "alert-triangle", title: "Email inválido", sub: "Formato: nombre@dominio.com" });
      return false;
    }
    if (contactPhone.length < 7) {
      toast({ icon: "alert-triangle", title: "Celular inválido", sub: "Mínimo 7 dígitos." });
      return false;
    }
    // Construir payload sin campos vacíos opcionales.
    const data: Record<string, unknown> = {
      legalName,
      taxId,
      contactPerson,
      contactEmail,
      contactPhone,
    };
    if (draft.foundedYear != null) data.foundedYear = draft.foundedYear;
    const website = draft.websiteOrSocial.trim();
    if (website.length > 0) data.websiteOrSocial = website;
    const r = await updateApplication({
      applicationId: draft.applicationId,
      patch: { step: 1, data },
    });
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: formatActionError(r.error) });
      return false;
    }
    return true;
  };

  const addCourt = async () => {
    if (!draft.applicationId) return;
    const n = draft.courts.length + 1;
    const r = await addApplicationCourt({
      applicationId: draft.applicationId,
      data: {
        proposedCode: `Cancha ${n}`,
        sport: draft.sports[0] ?? "pickleball",
        surface: "Acrílica",
        indoor: false,
        lights: true,
        basePriceCents: 2400,
        currency: "USD",
      },
    });
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo agregar la cancha", sub: formatActionError(r.error) });
      return;
    }
    setDraft((d) => ({
      ...d,
      courts: [
        ...d.courts,
        {
          id: r.data.id,
          name: r.data.proposedCode,
          surf: [r.data.indoor ? "Indoor" : "Outdoor", r.data.surface ?? "—"].filter(Boolean).join(" · "),
          hours: "06:00 – 22:00",
          price: r.data.basePriceCents != null ? Math.round(r.data.basePriceCents / 100) : 24,
          lights: r.data.lights,
          sport: r.data.sport,
          surface: r.data.surface ?? null,
          indoor: r.data.indoor,
        },
      ],
    }));
  };

  const updateCourt = async (id: string, patch: Partial<CourtDraft>) => {
    if (!draft.applicationId) return;
    setDraft((d) => ({
      ...d,
      courts: d.courts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    const fullPatch: Record<string, unknown> = {};
    if (patch.price !== undefined) fullPatch.basePriceCents = patch.price * 100;
    if (patch.name !== undefined) fullPatch.proposedCode = patch.name;
    if (patch.lights !== undefined) fullPatch.lights = patch.lights;
    if (patch.indoor !== undefined) fullPatch.indoor = patch.indoor;
    if (patch.surface !== undefined) fullPatch.surface = patch.surface;
    if (Object.keys(fullPatch).length === 0) return;
    await updateApplicationCourt({
      applicationId: draft.applicationId,
      courtId: id,
      patch: fullPatch,
    });
  };

  const removeCourt = async (id: string) => {
    if (!draft.applicationId) return;
    if (draft.courts.length === 1) return;
    setDraft((d) => ({ ...d, courts: d.courts.filter((c) => c.id !== id) }));
    await removeApplicationCourt({ applicationId: draft.applicationId, courtId: id });
  };

  const submit = async (): Promise<boolean> => {
    if (!draft.applicationId) return false;
    const r = await submitApplication({
      applicationId: draft.applicationId,
      body: { termsAccepted: true },
    });
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "No se pudo enviar", sub: formatActionError(r.error) });
      return false;
    }
    toast({ icon: "send", title: "Solicitud enviada", sub: "Te contactamos en 48 h" });
    router.refresh();
    return true;
  };

  const wrap = <T,>(fn: () => Promise<T>) => () =>
    new Promise<T>((resolve) => startTransition(async () => resolve(await fn())));

  const value = useMemo<ClubDraftContextValue>(
    () => ({
      draft,
      set: (key, value) => setDraft((d) => ({ ...d, [key]: value })),
      saveStep1: wrap(saveStep1),
      saveStep2: wrap(saveStep2),
      saveStep3: wrap(saveStep3),
      saveStep4: wrap(saveStep4),
      addCourt: wrap(addCourt),
      updateCourt: (id, patch) => new Promise((resolve) => startTransition(async () => { await updateCourt(id, patch); resolve(); })),
      removeCourt: (id) => new Promise((resolve) => startTransition(async () => { await removeCourt(id); resolve(); })),
      submit: wrap(submit),
      pending,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, pending],
  );
  return <ClubDraftCtx.Provider value={value}>{children}</ClubDraftCtx.Provider>;
}

const STEPS: { k: StepKey; l: string; icon: string }[] = [
  { k: 1, l: "Identidad pública", icon: "eye" },
  { k: 2, l: "Ubicación", icon: "map-pin" },
  { k: 3, l: "Canchas y precios", icon: "square" },
  { k: 4, l: "Verificación legal", icon: "shield-check" },
  { k: 5, l: "Revisión", icon: "check-circle" },
];

const inp: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  width: "100%",
};

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#0a0a0a",
        }}
      >
        {label} {required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{hint}</div>}
    </div>
  );
}

function Stepper({ step }: { step: StepKey }) {
  const activeStep = STEPS.find((s) => s.k === step) ?? STEPS[0];

  return (
    <div className="mp-solicitar-club-stepper">
      <div className="mp-solicitar-club-stepper-compact">
        <div className="mp-solicitar-club-stepper-bar">
          {STEPS.map((s) => (
            <div
              key={s.k}
              className="mp-solicitar-club-stepper-segment"
              data-active={s.k <= step ? "true" : "false"}
            />
          ))}
        </div>
        <p className="mp-solicitar-club-stepper-caption">
          Paso {step} de {STEPS.length} · {activeStep.l}
        </p>
      </div>

      <div className="mp-solicitar-club-stepper-full">
        <div className="mp-solicitar-club-stepper-track">
          <div className="mp-solicitar-club-stepper-track-bg" />
          <div
            className="mp-solicitar-club-stepper-track-fill"
            style={{ width: `${((step - 1) / (STEPS.length - 1)) * 84}%` }}
          />
          {STEPS.map((s) => {
            const done = s.k < step;
            const active = s.k === step;
            return (
              <div key={s.k} className="mp-solicitar-club-stepper-node">
                <div
                  className="mp-solicitar-club-stepper-dot"
                  data-done={done ? "true" : "false"}
                  data-active={active ? "true" : "false"}
                >
                  <Icon
                    name={done ? "check" : s.icon}
                    size={14}
                    color={done || active ? "#fff" : "var(--muted-fg)"}
                  />
                </div>
                <div
                  className="mp-solicitar-club-stepper-label"
                  data-active={active ? "true" : "false"}
                >
                  {s.l}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Frame({
  step,
  statusLabel,
  statusColor,
  savedAt,
  children,
  footerNext = "Siguiente",
  onBack,
  onNext,
  nextDisabled,
}: {
  step: StepKey;
  statusLabel: string;
  statusColor: string;
  savedAt: string;
  children: ReactNode;
  footerNext?: string;
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div
      className="mp-solicitar-club-frame"
      style={{
        background: "#fafafa",
        alignItems: "start",
      }}
    >
      {/* Columna izquierda: título + form card (gana todo el ancho del form interno) */}
      <div className="mp-solicitar-club-main" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div className="mp-solicitar-club-intro">
          <div className="label-mp">Solicitar Club · Listing oficial</div>
          <h1 className="font-heading display-md mp-solicitar-club-title" style={{ margin: "6px 0 0" }}>
            Registra tu club <span className="dot">●</span>
          </h1>
          <p
            className="mp-solicitar-club-lead"
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: "var(--muted-fg)",
              maxWidth: 540,
            }}
          >
            Completa el formulario y nuestro equipo revisará tu solicitud en 48 horas. Una vez
            aprobado podrás gestionar reservas, eventos y pagos.
          </p>
        </div>

        <div className="card mp-solicitar-club-form-card" style={{ padding: 0, overflow: "hidden" }}>
          <Stepper step={step} />
          <div className="mp-solicitar-club-form-body" style={{ padding: 32 }}>{children}</div>
          <div
            className="mp-solicitar-club-footer"
            style={{
              padding: "18px 28px",
              borderTop: "1px solid var(--border)",
              background: "var(--muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={onBack}
              disabled={step === 1}
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                opacity: step === 1 ? 0.4 : 1,
                cursor: step === 1 ? "not-allowed" : "pointer",
              }}
            >
              <Icon name="arrow-left" size={13} />
              Atrás
            </button>
            <div className="mp-solicitar-club-footer-step" style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              Paso {step} / {STEPS.length}
            </div>
            <button
              onClick={onNext}
              className="btn btn-primary"
              disabled={nextDisabled}
              style={{
                opacity: nextDisabled ? 0.5 : 1,
                cursor: nextDisabled ? "not-allowed" : "pointer",
              }}
            >
              {footerNext}
              <Icon name="arrow-right" size={13} color="#fff" />
            </button>
          </div>
        </div>
      </div>

      {/* Rail derecho sticky: estado + preview consolidados */}
      <aside className="mp-solicitar-club-aside" style={{ position: "sticky", top: 88, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="label-mp" style={{ marginBottom: 4 }}>
            Estado
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: statusColor,
              letterSpacing: "-0.01em",
            }}
          >
            {statusLabel}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>
            Paso {step} de {STEPS.length} · {savedAt}
          </div>
        </div>
        <ClubCardPreview highlightStep={step} />
      </aside>
    </div>
  );
}

const SPORT_LABEL_PREVIEW: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

// Preview live del card público en /clubes. Lee el draft del context.
function ClubCardPreview({ highlightStep }: { highlightStep: StepKey }) {
  const { draft } = useClubDraft();

  const ringHero = highlightStep === 1 ? "0 0 0 3px var(--primary)" : "none";
  const ringLoc = highlightStep === 2 ? "0 0 0 2px var(--primary)" : "none";
  const ringStats = highlightStep === 3 ? "0 0 0 3px var(--primary)" : "none";

  const primarySportLabel = SPORT_LABEL_PREVIEW[draft.sports[0]] ?? "Multi";
  const minPrice = draft.courts.length > 0
    ? Math.min(...draft.courts.map((c) => c.price))
    : null;
  const heroGradient = `linear-gradient(135deg, #064e3b 0%, #047857 60%, ${draft.accentColor} 100%)`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="label-mp" style={{ color: "var(--primary)" }}>
        ● Preview en /clubes
      </div>
      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: ringHero,
          transition: "box-shadow 200ms",
        }}
      >
        <div
          style={{
            height: 140,
            background: heroGradient,
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "flex-end",
            padding: 14,
            transition: "background 200ms",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18), transparent 60%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              padding: "3px 9px",
              background: "rgba(255,255,255,0.25)",
              backdropFilter: "blur(6px)",
              borderRadius: 9999,
              fontSize: 9,
              fontWeight: 900,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            }}
          >
            {primarySportLabel}
          </div>
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              padding: "3px 9px",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
              borderRadius: 9999,
              fontSize: 9,
              fontWeight: 800,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
            Nuevo
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "32px 14px 10px",
              background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.65))",
              color: "#fff",
            }}
          >
            <div
              className="font-heading"
              style={{
                fontWeight: 900,
                fontSize: 15,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
                wordBreak: "break-word",
              }}
            >
              {draft.name || "Nombre del club"}
              <span style={{ color: draft.accentColor }}>.</span>
            </div>
          </div>
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: highlightStep === 2 ? "4px 8px" : "0",
              margin: highlightStep === 2 ? "-4px -8px" : "0",
              borderRadius: 8,
              boxShadow: ringLoc,
              transition: "all 200ms",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--muted-fg)" }}>
              <Icon name="map-pin" size={11} />
              {draft.sector || draft.locationCity || "—"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 800 }}>
              <Icon name="star" size={11} color="#d97706" />
              —
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 8,
              borderTop: "1px dashed var(--border)",
              boxShadow: ringStats,
              borderRadius: ringStats !== "none" ? 8 : 0,
              padding: ringStats !== "none" ? "8px" : "8px 0 0",
              margin: ringStats !== "none" ? "0 -8px -8px" : "0",
              transition: "all 200ms",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 9.5,
                  color: "var(--muted-fg)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  fontWeight: 800,
                }}
              >
                {draft.courts.length} {draft.courts.length === 1 ? "cancha" : "canchas"}
              </div>
              <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
                {minPrice != null ? `$${minPrice}` : "$—"}
                <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 600 }}> / hora</span>
              </div>
            </div>
            <span
              className="btn btn-primary"
              style={{ padding: "7px 12px", fontSize: 10.5, cursor: "default" }}
            >
              Reservar
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: 12,
          background: "var(--muted)",
          borderRadius: 10,
          fontSize: 11,
          color: "var(--muted-fg)",
          lineHeight: 1.5,
        }}
      >
        {highlightStep === 1 && (
          <>
            <b style={{ color: "var(--primary)" }}>● Hero</b>: nombre, deportes y color del accent se actualizan en vivo arriba.
          </>
        )}
        {highlightStep === 2 && (
          <>
            <b style={{ color: "var(--primary)" }}>● Ubicación</b>: el sector va a la pill izquierda del card.
          </>
        )}
        {highlightStep === 3 && (
          <>
            <b style={{ color: "var(--primary)" }}>● Stats</b>: # canchas y precio mínimo se actualizan al agregar/editar.
          </>
        )}
        {highlightStep === 4 && (
          <>
            <b style={{ color: "var(--primary)" }}>● Verificación legal</b> no afecta el card público. Solo MATCHPOINT lo ve.
          </>
        )}
        {highlightStep === 5 && (
          <>
            <b style={{ color: "var(--primary)" }}>● Listo</b>. Así se verá tu club en /clubes una vez aprobado.
          </>
        )}
      </div>
    </div>
  );
}

// ── Step 1 — Datos del club ─────────────────────────────────────────────
const ALL_SPORTS: { k: Sport; i: string; l: string }[] = [
  { k: "pickleball", i: "🏓", l: "Pickleball" },
  { k: "padel", i: "🎾", l: "Pádel" },
  { k: "tennis", i: "🎾", l: "Tenis" },
];

const ACCENT_COLORS = ["#10b981", "#fbbf24", "#dc2626", "#7c3aed", "#0ea5e9", "#f97316"];

function Step1({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  const { draft, set, saveStep1 } = useClubDraft();
  const toast = useToast();
  const { sports: enabledSports, single: singleSport } = useEnabledSports();
  const coverInput = useRef<HTMLInputElement | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const visibleSports = ALL_SPORTS.filter((s) => enabledSports.includes(s.k));

  useEffect(() => {
    if (draft.sports.length > 0) return;
    const fallback = enabledSports[0] ?? "pickleball";
    set("sports", [fallback]);
  }, [draft.sports.length, enabledSports, set]);

  useEffect(() => {
    if (draft.orgType === "public") return;
    set("orgType", "public");
  }, [draft.orgType, set]);

  const handleCoverUpload = async (file: File) => {
    if (!draft.applicationId) return;
    setCoverBusy(true);
    // Si ya hay cover, removerla antes de subir la nueva (ordinal=0 es único).
    if (draft.coverPhoto?.id) {
      await removeApplicationPhoto({ photoId: draft.coverPhoto.id });
    }
    const r = await uploadApplicationPhoto({
      applicationId: draft.applicationId,
      filename: file.name,
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
      ordinal: 0,
      file,
    });
    setCoverBusy(false);
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "Error al subir portada", sub: formatActionError(r.error) });
      return;
    }
    set("coverPhoto", { id: r.data.id, previewUrl: r.data.previewUrl ?? null });
  };

  const toggleSport = (k: string) => {
    if (draft.sports.includes(k)) {
      const next = draft.sports.filter((s) => s !== k);
      if (next.length === 0) return;
      set("sports", next);
    } else {
      set("sports", [...draft.sports, k]);
    }
  };

  const handleNext = async () => {
    const ok = await saveStep1();
    if (ok) onNext?.();
  };

  return (
    <Frame
      step={1}
      statusLabel="En progreso"
      statusColor="#d97706"
      savedAt="Iniciado hace 30 s"
      onBack={onBack}
      onNext={handleNext}
    >
      <div className="mp-solicitar-club-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Identidad pública<span className="dot">.</span>
          </h2>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted-fg)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Esto es lo que aparece en el hero de tu tarjeta en{" "}
            <Link
              href="/clubes"
              target="_blank"
              style={{
                color: "var(--primary)",
                fontWeight: 800,
                textDecoration: "none",
                borderBottom: "1px solid rgba(16,185,129,0.35)",
              }}
            >
              Clubes
            </Link>
            :
            nombre, deportes y una descripción corta.
          </p>
          <Field label="Nombre del club" required hint="Es el título grande del card">
            <input
              style={inp}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          {!singleSport && (
          <Field
            label="Deportes habilitados"
            required
            hint="Aparecen como pill en el card. Hoy MATCHPOINT está optimizado para Pickleball."
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {visibleSports.map((s) => {
                const on = draft.sports.includes(s.k);
                return (
                  <button
                    key={s.k}
                    onClick={() => toggleSport(s.k)}
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: 9999,
                      fontSize: 11.5,
                      fontWeight: 800,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      background: on ? "#ecfdf5" : "#fff",
                      color: "#0a0a0a",
                      border: "1.5px solid " + (on ? "var(--primary)" : "var(--border)"),
                    }}
                  >
                    <span>{s.i}</span>
                    {s.l}
                    {on && <Icon name="check" size={11} color="var(--primary)" />}
                  </button>
                );
              })}
            </div>
          </Field>
          )}
          <Field
            label="Descripción corta"
            hint="Máx 160 caracteres. Aparece en el detalle del club."
          >
            <textarea
              style={{ ...inp, minHeight: 70, resize: "vertical" }}
              value={draft.description}
              onChange={(e) => set("description", e.target.value.slice(0, 160))}
            />
          </Field>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field
            label="Foto de portada"
            required
            hint="Es el gradient/imagen detrás del nombre. 1600×900px ideal."
          >
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCoverUpload(f);
                e.target.value = "";
              }}
            />
            <div
              onClick={() => !coverBusy && coverInput.current?.click()}
              style={{
                aspectRatio: "16/9",
                background: draft.coverPhoto?.previewUrl
                  ? `center/cover no-repeat url("${draft.coverPhoto.previewUrl}")`
                  : "linear-gradient(135deg, #052e26 0%, #064e3b 52%, #0f766e 100%)",
                borderRadius: 12,
                border: draft.coverPhoto?.previewUrl ? "1px solid var(--border)" : "1px solid #99f6e4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                position: "relative",
                cursor: coverBusy ? "wait" : "pointer",
                overflow: "hidden",
                boxShadow: draft.coverPhoto?.previewUrl
                  ? "none"
                  : "inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 -44px 80px rgba(16,185,129,0.18)",
              }}
            >
              {!draft.coverPhoto?.previewUrl && (
                <>
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 10,
                      borderRadius: 9,
                      border: "1px dashed rgba(255,255,255,0.28)",
                      background: "radial-gradient(circle at 72% 22%, rgba(52,211,153,0.22), transparent 46%)",
                    }}
                  />
                  <div style={{ textAlign: "center", position: "relative" }}>
                  <Icon name="image-plus" size={32} color="#fff" />
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      marginTop: 8,
                    }}
                  >
                    {coverBusy ? "Subiendo…" : "Sube tu portada"}
                  </div>
                  <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 4 }}>
                    JPG, PNG o WEBP · máx 8 MB
                  </div>
                </div>
                </>
              )}
              {draft.coverPhoto?.previewUrl && !coverBusy && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-end",
                    padding: 12,
                    background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.4))",
                  }}
                >
                  <span
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Cambiar portada
                  </span>
                </div>
              )}
            </div>
          </Field>
          <Field label="Color de acento" hint="Pintará el dot decorativo del nombre y el gradient">
            <div style={{ display: "flex", gap: 8 }}>
              {ACCENT_COLORS.map((c) => {
                const on = draft.accentColor === c;
                return (
                  <button
                    key={c}
                    onClick={() => set("accentColor", c)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: c,
                      border: on ? "3px solid #0a0a0a" : "2px solid var(--border)",
                      cursor: "pointer",
                      boxShadow: on ? "0 0 0 2px #fff inset" : "none",
                    }}
                  />
                );
              })}
            </div>
          </Field>
        </div>
      </div>
    </Frame>
  );
}

// ── Step 2 — Ubicación ──────────────────────────────────────────────────
// Mapa de ubicación: Leaflet con OSM tiles (sin API key). Pin draggable
// + click en el mapa lo mueve. Setear geoLat/geoLng emite onChange al
// padre. Tiles de tile.openstreetmap.org bajo su Tile Usage Policy
// (atribución obligatoria, OK para low-traffic — para producción a
// escala migrar a Mapbox/Maptiler).
function LocationPicker({
  draft,
  set,
}: {
  draft: ClubDraft;
  set: <K extends keyof ClubDraft>(key: K, value: ClubDraft[K]) => void;
}) {
  const lat = draft.geoLat;
  const lng = draft.geoLng;
  const hasCoords = lat != null && lng != null;
  const mapRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<{ map: any; marker: any } | null>(null);

  // Inicializa Leaflet 1 sola vez al montar. Carga el CSS via <link>
  // injectado on-demand para no globalizarlo si nadie usa el wizard.
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    let cancelled = false;
    (async () => {
      // CSS de Leaflet (idempotente — el id evita duplicados).
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      // Arregla el bug clásico de iconos rotos con bundlers — apunta
      // a los PNGs del CDN.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const initLat = lat ?? -0.2061; // Quito centro por defecto
      const initLng = lng ?? -78.4359;
      const map = L.map(mapRef.current).setView([initLat, initLng], hasCoords ? 16 : 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([initLat, initLng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        set("geoLat", Number(ll.lat.toFixed(6)));
        set("geoLng", Number(ll.lng.toFixed(6)));
      });
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        set("geoLat", Number(e.latlng.lat.toFixed(6)));
        set("geoLng", Number(e.latlng.lng.toFixed(6)));
      });
      leafletRef.current = { map, marker };
    })();
    return () => {
      cancelled = true;
      if (leafletRef.current) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
    // Solo al montar — actualizaciones de lat/lng las sync el useEffect siguiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync externo (input numérico o geolocation) → mueve el marker.
  useEffect(() => {
    if (!leafletRef.current || lat == null || lng == null) return;
    const { map, marker } = leafletRef.current;
    const cur = marker.getLatLng();
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }
  }, [lat, lng]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("geoLat", Number(pos.coords.latitude.toFixed(6)));
        set("geoLng", Number(pos.coords.longitude.toFixed(6)));
      },
      () => {
        // Permiso denegado: silencioso, el user puede pegar manual.
      },
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        ref={mapRef}
        style={{
          height: 320,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "#f4f4f5",
        }}
      />
      <div className="mp-solicitar-club-grid-latlng" style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
        <input
          type="number"
          step="0.000001"
          placeholder="Latitud (-0.2061)"
          value={lat ?? ""}
          onChange={(e) => set("geoLat", e.target.value === "" ? null : Number(e.target.value))}
          style={{ ...inp, padding: "8px 10px", fontSize: 12 }}
        />
        <input
          type="number"
          step="0.000001"
          placeholder="Longitud (-78.4359)"
          value={lng ?? ""}
          onChange={(e) => set("geoLng", e.target.value === "" ? null : Number(e.target.value))}
          style={{ ...inp, padding: "8px 10px", fontSize: 12 }}
        />
        <button
          type="button"
          onClick={useMyLocation}
          style={{
            padding: "8px 12px",
            fontSize: 11,
            fontWeight: 800,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            background: "#0a0a0a",
            color: "#fff",
            border: 0,
            whiteSpace: "nowrap",
          }}
        >
          📍 Mi ubicación
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        {hasCoords
          ? "Pin guardado. Validaremos la dirección con campo en 24–48 h."
          : "Pega coordenadas desde Google Maps (clic derecho → copiar) o usa tu ubicación actual."}
      </div>
    </div>
  );
}

function Step2({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  const { draft, set, saveStep2 } = useClubDraft();
  const ecProvinces = getEcuadorProvinces();
  const cityOptions = getCitiesForProvince(draft.province);
  const sectorOptions = getSectorsForCity(draft.province, draft.locationCity);

  useEffect(() => {
    if (!draft.province || !draft.locationCity) return;
    const cities = getCitiesForProvince(draft.province);
    if (!cities.includes(draft.locationCity)) {
      set("locationCity", "");
      set("sector", "");
    }
  }, [draft.province, draft.locationCity, set]);

  useEffect(() => {
    if (!draft.province || !draft.locationCity || !draft.sector) return;
    const sectors = getSectorsForCity(draft.province, draft.locationCity);
    if (!sectors.includes(draft.sector)) {
      set("sector", "");
    }
  }, [draft.province, draft.locationCity, draft.sector, set]);

  const handleProvinceChange = (value: string) => {
    set("province", value);
    set("locationCity", "");
    set("sector", "");
    if (value) set("country", "Ecuador");
  };

  const handleCityChange = (value: string) => {
    set("locationCity", value);
    const sectors = getSectorsForCity(draft.province, value);
    set("sector", sectors.length === 1 ? sectors[0] : "");
  };

  const handleNext = async () => {
    const ok = await saveStep2();
    if (ok) onNext?.();
  };
  return (
    <Frame
      step={2}
      statusLabel="En progreso"
      statusColor="#d97706"
      savedAt="Guardado hace 2 min"
      onBack={onBack}
      onNext={handleNext}
    >
      <div
        className="mp-solicitar-club-grid-aside"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          gap: 32,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Ubicación del club<span className="dot">.</span>
          </h2>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted-fg)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Necesitamos esta información para mostrar tu club en los resultados de búsqueda y
            permitir reservas.
          </p>
          <Field label="Dirección" required>
            <input
              style={inp}
              value={draft.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Av. Interoceánica km 12, Local 4"
            />
          </Field>
          <div className="mp-solicitar-club-location-fields" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Provincia" required>
              <select
                style={inp}
                value={draft.province}
                onChange={(e) => handleProvinceChange(e.target.value)}
              >
                <option value="">— elige provincia —</option>
                {ecProvinces.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ciudad" required>
              <select
                style={{
                  ...inp,
                  opacity: draft.province ? 1 : 0.55,
                  cursor: draft.province ? "pointer" : "not-allowed",
                }}
                value={draft.locationCity}
                onChange={(e) => handleCityChange(e.target.value)}
                disabled={!draft.province}
              >
                <option value="">
                  {draft.province ? "— elige ciudad —" : "Elige provincia primero"}
                </option>
                {cityOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Parroquia / sector" required hint="Es la ubicación que ven los jugadores en el listado">
              <select
                style={{
                  ...inp,
                  opacity: draft.locationCity ? 1 : 0.55,
                  cursor: draft.locationCity ? "pointer" : "not-allowed",
                }}
                value={draft.sector}
                onChange={(e) => set("sector", e.target.value)}
                disabled={!draft.locationCity}
              >
                <option value="">
                  {draft.locationCity ? "— elige parroquia o sector —" : "Elige ciudad primero"}
                </option>
                {sectorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Referencia / esquina" hint="Ayuda a los jugadores a encontrarte rápido">
            <input
              style={inp}
              value={draft.referenceNote}
              onChange={(e) => set("referenceNote", e.target.value)}
              placeholder="Frente al Paseo San Francisco"
              maxLength={200}
            />
          </Field>
          <Field label="Estacionamientos">
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { l: "Sin info", v: "unknown" as const },
                { l: "Calle", v: "street" as const },
                { l: "Privado", v: "private" as const },
                { l: "Valet", v: "valet" as const },
              ].map((opt) => {
                const active = draft.parking === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => set("parking", opt.v)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: active ? "#0a0a0a" : "#fff",
                      color: active ? "#fff" : "#0a0a0a",
                      border: "1px solid " + (active ? "#0a0a0a" : "var(--border)"),
                    }}
                  >
                    {opt.l}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <LocationPicker draft={draft} set={set} />
          <div
            style={{
              padding: 14,
              background: "#ecfdf5",
              borderRadius: 10,
              display: "flex",
              gap: 10,
            }}
          >
            <Icon name="info" size={14} color="#065f46" />
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#065f46" }}>
                Verificación de ubicación
              </div>
              <div style={{ fontSize: 11, color: "#047857", marginTop: 2 }}>
                Validaremos la dirección con un equipo de campo en las próximas 24-48h.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ── Step 3 — Canchas ────────────────────────────────────────────────────
function Step3({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  const { draft, set, addCourt, updateCourt, removeCourt, saveStep3 } = useClubDraft();
  const courts = draft.courts;

  const updatePrice = (id: string, price: number) => {
    updateCourt(id, { price });
  };

  const handleNext = async () => {
    const ok = await saveStep3();
    if (ok) onNext?.();
  };

  return (
    <Frame
      step={3}
      statusLabel="En progreso"
      statusColor="#d97706"
      savedAt="Guardado hace 1 min"
      onBack={onBack}
      onNext={handleNext}
    >
      <div className="mp-solicitar-club-step3" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="mp-solicitar-club-step3-header">
          <div className="mp-solicitar-club-step3-intro">
            <h2
              className="font-heading mp-solicitar-club-step-title"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              Canchas y horarios<span className="dot">.</span>
            </h2>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--muted-fg)",
                margin: "6px 0 0",
                lineHeight: 1.5,
              }}
            >
              Define cuántas canchas registras, sus precios base y las horas activas. Podrás afinar
              tarifas dinámicas después.
            </p>
          </div>
          <button className="btn btn-primary mp-solicitar-club-step3-add" onClick={addCourt}>
            <Icon name="plus" size={13} color="#fff" />
            Agregar cancha
          </button>
        </div>

        <div
          className="mp-solicitar-club-grid-2"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          }}
        >
          {courts.map((c) => (
            <div key={c.id} className="card" style={{ padding: 16, position: "relative" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
                      {c.name}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        background: "#0a0a0a",
                        color: "#fff",
                        borderRadius: 4,
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: "0.1em",
                      }}
                    >
                      PICKLEBALL
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                    {c.surf}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                  <button
                    onClick={() => removeCourt(c.id)}
                    disabled={courts.length === 1}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "#fff",
                      cursor: courts.length === 1 ? "not-allowed" : "pointer",
                      opacity: courts.length === 1 ? 0.4 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="trash-2" size={12} />
                  </button>
                </div>
              </div>
              <div className="mp-solicitar-club-court-meta" style={{
                  display: "flex",
                  gap: 14,
                  fontSize: 11.5,
                  color: "var(--muted-fg)",
                  borderTop: "1px dashed var(--border)",
                  paddingTop: 10,
                  alignItems: "center",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="clock" size={11} />
                  {c.hours}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="dollar-sign" size={11} />$
                  <input
                    type="number"
                    min={1}
                    value={c.price}
                    onChange={(e) => updatePrice(c.id, Math.max(1, Number(e.target.value) || 0))}
                    style={{
                      width: 50,
                      padding: "2px 6px",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      outline: "none",
                    }}
                  />
                  /h
                </span>
                {c.lights && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--primary)",
                    }}
                  >
                    <Icon name="lightbulb" size={11} color="var(--primary)" />
                    Iluminada
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mp-solicitar-club-grid-aside"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 24,
            marginTop: 8,
          }}
        >
          <div>
            <div className="label-mp" style={{ marginBottom: 10 }}>
              Horario semanal por defecto
            </div>
            <div className="mp-table-scroll">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(
                [
                  { k: "mon", l: "Lunes" },
                  { k: "tue", l: "Martes" },
                  { k: "wed", l: "Miércoles" },
                  { k: "thu", l: "Jueves" },
                  { k: "fri", l: "Viernes" },
                  { k: "sat", l: "Sábado" },
                  { k: "sun", l: "Domingo" },
                ] as const
              ).map((d) => {
                const slot = draft.weeklyHours[d.k];
                const open = slot?.open ?? "06:00";
                const close = slot?.close ?? "22:00";
                const closed = slot == null;
                const updateDay = (next: { open: string; close: string } | null) => {
                  set("weeklyHours", { ...draft.weeklyHours, [d.k]: next });
                };
                return (
                  <div
                    key={d.k}
                    className="mp-table-row mp-solicitar-club-hours-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto",
                      gap: 8,
                      alignItems: "center",
                      padding: "6px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: closed ? "#fafafa" : "#fff",
                    }}
                  >
                    <div className="mp-solicitar-club-hours-day" style={{ fontSize: 12, fontWeight: 700, color: closed ? "var(--muted-fg)" : "#0a0a0a" }}>
                      {d.l}
                    </div>
                    <input
                      type="time"
                      className="mp-solicitar-club-hours-open"
                      value={open}
                      disabled={closed}
                      onChange={(e) => updateDay({ open: e.target.value, close })}
                      style={{
                        ...inp,
                        padding: "6px 8px",
                        fontSize: 12,
                        width: 100,
                        opacity: closed ? 0.5 : 1,
                      }}
                    />
                    <input
                      type="time"
                      className="mp-solicitar-club-hours-close"
                      value={close}
                      disabled={closed}
                      onChange={(e) => updateDay({ open, close: e.target.value })}
                      style={{
                        ...inp,
                        padding: "6px 8px",
                        fontSize: 12,
                        width: 100,
                        opacity: closed ? 0.5 : 1,
                      }}
                    />
                    <button
                      type="button"
                      className="mp-solicitar-club-hours-toggle"
                      onClick={() =>
                        updateDay(closed ? { open: "06:00", close: "22:00" } : null)
                      }
                      style={{
                        padding: "4px 10px",
                        fontSize: 10,
                        fontWeight: 800,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        background: closed ? "var(--primary)" : "#fff",
                        color: closed ? "#fff" : "#0a0a0a",
                        border: "1px solid " + (closed ? "var(--primary)" : "var(--border)"),
                      }}
                    >
                      {closed ? "Abrir" : "Cerrar"}
                    </button>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 10 }}>
              Política de cancelación
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { l: "Flexible · 24 h antes", v: "flexible_24h" as const },
                { l: "Moderada · 48 h antes", v: "moderate_48h" as const },
                { l: "Estricta · 7 días antes", v: "strict_7d" as const },
              ].map((o) => {
                const active = draft.cancellationPolicy === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => set("cancellationPolicy", o.v)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: active ? "#ecfdf5" : "#fff",
                      color: "#0a0a0a",
                      border:
                        "1.5px solid " + (active ? "var(--primary)" : "var(--border)"),
                      textAlign: "left",
                    }}
                  >
                    {o.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ── Step 4 — Verificación legal ─────────────────────────────────────────
type DocSlot = {
  kind: "tax_id_certificate" | "incorporation_act" | "land_use_permit";
  icon: string;
  label: string;
  hint: string;
};
const DOC_SLOTS: DocSlot[] = [
  { kind: "tax_id_certificate", icon: "building-2", label: "RUC actualizado", hint: "PDF o imagen, máx 8 MB" },
  { kind: "incorporation_act", icon: "file-text", label: "Acta constitutiva", hint: "PDF, máx 8 MB" },
  { kind: "land_use_permit", icon: "shield-check", label: "Certificado de uso de suelo", hint: "PDF o imagen, máx 8 MB" },
];

type UploadedDoc = { id: string; kind: string; filename: string | null; status: string };
type UploadedPhoto = { id: string; caption: string | null; ordinal: number };

function Step4({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  const { draft, set, saveStep4 } = useClubDraft();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [uploaded, setUploaded] = useState<{ docs: UploadedDoc[]; photos: UploadedPhoto[] }>(
    { docs: [], photos: [] },
  );
  const [busy, setBusy] = useState(false);
  const docInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const photoInput = useRef<HTMLInputElement | null>(null);

  // Cargar lo ya subido al montar.
  useEffect(() => {
    if (!draft.applicationId) return;
    let cancelled = false;
    (async () => {
      const r = await getApplicationDetail({ applicationId: draft.applicationId });
      if (cancelled || !r.ok) return;
      setUploaded({
        docs: r.data.documents.map((d) => ({
          id: d.id,
          kind: d.kind,
          filename: d.filename,
          status: d.status,
        })),
        photos: r.data.photos.map((p) => ({
          id: p.id,
          caption: p.caption,
          ordinal: p.ordinal,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.applicationId]);

  const handleNext = async () => {
    const ok = await saveStep4();
    if (ok) onNext?.();
  };

  const docByKind = new Map(uploaded.docs.map((d) => [d.kind, d]));
  const photoCount = uploaded.photos.length;

  const handleDocUpload = async (kind: DocSlot["kind"], file: File) => {
    if (!draft.applicationId) return;
    setBusy(true);
    const r = await uploadApplicationDocument({
      applicationId: draft.applicationId,
      kind,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      file,
    });
    setBusy(false);
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "Error al subir", sub: formatActionError(r.error) });
      return;
    }
    setUploaded((u) => {
      const others = u.docs.filter((d) => d.kind !== kind);
      return {
        ...u,
        docs: [...others, { id: r.data.id, kind, filename: r.data.filename, status: r.data.status }],
      };
    });
    toast({ icon: "check", title: `${file.name} subido` });
  };

  const handleDocRemove = async (documentId: string) => {
    const ok = await confirm({
      title: "Eliminar documento",
      body: "Esta acción es permanente.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await removeApplicationDocument({ documentId });
    setBusy(false);
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "Error", sub: formatActionError(r.error) });
      return;
    }
    setUploaded((u) => ({ ...u, docs: u.docs.filter((d) => d.id !== documentId) }));
  };

  const handlePhotoUpload = async (file: File) => {
    if (!draft.applicationId) return;
    if (photoCount >= 6) {
      toast({ icon: "alert-triangle", title: "Límite alcanzado", sub: "Máximo 6 fotos." });
      return;
    }
    setBusy(true);
    const r = await uploadApplicationPhoto({
      applicationId: draft.applicationId,
      filename: file.name,
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
      file,
    });
    setBusy(false);
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "Error al subir foto", sub: formatActionError(r.error) });
      return;
    }
    setUploaded((u) => ({
      ...u,
      photos: [...u.photos, { id: r.data.id, caption: r.data.caption, ordinal: r.data.ordinal }],
    }));
  };

  const handlePhotoRemove = async (photoId: string) => {
    const ok = await confirm({
      title: "Eliminar foto",
      body: "Esta acción es permanente.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await removeApplicationPhoto({ photoId });
    setBusy(false);
    if (!r.ok) {
      toast({ icon: "alert-triangle", title: "Error", sub: formatActionError(r.error) });
      return;
    }
    setUploaded((u) => ({ ...u, photos: u.photos.filter((p) => p.id !== photoId) }));
  };

  const onDropPhotos = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (photoCount + 1 > 6) break;
      await handlePhotoUpload(f);
    }
  };
  type DocStatusKey = "ok" | "partial" | "wait";
  const colors: Record<DocStatusKey, { bg: string; fg: string; border: string; label: string }> = {
    ok: { bg: "#ecfdf5", fg: "#065f46", border: "var(--primary)", label: "CARGADO" },
    partial: { bg: "#fef3c7", fg: "#92400e", border: "#fbbf24", label: "PARCIAL" },
    wait: { bg: "#fafafa", fg: "var(--muted-fg)", border: "var(--border)", label: "PENDIENTE" },
  };

  return (
    <Frame
      step={4}
      statusLabel="En progreso"
      statusColor="#d97706"
      savedAt="Guardado hace 30 s"
      onBack={onBack}
      onNext={handleNext}
    >
      <div className="mp-solicitar-club-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Verificación legal<span className="dot">.</span>
          </h2>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted-fg)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Datos legales + documentos. <b>No se muestran al público</b>, solo MATCHPOINT los usa para
            validar la operación.
          </p>

          {/* Legales (antes en Step 1) */}
          <Field label="Razón social" required>
            <input
              style={inp}
              value={draft.legalName}
              onChange={(e) => set("legalName", e.target.value)}
            />
          </Field>
          <div className="mp-solicitar-club-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="RUC" required>
              <input
                style={inp}
                value={draft.taxId}
                onChange={(e) => set("taxId", e.target.value)}
              />
            </Field>
            <Field label="Año de fundación">
              <input
                style={inp}
                value={draft.foundedYear ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  set("foundedYear", Number.isFinite(n) && n > 0 ? n : null);
                }}
              />
            </Field>
          </div>
          <Field label="Persona de contacto" required>
            <input
              style={inp}
              value={draft.contactPerson}
              onChange={(e) => set("contactPerson", e.target.value)}
            />
          </Field>
          <div className="mp-solicitar-club-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Email" required>
              <input
                style={inp}
                type="email"
                value={draft.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field label="Celular" required>
              <input
                style={inp}
                value={draft.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Sitio web / redes">
            <input
              style={inp}
              value={draft.websiteOrSocial}
              onChange={(e) => set("websiteOrSocial", e.target.value)}
            />
          </Field>

          <div className="label-mp" style={{ marginTop: 8 }}>Documentos requeridos</div>
          {DOC_SLOTS.map((slot) => {
            const existing = docByKind.get(slot.kind);
            const status: keyof typeof colors = existing
              ? existing.status === "approved"
                ? "ok"
                : existing.status === "rejected"
                  ? "wait"
                  : "partial"
              : "wait";
            const c = colors[status];
            return (
              <div
                key={slot.kind}
                style={{
                  padding: 14,
                  border: "1.5px solid " + c.border,
                  borderRadius: 10,
                  background: "#fff",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: c.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={slot.icon} size={16} color={c.fg} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{slot.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    {existing ? existing.filename : slot.hint}
                  </div>
                </div>
                <input
                  ref={(el) => {
                    docInputs.current[slot.kind] = el;
                  }}
                  type="file"
                  accept="application/pdf,image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleDocUpload(slot.kind, f);
                    e.target.value = "";
                  }}
                />
                <button
                  className="btn"
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    fontSize: 10.5,
                  }}
                  disabled={busy || !draft.applicationId}
                  onClick={() => docInputs.current[slot.kind]?.click()}
                >
                  {existing ? "Reemplazar" : "Subir"}
                </button>
                {existing && (
                  <button
                    className="btn"
                    style={{
                      background: "#fff",
                      border: "1px solid var(--border)",
                      fontSize: 10.5,
                      color: "#dc2626",
                    }}
                    disabled={busy}
                    onClick={() => handleDocRemove(existing.id)}
                    aria-label="Eliminar"
                    title="Eliminar"
                  >
                    <Icon name="x" size={11} color="#dc2626" />
                  </button>
                )}
              </div>
            );
          })}
          <div
            style={{
              padding: 14,
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Icon name="lock" size={14} color="var(--primary)" />
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800 }}>Privacidad</div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 2,
                }}
              >
                Solo los validadores de MATCHPOINT pueden acceder a estos archivos. No se comparten
                con jugadores.
              </div>
            </div>
          </div>
        </div>

        <div>
          <div
            className="label-mp"
            style={{ marginBottom: 10, display: "flex", justifyContent: "space-between" }}
          >
            <span>Galería del club</span>
            <span style={{ color: "var(--muted-fg)" }}>{photoCount} / 6</span>
          </div>
          <div className="mp-solicitar-club-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => {
              const photo = uploaded.photos[i];
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 10,
                    border: photo ? "1px solid var(--border)" : "1.5px dashed var(--border)",
                    background: photo ? "var(--primary)" : "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "hidden",
                    cursor: photo ? "default" : "pointer",
                  }}
                  onClick={() => !photo && photoInput.current?.click()}
                >
                  {photo ? (
                    <>
                      <Icon name="image" size={22} color="rgba(255,255,255,0.85)" />
                      <span
                        style={{
                          fontFamily: "Plus Jakarta Sans",
                          fontWeight: 900,
                          fontSize: 10,
                          color: "rgba(255,255,255,0.9)",
                          letterSpacing: "-0.01em",
                          position: "absolute",
                          bottom: 6,
                          left: 8,
                        }}
                      >
                        #{photo.ordinal + 1}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePhotoRemove(photo.id);
                        }}
                        disabled={busy}
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "rgba(10,10,10,0.6)",
                          border: 0,
                          color: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        aria-label="Eliminar foto"
                      >
                        <Icon name="x" size={11} color="#fff" />
                      </button>
                    </>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Icon name="upload" size={16} color="var(--muted-fg)" />
                      <span
                        style={{
                          fontSize: 9.5,
                          color: "var(--muted-fg)",
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Subir
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              onDropPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: "1.5px dashed var(--border)",
              borderRadius: 10,
              textAlign: "center",
              background: "#fafafa",
              cursor: "pointer",
              opacity: photoCount >= 6 || !draft.applicationId ? 0.5 : 1,
            }}
            onClick={() => photoCount < 6 && photoInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (photoCount >= 6) return;
              onDropPhotos(e.dataTransfer.files);
            }}
          >
            <Icon name="upload-cloud" size={18} color="var(--muted-fg)" />
            <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 4 }}>
              {photoCount >= 6
                ? "Galería llena (6 / 6)"
                : "Arrastra fotos o haz clic para subir"}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>
              JPG / PNG · máx 8 MB · mín 1280×720
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ── Step 5 — Revisión ───────────────────────────────────────────────────
function Step5({ onBack, onSubmit }: { onBack?: () => void; onSubmit?: () => void }) {
  const { draft, submit } = useClubDraft();
  const [accepted, setAccepted] = useState(false);
  const handleSubmit = async () => {
    if (!accepted) return;
    const ok = await submit();
    if (ok) onSubmit?.();
  };
  const prices = draft.courts.map((c) => c.price).filter((p) => p > 0);
  const priceRange =
    prices.length === 0
      ? "—"
      : prices.length === 1 || Math.min(...prices) === Math.max(...prices)
        ? `$${prices[0]} / h`
        : `$${Math.min(...prices)} – $${Math.max(...prices)} / h`;
  const surfacesCount = draft.courts.reduce<Record<string, number>>((acc, c) => {
    const k = c.surface ?? "—";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const surfacesLabel = Object.entries(surfacesCount)
    .map(([k, n]) => `${n} ${k.toLowerCase()}`)
    .join(" · ") || "—";

  const blocks: { l: string; items: [string, string][] }[] = [
    {
      l: "Identidad pública",
      items: [
        ["Nombre", draft.name || "—"],
        ["Deportes", draft.sports.join(", ") || "—"],
        ["Descripción", draft.description ? draft.description.slice(0, 40) + (draft.description.length > 40 ? "…" : "") : "—"],
      ],
    },
    {
      l: "Ubicación",
      items: [
        ["Dirección", draft.address || "—"],
        ["Sector", [draft.sector, draft.locationCity, draft.country].filter(Boolean).join(" · ") || "—"],
      ],
    },
    {
      l: "Canchas",
      items: [
        ["# canchas", `${draft.courts.length} ${draft.courts.length === 1 ? "cancha" : "canchas"}`],
        ["Superficies", surfacesLabel],
        ["Precio base", priceRange],
      ],
    },
    {
      l: "Verificación legal",
      items: [
        ["Razón social", draft.legalName || "—"],
        ["RUC", draft.taxId || "—"],
        ["Contacto", draft.contactPerson || "—"],
        ["Email", draft.contactEmail || "—"],
      ],
    },
  ];
  return (
    <Frame
      step={5}
      statusLabel="Lista para enviar"
      statusColor="#065f46"
      savedAt="Guardado hace 10 s"
      footerNext="Enviar solicitud"
      onBack={onBack}
      onNext={handleSubmit}
      nextDisabled={!accepted}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Revisión final<span className="dot">.</span>
          </h2>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted-fg)",
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
            Confirma que todo esté correcto. Tras enviar, el equipo de MATCHPOINT te contactará en
            48 h.
          </p>
        </div>

        <div className="mp-solicitar-club-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {blocks.map((b) => (
            <div key={b.l} className="card" style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div className="label-mp">{b.l}</div>
                <button
                  style={{
                    background: "transparent",
                    border: 0,
                    fontSize: 10.5,
                    fontWeight: 900,
                    color: "var(--primary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    cursor: "pointer",
                  }}
                >
                  Editar
                </button>
              </div>
              {b.items.map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    fontSize: 12,
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <span style={{ color: "var(--muted-fg)" }}>{k}</span>
                  <span style={{ fontWeight: 800 }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: 16,
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 12,
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "#10b981" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>
              Acepto los Términos del Programa Clubes y la comisión por reserva (10%)
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "rgba(255,255,255,0.6)",
                marginTop: 2,
              }}
            >
              Sin pagos por adelantado. Cobramos solo cuando un jugador reserva una cancha tuya.
            </div>
          </div>
          <button
            onClick={handleSubmit}
            className="btn btn-primary"
            disabled={!accepted}
            style={{ opacity: accepted ? 1 : 0.5, cursor: accepted ? "pointer" : "not-allowed" }}
          >
            <Icon name="send" size={13} color="#fff" />
            Enviar solicitud
          </button>
        </div>
      </div>
    </Frame>
  );
}

// ── Submitted (en revisión) ─────────────────────────────────────────────
// Timeline derivado del status real + timestamps de la application.
// El "current" se mueve a medida que el admin avanza el pipeline.
function SubmittedView({
  review,
  applicationId,
}: {
  review: ApplicationReviewState;
  applicationId: string | null;
}) {
  const shortId = review.applicationCode || (
    applicationId ? `SC-${applicationId.slice(0, 8).toUpperCase()}` : "SC-—"
  );
  const phoneLabel = review.contactPhone?.trim() || "el teléfono que dejaste";
  const timeline = buildReviewTimeline(review);

  const handleDownload = () => {
    // Comprobante simple en JSON. Sustitución futura: PDF con plantilla legal.
    const payload = {
      code: shortId,
      status: review.status,
      submittedAt: review.submittedAt,
      reviewStartedAt: review.reviewStartedAt,
      approvedAt: review.approvedAt,
      rejectedAt: review.rejectedAt,
      reviewerNotes: review.reviewerNotes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprobante-${shortId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div style={{ background: "#fafafa" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden", maxWidth: 760 }}>
        <div
          style={{
            padding: "28px 32px",
            background:
              "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
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
              pointerEvents: "none",
            }}
          >
            CLUB
          </div>
          <div style={{ position: "relative" }}>
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
                marginBottom: 14,
              }}
            >
              <Icon name="check-check" size={28} color="#fff" />
            </div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
              Solicitud #{shortId}
            </div>
            <h2
              className="font-heading"
              style={{
                fontSize: 30,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                margin: "6px 0 0",
              }}
            >
              Solicitud recibida<span style={{ color: "#fbbf24" }}>.</span>
            </h2>
            <p
              style={{
                fontSize: 13.5,
                color: "rgba(255,255,255,0.85)",
                margin: "10px 0 0",
                maxWidth: 480,
              }}
            >
              Gracias por sumarte. Tu solicitud está en revisión y un agente de MATCHPOINT se
              contactará al <b>{phoneLabel}</b> en menos de 48 horas.
            </p>
          </div>
        </div>

        <div style={{ padding: "24px 32px" }}>
          <div className="label-mp" style={{ marginBottom: 14 }}>
            Próximos pasos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {timeline.map((t, i) => (
              <div key={t.l} style={{ display: "flex", gap: 14, position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background:
                        t.s === "done"
                          ? "var(--primary)"
                          : t.s === "now"
                            ? "#0a0a0a"
                            : "#fff",
                      color: t.s === "wait" ? "var(--muted-fg)" : "#fff",
                      border: t.s === "wait" ? "1.5px solid var(--border)" : 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {t.s === "done" ? <Icon name="check" size={12} color="#fff" /> : i + 1}
                  </div>
                  {i < timeline.length - 1 && (
                    <div
                      style={{
                        width: 2,
                        flex: 1,
                        background: t.s === "done" ? "var(--primary)" : "var(--border)",
                        minHeight: 24,
                      }}
                    />
                  )}
                </div>
                <div style={{ paddingBottom: 18, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.l}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                    {t.sub}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {review.reviewerNotes && (
          <div
            style={{
              padding: "16px 32px",
              borderTop: "1px solid var(--border)",
              background: "#fffbeb",
              borderLeft: "4px solid #f59e0b",
            }}
          >
            <div
              className="label-mp"
              style={{ color: "#92400e", marginBottom: 6 }}
            >
              Nota del revisor
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "#78350f",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {review.reviewerNotes}
            </p>
          </div>
        )}

        <div
          style={{
            padding: "18px 28px",
            borderTop: "1px solid var(--border)",
            background: "var(--muted)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={handleDownload}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            <Icon name="download" size={13} />
            Descargar comprobante
          </button>
        </div>
      </div>
    </div>
  );
}

// Mappea status + timestamps al timeline visual de 4 pasos.
// Done = ya pasó, Now = paso actual, Wait = aún no llegó.
function buildReviewTimeline(review: ApplicationReviewState): {
  l: string;
  sub: string;
  s: "done" | "now" | "wait";
}[] {
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("es-EC", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Pendiente";
  const s = review.status;
  const reachedDocs = ["docs_review", "field_verification", "final_review", "approved"].includes(s);
  const reachedField = ["field_verification", "final_review", "approved"].includes(s);
  const reachedFinal = ["final_review", "approved"].includes(s);
  const approved = s === "approved";
  return [
    {
      l: "Solicitud enviada",
      sub: review.submittedAt ? fmt(review.submittedAt) : "Pendiente",
      s: "done",
    },
    {
      l: "Validación documental",
      sub: reachedDocs
        ? review.reviewStartedAt
          ? `Iniciada ${fmt(review.reviewStartedAt)}`
          : "Completada"
        : s === "submitted"
          ? "En cola · 24h"
          : "—",
      s: reachedField ? "done" : s === "docs_review" ? "now" : "wait",
    },
    {
      l: "Verificación de campo",
      sub: reachedField ? "Completada" : s === "field_verification" ? "En curso" : "Próximo · 24-48h",
      s: reachedFinal ? "done" : s === "field_verification" ? "now" : "wait",
    },
    {
      l: "Aprobación final",
      sub: approved ? `Aprobada ${fmt(review.approvedAt)}` : s === "final_review" ? "En curso" : "Próximo · 12h",
      s: approved ? "done" : s === "final_review" ? "now" : "wait",
    },
  ];
}

// ── Rejected ────────────────────────────────────────────────────────────
// Muestra motivo del rechazo + notas + CTA para abrir nueva aplicación
// (la primera vez que recarga después de un rejected, el server creará un draft nuevo).
function RejectedView({ review }: { review: ApplicationReviewState }) {
  const router = useRouter();
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("es-EC", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";
  return (
    <div style={{ background: "#fafafa" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden", maxWidth: 760 }}>
        <div
          style={{
            padding: "28px 32px",
            background: "linear-gradient(135deg,#0a0a0a 0%,#7f1d1d 60%,#dc2626 100%)",
            color: "#fff",
          }}
        >
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
              marginBottom: 14,
            }}
          >
            <Icon name="x-circle" size={28} color="#fff" />
          </div>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
            Solicitud {review.applicationCode}
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "6px 0 0",
            }}
          >
            No fue aprobada<span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.85)", margin: "10px 0 0" }}>
            Rechazada el {fmt(review.rejectedAt)}.
          </p>
        </div>

        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {review.rejectionReason ? (
            <div
              style={{
                padding: 16,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 12,
              }}
            >
              <div className="label-mp" style={{ color: "#b91c1c", marginBottom: 6 }}>
                Motivo del rechazo
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#7f1d1d",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {review.rejectionReason}
              </p>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              El equipo no incluyó un motivo específico. Contacta soporte para más detalle.
            </div>
          )}
          {review.reviewerNotes && (
            <div
              style={{
                padding: 16,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 12,
              }}
            >
              <div className="label-mp" style={{ color: "#92400e", marginBottom: 6 }}>
                Notas del revisor
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#78350f",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {review.reviewerNotes}
              </p>
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
            Puedes corregir lo que indica el revisor y enviar una solicitud nueva. Conserva
            tu información — el sistema te dejará empezar otra desde cero.
          </div>
        </div>

        <div
          style={{
            padding: "18px 28px",
            borderTop: "1px solid var(--border)",
            background: "var(--muted)",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Link
            href="/dashboard/user"
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)", textDecoration: "none" }}
          >
            Volver al inicio
          </Link>
          <button
            onClick={() => router.refresh()}
            className="btn btn-primary"
          >
            <Icon name="rotate-ccw" size={13} color="#fff" />
            Empezar nueva solicitud
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Approved ────────────────────────────────────────────────────────────
function ApprovedView({ club }: { club: ApprovedClubSummary | null }) {
  const router = useRouter();
  const toast = useToast();
  const [switching, startSwitch] = useTransition();
  const clubName = club?.name ?? "Tu club";

  const handleEnterPortal = () => {
    if (!club) {
      toast({ icon: "alert-triangle", title: "Club no encontrado", sub: "Recarga la página." });
      return;
    }
    startSwitch(async () => {
      const r = await switchRole({ role: "owner", clubId: club.id });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "Error al cambiar de rol", sub: formatActionError(r.error) });
        return;
      }
      router.push("/dashboard/owner");
      router.refresh();
    });
  };

  return (
    <div style={{ background: "#fafafa" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden", maxWidth: 760 }}>
        <div
          style={{
            position: "relative",
            height: 220,
            overflow: "hidden",
            background: "#0a0a0a",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 70% 60%, rgba(16,185,129,0.4), transparent 70%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: "28px 32px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              color: "#fff",
            }}
          >
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● MATCHPOINT · Bienvenida
            </div>
            <h2
              className="font-heading"
              style={{
                fontSize: 36,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                margin: "8px 0 0",
              }}
            >
              Aprobado<span style={{ color: "var(--primary)" }}>.</span>
            </h2>
            <p
              style={{
                fontSize: 13.5,
                color: "rgba(255,255,255,0.85)",
                margin: "8px 0 0",
              }}
            >
              {clubName} ya forma parte del directorio oficial. Tu portal está listo.
            </p>
          </div>
          <div
            style={{
              position: "absolute",
              top: 28,
              right: 32,
              padding: "6px 12px",
              borderRadius: 9999,
              background: "rgba(16,185,129,0.18)",
              color: "#34d399",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              border: "1px solid rgba(52,211,153,0.4)",
            }}
          >
            ● Activo
          </div>
        </div>

        <ApprovedChecklist club={club} />

        <div
          className="mp-solicitar-club-grid-3"
          style={{
            padding: "0 24px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {[
            {
              i: "calendar-check",
              l: "Gestiona reservas",
              sub: "Calendario, bloqueos y disponibilidad",
              href: "/dashboard/owner/club-reservas",
            },
            {
              i: "banknote",
              l: "Finanzas",
              sub: "Ingresos, payouts y comisiones",
              href: "/dashboard/owner/club-finanzas",
            },
            {
              i: "megaphone",
              l: "Marketing",
              sub: "Crea campañas y promociones",
              href: "/dashboard/owner/club-marketing",
            },
          ].map((o) => (
            <a
              key={o.l}
              href={o.href}
              className="card"
              style={{ padding: 16, textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#ecfdf5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Icon name={o.i} size={16} color="var(--primary)" />
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em" }}
              >
                {o.l}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4 }}>
                {o.sub}
              </div>
            </a>
          ))}
        </div>

        {club && <SharePublicLink slug={club.slug} name={club.name} />}

        <div
          style={{
            padding: "18px 28px",
            borderTop: "1px solid var(--border)",
            background: "var(--muted)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {club ? (
            <a
              href={`/clubes/${club.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              <Icon name="external-link" size={12} />
              Ver perfil público
            </a>
          ) : (
            <button
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                opacity: 0.5,
                cursor: "not-allowed",
              }}
              disabled
            >
              Ver perfil público
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleEnterPortal}
            disabled={switching || !club}
          >
            {switching ? "Cambiando…" : "Entrar al portal del club"}
            <Icon name="arrow-right" size={13} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ApprovedChecklist ──────────────────────────────────────────────────
// Muestra los 4 ítems operativos que el owner debería completar para tener
// el portal listo. Lee snapshot del server (no fetcheamos en client).
function ApprovedChecklist({ club }: { club: ApprovedClubSummary | null }) {
  if (!club) return null;
  const items = [
    {
      ok: club.checklist.hasCourts,
      label: "Crea tus canchas",
      sub: "Sin canchas, no aceptas reservas.",
      href: "/dashboard/owner/club-canchas",
    },
    {
      ok: club.checklist.hasPricing,
      label: "Define tarifas",
      sub: "Precios por cancha y franja horaria.",
      href: "/dashboard/owner/club-canchas",
    },
    {
      ok: club.checklist.hasLogo,
      label: "Sube tu logo",
      sub: "Aparece en cards y tickets.",
      href: "/dashboard/owner/club-config",
    },
    {
      ok: club.checklist.hasCover,
      label: "Sube tu cover",
      sub: "Banner del perfil público del club.",
      href: "/dashboard/owner/club-config",
    },
  ];
  const completed = items.filter((i) => i.ok).length;
  const pct = Math.round((completed / items.length) * 100);
  return (
    <div style={{ padding: "20px 24px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div className="label-mp">Checklist del portal</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)" }}>
          {completed}/{items.length} · {pct}%
        </div>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--muted)",
          borderRadius: 9999,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct === 100 ? "var(--primary)" : "#fbbf24",
            transition: "width 200ms",
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => (
          <a
            key={it.label}
            href={it.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
              background: it.ok ? "#ecfdf5" : "#fff",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: it.ok ? "var(--primary)" : "var(--muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {it.ok && <Icon name="check" size={12} color="#fff" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{it.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{it.sub}</div>
            </div>
            <Icon name="arrow-right" size={13} color="var(--muted-fg)" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ── SharePublicLink ────────────────────────────────────────────────────
// Link público del club + QR (vía api.qrserver.com — ya usado en TeamInvite).
function SharePublicLink({ slug, name }: { slug: string; name: string }) {
  const toast = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/clubes/${slug}`
      : `/clubes/${slug}`;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({ icon: "check", title: "Link copiado" });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar" });
    }
  };
  return (
    <div style={{ padding: "0 24px 20px" }}>
      <div className="label-mp" style={{ marginBottom: 10 }}>
        Comparte tu club
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--muted)",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "monospace",
            fontSize: 12.5,
            color: "#0a0a0a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {publicUrl}
        </div>
        <button onClick={handleCopy} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
          <Icon name="copy" size={12} />
          Copiar
        </button>
        <button onClick={() => setQrOpen(true)} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
          <Icon name="qr-code" size={12} />
          QR
        </button>
      </div>
      {qrOpen && <QrShareOverlay name={name} url={publicUrl} onClose={() => setQrOpen(false)} />}
    </div>
  );
}

function QrShareOverlay({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(url)}`;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div className="label-mp" style={{ marginBottom: 6 }}>
          Escanea para ver el club
        </div>
        <h3
          className="font-heading"
          style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
        >
          {name}
        </h3>
        <div style={{ margin: "16px auto", width: 260, height: 260, background: "var(--muted)", borderRadius: 12, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt={`QR de ${name}`} width={260} height={260} />
        </div>
        <button onClick={onClose} className="btn" style={{ background: "#0a0a0a", color: "#fff", width: "100%" }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────
export type AppStatus =
  | "none"
  | "draft"
  | "submitted"
  | "docs_review"
  | "field_verification"
  | "final_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export type ApprovedClubSummary = {
  id: string;
  slug: string;
  name: string;
  checklist: ClubOnboardingChecklist;
};

// Snapshot del progreso post-aprobación. Cada flag indica si el club ya
// completó ese ítem operativo. El user lo ve como checklist en ApprovedView.
export type ClubOnboardingChecklist = {
  hasCourts: boolean;
  hasPricing: boolean;
  hasLogo: boolean;
  hasCover: boolean;
};

// Snapshot del estado de revisión (Submitted/Rejected). Sustituye al timeline
// hardcoded por una proyección del status real + timestamps + notas del revisor.
export type ApplicationReviewState = {
  applicationCode: string;
  status: AppStatus;
  submittedAt: string | null;
  reviewStartedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  reviewerNotes: string | null;
  contactPhone: string | null;
};

export function SolicitarClubScreenView({
  status,
  initial,
  approvedClub,
  review,
}: {
  status: AppStatus;
  initial: InitialDraft | null;
  approvedClub: ApprovedClubSummary | null;
  review: ApplicationReviewState | null;
}) {
  // Realtime: cualquier cambio en mi application (RLS limita rows).
  useRealtimeRefresh([{ table: "club_applications" }]);

  const inReview = ["submitted", "docs_review", "field_verification", "final_review"].includes(status);
  const initialView: ViewMode = status === "approved"
    ? "approved"
    : status === "rejected"
      ? "rejected"
      : inReview
        ? "submitted"
        : 1;
  const [view, setView] = useState<ViewMode>(initialView);

  const go = (v: ViewMode) => setView(v);
  const back = () => {
    if (typeof view === "number" && view > 1) setView((view - 1) as StepKey);
  };
  const next = () => {
    if (typeof view === "number" && view < 5) setView((view + 1) as StepKey);
  };

  if (view === "submitted" && review)
    return <SubmittedView review={review} applicationId={initial?.applicationId ?? null} />;
  if (view === "rejected" && review) return <RejectedView review={review} />;
  if (view === "approved") return <ApprovedView club={approvedClub} />;

  return (
    <ClubDraftProvider initial={initial}>
      {view === 1 && <Step1 onBack={back} onNext={next} />}
      {view === 2 && <Step2 onBack={back} onNext={next} />}
      {view === 3 && <Step3 onBack={back} onNext={next} />}
      {view === 4 && <Step4 onBack={back} onNext={next} />}
      {view === 5 && <Step5 onBack={back} onSubmit={() => go("submitted")} />}
    </ClubDraftProvider>
  );
}
