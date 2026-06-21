// CrearEventoModal — migrado 1:1 desde ui_kits/dashboard/CrearEventoModal.jsx
// Wizard 4 pasos (Tipo → Básicos → Cupos+Premios → Publicar). Escucha 'mp-open-crear-evento'
// con CustomEvent.detail = { clubId, clubName? } para resolver la sede.
"use client";
import { useEffect, useState, useTransition, useCallback, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MprRangeSlider } from "@/components/dashboard/partner/CategoriesPanel";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { createEvent, createClubTournament, publishEvent, getCreateEventTypeCounts } from "@/server/actions/events";
import { DEFAULT_GROUP_PLAYOFF_CONFIG } from "@/lib/schemas/tournaments";
import { formatActionError } from "@/lib/user-facing/errors";
import {
  readCreateEventWizardDraft,
  writeCreateEventWizardDraft,
  clearCreateEventWizardDraft,
  createEventWizardDraftHasProgress,
  type CreateEventTypeCounts,
} from "@/lib/events/create-event-wizard";
import {
  EVENT_LEVEL_OPTIONS,
  GENDER_OPTIONS,
  CATEGORY_MODALITY_OPTIONS,
  emptyTournamentCategory,
  patchTournamentCategoryDraft,
  categoryDraftsToCreatePayload,
  categoryDraftCupoLabel,
  totalCategoryTeams,
  validateTournamentCategoryDrafts,
  categoryDraftSummary,
  clubEventFormatToTournament,
  clampMpr,
  mprPresetRange,
  normalizeTournamentCategoryDraft,
  categoryDraftMprRange,
  formatMprRange,
  type TournamentCategoryDraft,
} from "@/lib/tournaments/event-level-categories";

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
  categoryLevels: string[];
  categories: TournamentCategoryDraft[];
  desc: string;
  slots: number;
  fee: number;
  paymentPolicy: PaymentPolicy;
  prize: number;
  prizeDetails: string[];
  prizeShares: number[];
  waitlist: boolean;
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

const PRIZE_PLACE_LABELS = ["1°", "2°", "3°"] as const;

const DEFAULT_PRIZE_SHARES = [50, 30, 20];

const DEFAULT_PRIZE_DETAILS = [
  "Trofeo + kit Wilson · gold",
  "Medalla + kit",
  "Medalla",
];

const INITIAL: Form = {
  type: "torneo",
  sport: "pickleball",
  name: "",
  start: defaultDateTime(7),
  end: defaultDateTime(9),
  clubId: null,
  venue: "",
  format: "",
  categoryLevels: ["3.0"],
  categories: [emptyTournamentCategory()],
  desc: "",
  slots: 16,
  fee: 0,
  paymentPolicy: "prepay",
  prize: 0,
  prizeDetails: [...DEFAULT_PRIZE_DETAILS],
  prizeShares: [...DEFAULT_PRIZE_SHARES],
  waitlist: true,
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

type CrearEventoOpenDetail = {
  clubId?: string | null;
  clubName?: string | null;
  role?: RoleKey;
  contextLabel?: string | null;
};

function roleFromPathname(pathname: string): RoleKey {
  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  const key = match?.[1];
  if (key && key in MP_ROLES) return key as RoleKey;
  return "user";
}

function headerBadgeText(
  role: RoleKey,
  venue: string,
  detail?: CrearEventoOpenDetail | null,
): string | null {
  if (role === "user") return null;
  const badge = MP_ROLES[role]?.badge;
  if (!badge) return null;
  const raw =
    venue.trim() ||
    detail?.clubName?.trim() ||
    detail?.contextLabel?.trim() ||
    "";
  if (!raw) return badge;
  const place = raw.includes(" · ") ? raw.split(" · ")[0]!.trim() : raw;
  return `${badge} · ${place}`;
}

export function CrearEventoModal() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pub, setPub] = useState<
    | false
    | { id: string; slug: string; kind: "event" | "tournament" }
  >(false);
  const [form, setForm] = useState<Form>(INITIAL);
  const [openDetail, setOpenDetail] = useState<CrearEventoOpenDetail | null>(null);
  const [openRole, setOpenRole] = useState<RoleKey>("owner");
  const [typeCounts, setTypeCounts] = useState<CreateEventTypeCounts | null>(null);
  const [typeCountsLoading, setTypeCountsLoading] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const contextBadge = headerBadgeText(openRole, form.venue, openDetail);

  const handleClose = useCallback(() => {
    if (pub) {
      clearCreateEventWizardDraft(form.clubId);
      setDraftSavedAt(null);
      setOpen(false);
      return;
    }
    if (createEventWizardDraftHasProgress(form, step)) {
      const ok = writeCreateEventWizardDraft(form.clubId, step, form);
      if (ok) setDraftSavedAt(new Date().toISOString());
      toast({
        icon: "save",
        title: "Borrador guardado",
        sub: "Lo retomas al volver a abrir Crear evento.",
      });
    } else {
      clearCreateEventWizardDraft(form.clubId);
      setDraftSavedAt(null);
    }
    setOpen(false);
  }, [form, step, pub, toast]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CrearEventoOpenDetail>).detail;
      const role = detail?.role ?? roleFromPathname(pathname);
      const clubId = detail?.clubId ?? null;
      const venue =
        detail?.clubName?.trim() ||
        detail?.contextLabel?.split(" · ")[0]?.trim() ||
        "";
      const draft = readCreateEventWizardDraft(clubId);

      setOpenDetail(detail ?? null);
      setOpenRole(role);
      setOpen(true);
      setPub(false);

      if (draft) {
        setForm({
          ...INITIAL,
          ...draft.form,
          clubId,
          venue: venue || draft.form.venue,
          categories: draft.form.categories.map(normalizeTournamentCategoryDraft),
        });
        setStep(Math.min(Math.max(0, draft.step), STEPS.length - 1));
        setDraftSavedAt(draft.savedAt);
        if (createEventWizardDraftHasProgress(draft.form, draft.step)) {
          toast({
            icon: "save",
            title: "Borrador recuperado",
            sub: "Continúa donde lo dejaste.",
          });
        }
      } else {
        setForm({
          ...INITIAL,
          clubId,
          venue,
        });
        setStep(0);
        setDraftSavedAt(null);
      }
    };
    window.addEventListener("mp-open-crear-evento", handler);
    return () => window.removeEventListener("mp-open-crear-evento", handler);
  }, [pathname, toast]);

  useEffect(() => {
    if (!open || pub) return;
    if (!createEventWizardDraftHasProgress(form, step)) return;
    const timer = window.setTimeout(() => {
      const ok = writeCreateEventWizardDraft(form.clubId, step, form);
      if (ok) setDraftSavedAt(new Date().toISOString());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [open, pub, step, form]);

  useEffect(() => {
    if (!open || pub) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pub, handleClose]);

  useEffect(() => {
    if (!open || !form.clubId) {
      setTypeCounts(null);
      setTypeCountsLoading(false);
      return;
    }
    let cancelled = false;
    setTypeCountsLoading(true);
    void getCreateEventTypeCounts({ clubId: form.clubId }).then((res) => {
      if (cancelled) return;
      setTypeCountsLoading(false);
      setTypeCounts(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, form.clubId]);

  if (!open) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const isCompetitive = form.type === "torneo" || form.type === "liga";
  const bracketTeams = isCompetitive ? totalCategoryTeams(form.categories) : form.slots;

  const validate = (): string | null => {
    if (!form.clubId) return "Falta el club anfitrión. Abre el modal desde la pantalla del club.";
    if (form.name.trim().length < 2) return "El nombre del evento es obligatorio.";
    if (!form.start || !form.end) return "Las fechas son obligatorias.";
    const s = new Date(form.start);
    const e = new Date(form.end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return "Fechas inválidas.";
    if (e <= s) return "La fecha de fin debe ser posterior a la de inicio.";
    if (isCompetitive) {
      if (!form.format.trim()) return "Elige un formato de competencia.";
      const catErr = validateTournamentCategoryDrafts(form.categories);
      if (catErr) return catErr;
    }
    return null;
  };

  const validateStep = (s: number): string | null => {
    if (s === 1 && isCompetitive && !form.format.trim()) {
      return "Elige un formato de competencia.";
    }
    return null;
  };

  const handlePublish = () => {
    const err = validate();
    if (err) {
      toast({ icon: "alert-triangle", title: "No se puede publicar", sub: err });
      return;
    }
    startSubmit(async () => {
      if (isCompetitive) {
        const tournamentCategories = categoryDraftsToCreatePayload(form.categories);
        const tournamentFormat = clubEventFormatToTournament(form.format);
        const created = await createClubTournament({
          clubId: form.clubId!,
          name: form.name.trim(),
          slug: slugify(form.name),
          description: form.desc.trim() || undefined,
          sport: form.sport === "pickleball" ? "pickleball" : "pickleball",
          format: tournamentFormat,
          startsAt: new Date(form.start).toISOString(),
          endsAt: new Date(form.end).toISOString(),
          maxParticipants: bracketTeams > 0 ? bracketTeams : undefined,
          entryFeeCents: Math.round((form.fee || 0) * 100),
          currency: "USD",
          paymentPolicy: form.fee > 0 ? form.paymentPolicy : "free",
          prizePoolCents: form.prize > 0 ? Math.round(form.prize * 100) : undefined,
          prizes:
            form.prize > 0
              ? PRIZE_PLACE_LABELS.map((place, i) => ({
                  position: i,
                  placeLabel: place,
                  prizeLabel: form.prizeDetails[i]?.trim() || DEFAULT_PRIZE_DETAILS[i],
                  valueCents: Math.round(
                    (form.prize * Math.max(0, form.prizeShares[i] ?? 0)) / 100 * 100,
                  ),
                }))
              : undefined,
          groupPlayoffConfig:
            tournamentFormat === "groups_to_knockout" ? DEFAULT_GROUP_PLAYOFF_CONFIG : undefined,
          modality: tournamentCategories[0]?.modality ?? "doubles",
          categories: tournamentCategories,
          publish: true,
        });
        if (!created.ok) {
          toast({
            icon: "alert-triangle",
            title: "Error al crear",
            sub: formatActionError(created.error),
          });
          return;
        }
        toast({ icon: "rocket", title: "Torneo publicado", sub: form.name });
        clearCreateEventWizardDraft(form.clubId);
        setDraftSavedAt(null);
        setPub({ id: created.data.id, slug: created.data.slug, kind: "tournament" });
        return;
      }

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
        membersOnly: form.membersOnly,
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
        setPub({ id: ev.id, slug: ev.slug, kind: "event" });
        clearCreateEventWizardDraft(form.clubId);
        setDraftSavedAt(null);
        return;
      }
      toast({ icon: "rocket", title: "Evento publicado", sub: ev.name });
      clearCreateEventWizardDraft(form.clubId);
      setDraftSavedAt(null);
      setPub({ id: ev.id, slug: ev.slug, kind: "event" });
    });
  };

  return (
    <div
      className="mp-crear-evento-overlay"
      onClick={handleClose}
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
        className="card mp-crear-evento-modal"
        style={{
          width: "100%",
          maxWidth: 980,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          minWidth: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div
          className="mp-crear-evento-header"
          style={{
            padding: "14px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "#0a0a0a",
            color: "#fff",
          }}
        >
          <div
            className="mp-crear-evento-header-brand"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}
          >
            <span style={{ color: "var(--primary)", fontSize: 16, fontWeight: 900, flexShrink: 0 }}>●</span>
            <span
              className="font-heading mp-crear-evento-header-logo"
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              MATCHPOINT
            </span>
            <span
              className="mp-crear-evento-header-sep"
              style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)", flexShrink: 0 }}
            />
            <span
              className="mp-crear-evento-header-title"
              style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}
            >
              {pub ? "Evento publicado" : "Crear evento"}
            </span>
            {!pub && contextBadge && (
              <span
                className="mp-crear-evento-owner-badge"
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
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 140,
                }}
                title={contextBadge}
              >
                ● {contextBadge}
              </span>
            )}
          </div>
          <div
            className="mp-crear-evento-header-meta"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}
          >
            {!pub && draftSavedAt && (
              <span
                className="mp-crear-evento-draft-label"
                style={{
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.7)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icon name="save" size={11} color="rgba(255,255,255,0.7)" />
                Borrador guardado ✓
              </span>
            )}
            <button
              onClick={handleClose}
              aria-label="Cerrar"
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
                flexShrink: 0,
              }}
            >
              <Icon name="x" size={14} color="#fff" />
            </button>
          </div>
        </div>

        {!pub && (
          <div className="mp-crear-match-steps mp-crear-evento-steps">
            <div className="mp-crear-match-steps-compact">
              <div className="mp-crear-match-steps-bar">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 9999,
                      background: i <= step ? "var(--primary)" : "var(--border)",
                    }}
                  />
                ))}
              </div>
              <p className="mp-crear-match-step-caption">
                Paso {step + 1} de {STEPS.length} · {STEPS[step]}
              </p>
            </div>
            <div className="mp-crear-match-steps-full">
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
                        minWidth: 0,
                        flexShrink: cur || done ? 0 : 1,
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
                          flexShrink: 0,
                        }}
                      >
                        {done ? "✓" : i + 1}
                      </div>
                      <div
                        className="mp-crear-evento-step-label"
                        style={{
                          fontSize: 10.5,
                          fontWeight: cur ? 900 : 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: cur ? "#0a0a0a" : "var(--muted-fg)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s}
                      </div>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          minWidth: 8,
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
          </div>
        )}

        <div className="mp-crear-evento-body">
          {pub ? (
            <CEDone
              form={form}
              eventId={pub.id}
              eventSlug={pub.slug}
              kind={pub.kind}
              role={openRole}
              close={handleClose}
              onManage={() => {
                handleClose();
                const clubRole = openRole === "manager" ? "manager" : "owner";
                router.push(`/dashboard/${clubRole}/club-torneo/${pub.id}`);
              }}
            />
          ) : step === 0 ? (
            <CEStep1 form={form} set={set} typeCounts={typeCounts} typeCountsLoading={typeCountsLoading} />
          ) : step === 1 ? (
            <CEStep2 form={form} set={set} />
          ) : step === 2 ? (
            <CEStep3 form={form} set={set} bracketTeams={bracketTeams} isCompetitive={isCompetitive} />
          ) : (
            <CEStep4 form={form} set={set} bracketTeams={bracketTeams} isCompetitive={isCompetitive} />
          )}
        </div>

        {!pub && (
          <div className="mp-crear-match-footer mp-crear-evento-footer">
            <button
              className="btn mp-crear-match-footer-btn mp-crear-match-footer-back"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
              onClick={() => (step === 0 ? handleClose() : setStep((s) => s - 1))}
              disabled={submitting}
            >
              <Icon name="arrow-left" size={13} />
              {step === 0 ? "Cancelar" : "Atrás"}
            </button>
            <button
              className="btn btn-primary mp-crear-match-footer-btn mp-crear-match-footer-primary"
              disabled={submitting}
              onClick={() => {
                if (step === 3) {
                  handlePublish();
                  return;
                }
                const stepErr = validateStep(step);
                if (stepErr) {
                  toast({ icon: "alert-triangle", title: "Completa el paso", sub: stepErr });
                  return;
                }
                setStep((s) => s + 1);
              }}
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

const TYPES: { k: EvType; t: string; sub: string; d: string; i: string; dimmed?: boolean; soon?: boolean }[] = [
  { k: "torneo", t: "Torneo", sub: "Eliminación directa o mejor de N", d: "Cuadro, llaves, premios. Lo más común — fin de semana intensivo.", i: "trophy" },
  { k: "liga", t: "Liga", sub: "Round-robin · varias fechas", d: "Múltiples jornadas, tabla de posiciones, ascensos / descensos.", i: "list-ordered", soon: true },
  { k: "social", t: "Social", sub: "Mixto sorteado · sin tabla", d: "Mezcla niveles, conoce gente, snacks y música. Sin presión.", i: "sparkles", soon: true },
  { k: "clinic", t: "Clinic / clase", sub: "Entreno grupal con coach", d: "Sesión técnica de 1–3 horas. Cupos cerrados, sin premios.", i: "graduation-cap", dimmed: true },
];

function typeCountLabel(
  type: EvType,
  counts: CreateEventTypeCounts | null,
  loading: boolean,
  dimmed?: boolean,
  soon?: boolean,
): string {
  if (soon) return "Próximamente";
  if (dimmed) return "Solo rol coach";
  if (loading) return "Cargando…";
  if (!counts) return "Abre desde tu club";
  const n = counts[type];
  if (n === 0) return "Ninguno este mes";
  return n === 1 ? "1 este mes en tu club" : `${n} este mes en tu club`;
}

function popularType(counts: CreateEventTypeCounts | null): EvType | null {
  if (!counts) return null;
  let best: EvType | null = null;
  let max = 0;
  for (const t of TYPES) {
    if (t.dimmed || t.soon) continue;
    const n = counts[t.k];
    if (n > max) {
      max = n;
      best = t.k;
    }
  }
  return max > 0 ? best : null;
}

const SPORTS: { k: Sport; t: string; icon: string }[] = [
  { k: "pickleball", t: "Pickleball", icon: "activity" },
];

function CESportField({ form, set }: { form: Form; set: Setter }) {
  if (SPORTS.length === 1) {
    const sport = SPORTS[0]!;
    return (
      <CEField label="Deporte">
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg,#10b981,#064e3b)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name={sport.icon} size={13} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>{sport.t}</div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
              Deporte fijo por ahora en MATCHPOINT
            </div>
          </div>
        </div>
      </CEField>
    );
  }

  return (
    <CEField label="Deporte">
      <div className="mp-crear-evento-sports">
        {SPORTS.map((s) => {
          const active = form.sport === s.k;
          return (
            <button
              key={s.k}
              type="button"
              onClick={() => set("sport", s.k)}
              className={`mp-crear-evento-sport-chip${active ? " is-active" : ""}`}
            >
              <Icon name={s.icon} size={13} color={active ? "var(--primary)" : "var(--muted-fg)"} />
              {s.t}
            </button>
          );
        })}
      </div>
    </CEField>
  );
}

function CEStep1({
  form,
  set,
  typeCounts,
  typeCountsLoading,
}: {
  form: Form;
  set: Setter;
  typeCounts: CreateEventTypeCounts | null;
  typeCountsLoading: boolean;
}) {
  const popular = popularType(typeCounts);
  return (
    <div>
      <div className="label-mp">Paso 1 de 4</div>
      <h2
        className="font-heading mp-crear-evento-title"
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

      <div className="mp-crear-evento-types gap-2.5" style={{ marginBottom: 22 }}>
        {TYPES.map((t) => {
          const active = form.type === t.k;
          const disabled = t.dimmed || t.soon;
          const showPopular = popular === t.k;
          return (
            <button
              key={t.k}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && set("type", t.k)}
              className={`mp-crear-evento-type-card${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
            >
              {showPopular && <span className="mp-crear-evento-type-tag">POPULAR</span>}
              {t.soon && (
                <span className="mp-crear-evento-type-tag mp-crear-evento-type-tag--soon">PRÓXIMAMENTE</span>
              )}
              <div className="mp-crear-evento-type-icon">
                <Icon name={t.i} size={15} color="#fff" />
              </div>
              <div className="mp-crear-evento-type-title font-heading">{t.t}</div>
              <div className="mp-crear-evento-type-sub">{t.sub}</div>
              <div className="mp-crear-evento-type-desc">{t.d}</div>
              <div className="mp-crear-evento-type-foot">
                ● {typeCountLabel(t.k, typeCounts, typeCountsLoading, t.dimmed, t.soon)}
              </div>
            </button>
          );
        })}
      </div>

      <CESportField form={form} set={set} />
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

function CEMprRangeControl({
  mprMin,
  mprMax,
  onChange,
}: {
  mprMin: number;
  mprMax: number | null;
  onChange: (patch: Partial<TournamentCategoryDraft>) => void;
}) {
  const openTop = mprMax == null;
  const sliderMax = mprMax ?? 8.0;

  return (
    <div>
      <MprRangeSlider
        min={mprMin}
        max={sliderMax}
        noUpperCap={openTop}
        onChange={(lo, hi) =>
          onChange({
            mprMin: lo,
            mprMax: openTop ? null : hi,
            levelLabel: null,
          })
        }
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
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
            checked={openTop}
            onChange={(e) => {
              onChange({
                mprMax: e.target.checked ? null : clampMpr(Math.max(mprMin + 0.25, mprMin + 1)),
                levelLabel: null,
              });
            }}
            style={{ accentColor: "var(--primary)" }}
          />
          Sin tope superior (ej. 5.0+)
        </label>
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="label-mp" style={{ display: "block", marginBottom: 6 }}>
          Atajos
        </span>
        <div className="mp-crear-evento-level-presets">
          {EVENT_LEVEL_OPTIONS.map((level) => {
            const preset = mprPresetRange(level.label);
            const active =
              (openTop &&
                preset.mprMax == null &&
                Math.abs(mprMin - preset.mprMin) < 0.13) ||
              (!openTop &&
                preset.mprMax != null &&
                mprMax != null &&
                Math.abs(mprMin - preset.mprMin) < 0.13 &&
                Math.abs(mprMax - preset.mprMax) < 0.13);
            return (
              <button
                key={level.label}
                type="button"
                onClick={() =>
                  onChange({
                    levelLabel: level.label,
                    mprMin: preset.mprMin,
                    mprMax: preset.mprMax,
                  })
                }
                className={`mp-crear-evento-level-preset${active ? " is-active" : ""}`}
              >
                {level.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CETournamentCategoriesEditor({
  categories,
  onChange,
}: {
  categories: TournamentCategoryDraft[];
  onChange: (next: TournamentCategoryDraft[]) => void;
}) {
  const patchAt = (index: number, patch: Partial<TournamentCategoryDraft>) => {
    onChange(
      categories.map((c, i) => (i === index ? patchTournamentCategoryDraft(c, patch) : c)),
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
        Define al menos una categoría (ej. Categoría 3.5 · Masculino). El cupo es{" "}
        <strong>por categoría</strong>; el cronograma y los cuadros los afinas después en{" "}
        <strong>Gestionar</strong>.
      </div>
      {categories.map((c, i) => (
        <div
          key={i}
          className="mp-crear-evento-cat-card"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 0,
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
            <input
              value={c.name}
              placeholder="Nombre (ej. Categoría 4.0, Open Mixto)"
              style={{ ...ceInputStyle, flex: 1, minWidth: 0 }}
              onChange={(e) => patchAt(i, { name: e.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange(categories.filter((_, j) => j !== i))}
              disabled={categories.length <= 1}
              className="btn mp-crear-quedada-cat-del"
              style={{
                background: "#fff",
                border: "1px solid var(--destructive-border)",
                color: "var(--destructive-fg)",
                padding: "0 12px",
                opacity: categories.length <= 1 ? 0.4 : 1,
                flexShrink: 0,
              }}
              aria-label="Quitar categoría"
              title={categories.length <= 1 ? "Debe quedar al menos una categoría" : undefined}
            >
              <Icon name="trash-2" size={14} />
            </button>
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: c.noLevel ? "var(--muted-fg)" : "var(--fg)",
                }}
              >
                Nivel MPR
                {!c.noLevel ? (
                  (() => {
                    const range = categoryDraftMprRange(c);
                    return (
                      <span style={{ color: "var(--primary)", marginLeft: 6 }}>
                        {formatMprRange(range.mprMin, range.mprMax)}
                      </span>
                    );
                  })()
                ) : null}
              </span>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  color: "var(--muted-fg)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={c.noLevel}
                  onChange={(e) => patchAt(i, { noLevel: e.target.checked })}
                  style={{ accentColor: "var(--primary)" }}
                />
                Sin nivel (Open)
              </label>
            </div>
            {!c.noLevel && (
              <CEMprRangeControl
                mprMin={c.mprMin}
                mprMax={c.mprMax}
                onChange={(patch) => patchAt(i, patch)}
              />
            )}
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Modalidad
            </div>
            <div className="mp-crear-evento-level-presets">
              {CATEGORY_MODALITY_OPTIONS.map((mod) => {
                const active = c.modality === mod.value;
                return (
                  <button
                    key={mod.value}
                    type="button"
                    onClick={() => patchAt(i, { modality: mod.value })}
                    className={`mp-crear-evento-level-preset${active ? " is-active" : ""}`}
                  >
                    {mod.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mp-grid-form-2 gap-2.5">
            <div>
              <div className="label-mp" style={{ marginBottom: 5 }}>
                Género
              </div>
              <select
                value={c.gender}
                onChange={(e) =>
                  patchAt(i, { gender: e.target.value as TournamentCategoryDraft["gender"] })
                }
                style={ceInputStyle}
              >
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="label-mp" style={{ marginBottom: 5 }}>
                {categoryDraftCupoLabel(c.modality)}
              </div>
              <input
                type="number"
                min={1}
                max={128}
                required
                value={c.maxTeams}
                placeholder="Ej. 8"
                style={ceInputStyle}
                onChange={(e) => patchAt(i, { maxTeams: e.target.value })}
              />
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{categoryDraftSummary(c)}</div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...categories, emptyTournamentCategory()])}
        className="btn btn-outline"
        style={{ alignSelf: "flex-start" }}
      >
        <Icon name="plus" size={13} /> Agregar categoría
      </button>
    </div>
  );
}

const EVENT_FORMAT_OPTIONS = [
  "Eliminación directa · mejor de 3",
  "Round-robin",
  "Grupos + playoffs",
] as const;

function CEStep2({ form, set }: { form: Form; set: Setter }) {
  const clubResolved = Boolean(form.clubId || form.venue.trim());
  const inp = (val: string, k: keyof Form) => (
    <input value={val} onChange={(e) => set(k, e.target.value as never)} style={ceInputStyle} />
  );
  return (
    <div className="mp-grid-split gap-5.5">
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
          <div className="mp-grid-form-2 gap-2.5">
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
                background: clubResolved ? "#fff" : "#fafafa",
                opacity: clubResolved ? 1 : 0.7,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: clubResolved
                    ? "linear-gradient(135deg,#10b981,#064e3b)"
                    : "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                }}
              >
                <Icon name="building-2" size={13} color={clubResolved ? "#fff" : "var(--muted-fg)"} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 900 }}>
                  {form.venue.trim() || "Sin club resuelto"}
                </div>
                {!clubResolved ? (
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                    Abre el modal desde la pantalla del club
                  </div>
                ) : null}
              </div>
            </div>
          </CEField>
          <CEField label="Formato">
            <select
              value={form.format}
              onChange={(e) => set("format", e.target.value)}
              style={{
                ...ceInputStyle,
                color: form.format ? "inherit" : "var(--muted-fg)",
              }}
            >
              <option value="" disabled>
                Elige un formato…
              </option>
              {EVENT_FORMAT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </CEField>
          {form.type !== "torneo" && form.type !== "liga" ? (
            <CEField label="Nivel sugerido">
              <div className="mp-crear-evento-level-presets">
                {EVENT_LEVEL_OPTIONS.map((level) => {
                  const active = form.categoryLevels.includes(level.label);
                  return (
                    <button
                      key={level.label}
                      type="button"
                      onClick={() => set("categoryLevels", active ? [] : [level.label])}
                      className={`mp-crear-evento-level-preset${active ? " is-active" : ""}`}
                    >
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </CEField>
          ) : null}
          {(form.type === "torneo" || form.type === "liga") && (
            <CEField
              label="Categorías"
              hint="Al menos una · cupo por categoría"
            >
              <CETournamentCategoriesEditor
                categories={form.categories}
                onChange={(categories) => set("categories", categories)}
              />
            </CEField>
          )}
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

function CEStep3({
  form,
  set,
  bracketTeams,
  isCompetitive,
}: {
  form: Form;
  set: Setter;
  bracketTeams: number;
  isCompetitive: boolean;
}) {
  const slots = isCompetitive ? bracketTeams : form.slots;
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

      <div className="mp-grid-form-2 gap-4">
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
              <span style={{ fontSize: 12, fontWeight: 800 }}>
                {isCompetitive ? "Total del cuadro" : "Tamaño del cuadro"}
              </span>
              <span
                className="font-heading"
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "var(--primary)",
                }}
              >
                {slots} parejas
              </span>
            </div>
            {isCompetitive ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  lineHeight: 1.45,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--muted)",
                  border: "1px dashed var(--border)",
                }}
              >
                Suma de cupos por categoría ({form.categories.filter((c) => c.name.trim()).length}{" "}
                {form.categories.filter((c) => c.name.trim()).length === 1 ? "categoría" : "categorías"}).
                Edítalo en el paso 2.
              </div>
            ) : (
              <div className="mp-crear-evento-slots-row" style={{ display: "flex", gap: 4 }}>
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
            )}
          </div>

          <div
            style={{
              borderTop: "1px dashed var(--border)",
              paddingTop: 14,
              marginBottom: 14,
            }}
          >
            <div className="mp-grid-form-2 gap-2.5">
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
                {slots} × ${form.fee} × 0.6 = $
                {(slots * form.fee * 0.6).toFixed(0)}
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
              {Math.max(0, form.prize - slots * form.fee * 0.6).toFixed(0)} al pozo
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PRIZE_PLACE_LABELS.map((place, i) => (
              <div
                key={place}
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
                  {place}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={form.prizeShares[i] ?? 0}
                    onChange={(e) => {
                      const next = [...form.prizeShares];
                      next[i] = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      set("prizeShares", next);
                    }}
                    aria-label={`Porcentaje ${place}`}
                    style={{
                      ...ceInputStyle,
                      width: 44,
                      padding: "6px 4px",
                      fontSize: 12,
                      fontFamily: "Plus Jakarta Sans",
                      fontWeight: 900,
                      textAlign: "center",
                      letterSpacing: "-0.01em",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "Plus Jakarta Sans",
                      fontWeight: 900,
                      fontSize: 12,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    %
                  </span>
                </div>
                <input
                  value={form.prizeDetails[i] ?? ""}
                  onChange={(e) => {
                    const next = [...form.prizeDetails];
                    next[i] = e.target.value;
                    set("prizeDetails", next);
                  }}
                  placeholder="Ej. Trofeo + kit"
                  aria-label={`Premio ${place}`}
                  style={{
                    ...ceInputStyle,
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                    padding: "6px 8px",
                    color: "var(--muted-fg)",
                  }}
                />
                <div
                  className="font-heading"
                  style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", flexShrink: 0 }}
                >
                  ${((form.prize * Math.max(0, form.prizeShares[i] ?? 0)) / 100).toFixed(0)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <input
              type="range"
              min="500"
              max="10000"
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
            <span>Max $10,000</span>
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

function CEStep4({
  form,
  set,
  bracketTeams,
  isCompetitive,
}: {
  form: Form;
  set: Setter;
  bracketTeams: number;
  isCompetitive: boolean;
}) {
  const slots = isCompetitive ? bracketTeams : form.slots;
  const namedCategories = isCompetitive
    ? form.categories.filter((c) => c.name.trim())
    : [];
  const levelLabel = form.categoryLevels.join(" · ") || "Open";
  const check = [
    { l: "Tipo, deporte y nivel", ok: true },
    { l: "Fechas y sede confirmadas", ok: true },
    { l: "Formato y descripción", ok: true },
    { l: "Cupos, precio y reglas", ok: true },
    { l: "Premios definidos · $" + form.prize, ok: true },
    { l: "Imagen de portada", ok: false, w: "Usaremos la plantilla por defecto" },
  ];
  return (
    <div className="mp-grid-split gap-5.5">
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "3px 10px",
                  background: "var(--primary)",
                  borderRadius: 9999,
                  fontSize: 9,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  flexShrink: 0,
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
                  flexShrink: 0,
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
                  flexShrink: 0,
                }}
              >
                {isCompetitive
                  ? namedCategories.length === 0
                    ? "Sin categorías"
                    : `${namedCategories.length} ${namedCategories.length === 1 ? "categoría" : "categorías"}`
                  : `Nivel ${levelLabel}`}
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
            {isCompetitive && namedCategories.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 10,
                  maxHeight: 72,
                  overflowY: "auto",
                  paddingRight: 2,
                }}
              >
                {namedCategories.map((c, i) => (
                  <span
                    key={`${c.name}-${i}`}
                    title={c.name.trim()}
                    style={{
                      padding: "4px 8px",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1.3,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name.trim()}
                  </span>
                ))}
              </div>
            ) : null}
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
                <Icon name="users" size={11} color="#fff" /> {slots} parejas · ${form.fee}
              </span>
            </div>
          </div>
        </div>

        <div className="label-mp" style={{ marginTop: 16, marginBottom: 8 }}>
          Visibilidad
        </div>
        <div className="mp-grid-form-3 gap-2">
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
              [
                "Cuadro",
                isCompetitive
                  ? `${slots} parejas · ${form.categories.filter((c) => c.name.trim()).length} cat.`
                  : `${slots} parejas · mixto`,
              ],
              ["Inscripción", "$" + form.fee + " / pareja"],
              ["Ingresos brutos", "$" + (slots * form.fee).toFixed(0)],
              ["Comisión MP (10%)", "–$" + (slots * form.fee * 0.1).toFixed(0)],
              ["Premio (60% pozo)", "–$" + (slots * form.fee * 0.6).toFixed(0)],
              [
                "Club aporta",
                "–$" + Math.max(0, form.prize - slots * form.fee * 0.6).toFixed(0),
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
  kind,
  role,
  close,
  onManage,
}: {
  form: Form;
  eventId: string;
  eventSlug: string;
  kind: "event" | "tournament";
  role: RoleKey;
  close: () => void;
  onManage?: () => void;
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
              {kind === "tournament" ? "Torneo" : "Evento"} #{shortId} · Publicado
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
              {kind === "tournament" ? "¡Tu torneo está vivo!" : "¡Tu evento está vivo!"}
              <span style={{ color: "#fbbf24" }}>.</span>
            </h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 5 }}>
              {form.name} ya aparece en el listado · los jugadores eligen categoría al inscribirse
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
          matchpoint.top/{kind === "tournament" ? "eventos" : "e"}/{eventSlug}
        </span>
        <button
          onClick={() => {
            const url = `https://matchpoint.top/${kind === "tournament" ? "eventos" : "e"}/${eventSlug}`;
            navigator.clipboard?.writeText(url).catch(() => {});
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
      <div className="mp-crear-evento-types gap-2">
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

      <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            flex: 1,
            minWidth: 120,
            justifyContent: "center",
          }}
          onClick={close}
        >
          Cerrar
        </button>
        {kind === "tournament" && onManage && (role === "owner" || role === "manager") ? (
          <button
            className="btn btn-primary"
            style={{ flex: 1, minWidth: 160, justifyContent: "center" }}
            onClick={onManage}
          >
            <Icon name="settings" size={13} color="#fff" />
            Gestionar torneo
          </button>
        ) : (
          <button
            className="btn btn-primary"
            style={{ flex: 1, minWidth: 120, justifyContent: "center" }}
            onClick={close}
          >
            <Icon name="external-link" size={13} color="#fff" />
            Listo
          </button>
        )}
      </div>
    </div>
  );
}
