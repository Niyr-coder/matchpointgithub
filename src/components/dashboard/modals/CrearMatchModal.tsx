// CrearMatchModal — migrado desde ui_kits/dashboard/CrearMatchModal.jsx
// Escucha window event 'mp-open-crear-match' (sin detail).
//
// Wireup a backend:
//  · El botón final llama a `createMatch` con UUIDs reales tomados del
//    `PlayerPicker` (paso 3).
//  · `currentUserId` se baja como prop desde `DashboardLayout` (server) → `DashboardModals`
//    para no hacer un fetch extra al abrir.
//  · La modalidad 'mixto' del UI se mapea a 'doubles' en el backend
//    (el schema solo distingue cardinalidad, no género).
//
// Convención teamA/teamB en doubles (incluye 'mixto'):
//  · El creador (current user) siempre va en teamA[0].
//  · El primer jugador seleccionado en el picker es el partner (teamA[1]).
//  · Los dos siguientes son los rivales (teamB[0], teamB[1]).
//  Es decir: picks = [partner, rivalA, rivalB] ⇒ teamA = [me, partner], teamB = [rivalA, rivalB].
"use client";
import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import {
  createMatch,
  getRetarScheduleOptions,
  type RetarScheduleClubOption,
} from "@/server/actions/matches";
import { listCourtsByClub } from "@/server/actions/courts";
import { listReservations } from "@/server/actions/reservations";
import {
  buildStartSlots,
  computeTakenSlots,
  dayRangeIso,
  type BookingDuration,
  type ExistingReservation,
} from "@/lib/booking/court-slots";
import { PlayerPicker, type Player } from "@/components/dashboard/widgets/PlayerPicker";
import { RankedBadge } from "@/components/dashboard/widgets/RankedBadge";
import { useEnabledSports } from "@/components/SportsProvider";
import type { Court } from "@/lib/schemas/courts";

type Sport = "pickleball" | "padel" | "tenis";
type Mode = "singles" | "dobles" | "mixto";
type Visibility = "amigos" | "club" | "public";

type Form = {
  sport: Sport;
  mode: Mode;
  date: string;
  time: string;
  duration: BookingDuration;
  clubId: string | null;
  clubName: string;
  courtId: string | null;
  courtLabel: string;
  visibility: Visibility;
  level: string | null;
  splitCost: boolean;
  totalCost: number;
  notes: string;
  picks: Player[];
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateTimeToIso(dateIso: string, time: string): string {
  const [h, mi] = time.split(":").map((n) => parseInt(n, 10));
  const [y, mo, da] = dateIso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, mo - 1, da, h, mi, 0, 0).toISOString();
}

function courtLabel(court: Court): string {
  return court.name?.trim() || `Cancha ${court.code}`;
}

const INITIAL_FORM: Form = {
  sport: "pickleball",
  mode: "dobles",
  date: todayIso(),
  time: "19:00",
  duration: 60,
  clubId: null,
  clubName: "",
  courtId: null,
  courtLabel: "",
  visibility: "amigos",
  level: null,
  splitCost: true,
  totalCost: 0,
  notes: "",
  picks: [],
};

// Mapas UI → backend
const SPORT_TO_DB: Record<Sport, "tennis" | "padel" | "pickleball"> = {
  pickleball: "pickleball",
  padel: "padel",
  tenis: "tennis",
};
const MODE_TO_DB: Record<Mode, "singles" | "doubles"> = {
  singles: "singles",
  dobles: "doubles",
  // 'mixto' es doubles a nivel de cardinalidad; el backend no distingue género.
  mixto: "doubles",
};

const STEPS = ["Tipo", "Cuándo y dónde", "Jugadores", "Resumen"];

export function CrearMatchModal({ currentUserId }: { currentUserId: string | null }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(INITIAL_FORM);
  const [done, setDone] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setStep(0);
      setDone(false);
      setForm({ ...INITIAL_FORM, date: todayIso() });
    };
    window.addEventListener("mp-open-crear-match", handler);
    return () => window.removeEventListener("mp-open-crear-match", handler);
  }, []);

  const [scheduleClubs, setScheduleClubs] = useState<RetarScheduleClubOption[]>([]);
  const [scheduleCourts, setScheduleCourts] = useState<Court[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [availLoading, setAvailLoading] = useState(false);
  const [existingReservations, setExistingReservations] = useState<ExistingReservation[]>([]);

  const timeSlots = useMemo(
    () => buildStartSlots(form.duration),
    [form.duration],
  );
  const takenSlots = useMemo(
    () => computeTakenSlots(form.date, timeSlots, form.duration, existingReservations),
    [form.date, timeSlots, form.duration, existingReservations],
  );

  useEffect(() => {
    if (!open) {
      setScheduleClubs([]);
      setScheduleCourts([]);
      setExistingReservations([]);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    const sportDb = SPORT_TO_DB[form.sport];
    void (async () => {
      if (currentUserId) {
        const res = await getRetarScheduleOptions({ sport: sportDb });
        if (cancelled) return;
        setScheduleLoading(false);
        if (res.ok) {
          setScheduleClubs(res.data.clubs);
        } else {
          setScheduleClubs([]);
        }
        return;
      }
      try {
        const params = new URLSearchParams({ sport: sportDb, pageSize: "40", page: "1" });
        const res = await fetch(`/api/v1/clubs?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        setScheduleLoading(false);
        if (res.ok && json.ok) {
          setScheduleClubs(
            (json.data ?? []).map((c: { id: string; name: string; city: string }) => ({
              id: c.id,
              name: c.name,
              city: c.city,
            })),
          );
        } else {
          setScheduleClubs([]);
        }
      } catch {
        if (!cancelled) {
          setScheduleLoading(false);
          setScheduleClubs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentUserId, form.sport]);

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({
      ...f,
      clubId: null,
      clubName: "",
      courtId: null,
      courtLabel: "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar deporte
  }, [form.sport]);

  useEffect(() => {
    if (!form.clubId) {
      setScheduleCourts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await listCourtsByClub({ clubId: form.clubId! });
      if (cancelled || !res.ok) return;
      const sportDb = SPORT_TO_DB[form.sport];
      setScheduleCourts(res.data.filter((c) => c.sport === sportDb));
    })();
    return () => {
      cancelled = true;
    };
  }, [form.clubId, form.sport]);

  useEffect(() => {
    if (!form.clubId || scheduleCourts.length === 0) return;
    if (form.courtId && scheduleCourts.some((c) => c.id === form.courtId)) return;
    const first = scheduleCourts[0];
    setForm((f) => ({
      ...f,
      courtId: first.id,
      courtLabel: courtLabel(first),
    }));
  }, [scheduleCourts, form.clubId, form.courtId]);

  useEffect(() => {
    if (!form.clubId || !form.courtId) {
      setExistingReservations([]);
      return;
    }
    let cancelled = false;
    setAvailLoading(true);
    const { from, to } = dayRangeIso(form.date);
    void (async () => {
      const res = await listReservations({
        clubId: form.clubId!,
        courtId: form.courtId!,
        from,
        to,
        pageSize: 100,
      });
      if (cancelled) return;
      setAvailLoading(false);
      if (!res.ok) {
        setExistingReservations([]);
        return;
      }
      setExistingReservations(
        res.data.map((r) => ({
          id: r.id,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          status: r.status,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [form.clubId, form.courtId, form.date]);

  useEffect(() => {
    if (takenSlots.has(form.time)) {
      const free = timeSlots.find((s) => !takenSlots.has(s));
      if (free) setForm((f) => ({ ...f, time: free }));
    }
  }, [takenSlots, form.time, timeSlots]);

  const scheduleComplete =
    !!form.clubId && !!form.courtId && !!form.time && !takenSlots.has(form.time);

  const validateScheduleStep = (): boolean => {
    if (!form.clubId || !form.clubName) {
      toast({
        icon: "alert-triangle",
        title: "Elige club y cancha",
        sub: "Necesitamos un lugar para verificar horarios disponibles.",
      });
      return false;
    }
    if (!form.courtId) {
      toast({
        icon: "alert-triangle",
        title: "Elige una cancha",
        sub: "Este club no tiene canchas activas para el deporte seleccionado.",
      });
      return false;
    }
    if (takenSlots.has(form.time)) {
      toast({
        icon: "alert-triangle",
        title: "Horario ocupado",
        sub: "Ese slot ya está reservado. Elige otra hora.",
      });
      return false;
    }
    return true;
  };

  // Validez de submit: necesitamos current user + selección completa de jugadores.
  //  · singles → 1 pick (rival).
  //  · doubles / mixto → 3 picks (partner + 2 rivales).
  const needed = form.mode === "singles" ? 1 : 3;
  const hasUser = !!currentUserId;
  const hasAllPicks = form.picks.length === needed;
  const canSubmit = hasUser && hasAllPicks;

  const handleSubmit = () => {
    if (!hasUser) {
      toast({
        icon: "alert-triangle",
        title: "Tienes que iniciar sesión",
        sub: "No se pudo identificar al creador del match.",
      });
      return;
    }
    if (!hasAllPicks) {
      toast({
        icon: "alert-triangle",
        title: "Faltan jugadores",
        sub:
          form.mode === "singles"
            ? "Selecciona a tu rival."
            : "Selecciona tu pareja y los 2 rivales.",
      });
      return;
    }
    if (!form.clubId || !form.courtId) {
      toast({
        icon: "alert-triangle",
        title: "Falta club o cancha",
        sub: "Vuelve al paso anterior y elige dónde jugarán.",
      });
      return;
    }
    if (takenSlots.has(form.time)) {
      toast({
        icon: "alert-triangle",
        title: "Horario ocupado",
        sub: "Ese slot ya no está disponible. Elige otra hora.",
      });
      return;
    }
    startSubmit(async () => {
      const playedAt = dateTimeToIso(form.date, form.time);
      const pickIds = form.picks.map((p) => p.id);
      // Convención (ver header del archivo):
      //  · singles  → teamA = [me], teamB = [rival]
      //  · doubles  → teamA = [me, partner], teamB = [rivalA, rivalB]
      const teamAPlayerIds =
        form.mode === "singles" ? [currentUserId!] : [currentUserId!, pickIds[0]];
      const teamBPlayerIds =
        form.mode === "singles" ? pickIds : pickIds.slice(1);
      const res = await createMatch({
        sport: SPORT_TO_DB[form.sport],
        mode: MODE_TO_DB[form.mode],
        clubId: form.clubId,
        courtId: form.courtId,
        playedAt,
        durationMin: form.duration,
        teamAPlayerIds,
        teamBPlayerIds,
      });
      if (!res.ok) {
        toast({
          icon: "alert-triangle",
          title: "No se pudo crear el match",
          sub: res.error.message,
        });
        return;
      }
      toast({ icon: "check-circle-2", title: "Match creado" });
      setDone(true);
      router.refresh();
    });
  };

  if (!open) return null;
  const close = () => setOpen(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mp-crear-match-overlay" style={{
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
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="card mp-crear-match-modal"
        style={{
          width: "100%",
          maxWidth: 760,
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
        <div className="mp-crear-match-header" style={{
            padding: "20px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            minWidth: 0,
            flexShrink: 0,
          }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="label-mp" style={{ marginBottom: 4 }}>
              Acción rápida · Inicio
            </div>
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
              {done ? "Match creado." : "Crear match."}
            </h2>
          </div>
          <button
            onClick={close}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {!done && (
          <div className="mp-crear-match-steps">
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
              <div className="mp-crear-match-step-caption">
                Paso {step + 1} de {STEPS.length} · {STEPS[step]}
              </div>
            </div>
            <div className="mp-crear-match-steps-full">
            {STEPS.map((s, i) => (
              <div key={s} style={{ display: "contents" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, opacity: i <= step ? 1 : 0.4 }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: i < step ? "var(--primary)" : i === step ? "#0a0a0a" : "var(--muted)",
                      color: i <= step ? "#fff" : "var(--muted-fg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      fontFamily: "Plus Jakarta Sans",
                      flexShrink: 0,
                    }}
                  >
                    {i < step ? <Icon name="check" size={11} color="#fff" /> : i + 1}
                  </div>
                  <span
                    className="mp-crear-match-step-label"
                    style={{
                      fontSize: 11,
                      fontWeight: i === step ? 900 : 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="mp-crear-match-step-connector"
                    style={{
                      flex: 1,
                      height: 1,
                      background: i < step ? "var(--primary)" : "var(--border)",
                      margin: "0 12px",
                      minWidth: 8,
                    }}
                  />
                )}
              </div>
            ))}
            </div>
          </div>
        )}

        <div className="mp-crear-match-body" style={{ flex: 1, overflow: "auto", overflowX: "hidden", padding: 28, minWidth: 0 }}>
          {done ? (
            <DoneScreen form={form} />
          ) : step === 0 ? (
            <Step1 form={form} set={set} />
          ) : step === 1 ? (
            <Step2
              form={form}
              set={set}
              clubs={scheduleClubs}
              courts={scheduleCourts}
              scheduleLoading={scheduleLoading}
              availLoading={availLoading}
              timeSlots={timeSlots}
              takenSlots={takenSlots}
            />
          ) : step === 2 ? (
            <Step3 form={form} set={set} currentUserId={currentUserId} />
          ) : (
            <Step4 form={form} />
          )}
        </div>

        <div className="mp-crear-match-footer">
          {done ? (
            <>
              <button
                className="btn mp-crear-match-footer-btn mp-crear-match-footer-back"
                onClick={close}
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                Cerrar
              </button>
              <button className="btn btn-primary mp-crear-match-footer-btn mp-crear-match-footer-primary" onClick={close}>
                <Icon name="message-circle" size={13} color="#fff" />
                Ir al chat del match
              </button>
            </>
          ) : (
            <>
              <button
                className="btn mp-crear-match-footer-btn mp-crear-match-footer-back"
                onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                <Icon name="arrow-left" size={13} />
                {step === 0 ? "Cancelar" : "Atrás"}
              </button>
              <button
                className="btn btn-primary mp-crear-match-footer-btn mp-crear-match-footer-primary"
                disabled={step === 3 && (submitting || !canSubmit)}
                onClick={() => {
                  if (step === 1 && !validateScheduleStep()) return;
                  if (step !== 3) {
                    setStep((s) => s + 1);
                    return;
                  }
                  handleSubmit();
                }}
                style={
                  step === 3 && !canSubmit
                    ? { opacity: 0.55, cursor: "not-allowed" }
                    : step === 1 && !scheduleComplete
                      ? { opacity: 0.85 }
                      : undefined
                }
                title={
                  step === 3 && !canSubmit
                    ? form.mode === "singles"
                      ? "Selecciona a tu rival"
                      : "Selecciona pareja y 2 rivales"
                    : undefined
                }
              >
                {step === 3 ? (
                  canSubmit ? (
                    <>
                      <Icon name="check" size={13} color="#fff" />
                      {submitting ? "Creando…" : "Confirmar match"}
                    </>
                  ) : (
                    <>
                      <Icon name="users" size={13} color="#fff" />
                      Faltan jugadores
                    </>
                  )
                ) : (
                  <>
                    Siguiente
                    <Icon name="arrow-right" size={13} color="#fff" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const cmInp: CSSProperties = {
  padding: "11px 14px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13.5,
  outline: "none",
  background: "#fff",
  width: "100%",
};

function CMField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{hint}</div>}
    </div>
  );
}

function PickCard({
  active,
  onClick,
  children,
  accent,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: 18,
        border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
        borderRadius: 12,
        background: active ? "#ecfdf5" : disabled ? "#fafafa" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent && active && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={10} color="#fff" />
        </div>
      )}
      {children}
    </button>
  );
}

type Setter = <K extends keyof Form>(k: K, v: Form[K]) => void;

const SPORTS: { k: Sport; t: string; i: string; sub: string; soon?: boolean }[] = [
  { k: "pickleball", t: "Pickleball", i: "🏓", sub: "Disponible ahora" },
  { k: "padel", t: "Pádel", i: "🎾", sub: "Pronto", soon: true },
  { k: "tenis", t: "Tenis", i: "🎾", sub: "Pronto", soon: true },
];

const MODES: { k: Mode; t: string; sub: string }[] = [
  { k: "singles", t: "Singles", sub: "1 vs 1 · 2 jugadores" },
  { k: "dobles", t: "Dobles", sub: "2 vs 2 · 4 jugadores" },
  { k: "mixto", t: "Mixto", sub: "2 vs 2 · parejas mixtas" },
];

const LEVELS = ["Principiante", "2.5-3.0", "3.0-3.5", "3.5-4.0", "4.0-4.5", "4.5+"];

function Step1({ form, set }: { form: Form; set: Setter }) {
  const { sports: enabledDb, single } = useEnabledSports();
  // Filtra los deportes del modal a los habilitados (mapea k local → db).
  const visibleSports = SPORTS.filter((s) => enabledDb.includes(SPORT_TO_DB[s.k]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {!single && (
      <div>
        <div className="label-mp" style={{ marginBottom: 12 }}>
          Deporte
        </div>
        <div className="mp-grid-form-3 gap-2.5">
          {visibleSports.map((s) => (
            <PickCard
              key={s.k}
              active={form.sport === s.k}
              accent
              onClick={() => set("sport", s.k)}
            >
              <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 8 }}>
                {s.i}
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em" }}
              >
                {s.t}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--primary)",
                  marginTop: 4,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Disponible ahora
              </div>
            </PickCard>
          ))}
        </div>
      </div>
      )}
      <div>
        <div className="label-mp" style={{ marginBottom: 12 }}>
          Modalidad
        </div>
        <div className="mp-grid-form-3 gap-2.5">
          {MODES.map((m) => (
            <PickCard key={m.k} active={form.mode === m.k} accent onClick={() => set("mode", m.k)}>
              <div
                className="font-heading"
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em" }}
              >
                {m.t}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{m.sub}</div>
            </PickCard>
          ))}
        </div>
      </div>
      <div>
        <div className="label-mp" style={{ marginBottom: 4 }}>
          Nivel sugerido
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 12 }}>
          Opcional · ayuda a que otros jugadores sepan qué esperar
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => set("level", form.level === l ? null : l)}
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                fontSize: 11.5,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                background: form.level === l ? "#0a0a0a" : "#fff",
                color: form.level === l ? "#fff" : "#0a0a0a",
                border: "1px solid " + (form.level === l ? "#0a0a0a" : "var(--border)"),
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Slots alineados con la convención de booking (ver lib/booking/court-slots).

function Step2({
  form,
  set,
  clubs,
  courts,
  scheduleLoading,
  availLoading,
  timeSlots,
  takenSlots,
}: {
  form: Form;
  set: Setter;
  clubs: RetarScheduleClubOption[];
  courts: Court[];
  scheduleLoading: boolean;
  availLoading: boolean;
  timeSlots: string[];
  takenSlots: Set<string>;
}) {
  const [clubQuery, setClubQuery] = useState("");
  const filteredClubs = useMemo(() => {
    const q = clubQuery.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q),
    );
  }, [clubs, clubQuery]);

  const selectClub = (club: RetarScheduleClubOption) => {
    set("clubId", club.id);
    set("clubName", club.name);
    set("courtId", null);
    set("courtLabel", "");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="mp-grid-form-2 gap-3">
        <CMField label="Fecha">
          <input
            type="date"
            style={cmInp}
            value={form.date}
            min={todayIso()}
            onChange={(e) => set("date", e.target.value)}
          />
        </CMField>
        <CMField label="Duración">
          <select
            style={cmInp}
            value={form.duration}
            onChange={(e) => set("duration", +e.target.value as BookingDuration)}
          >
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
          </select>
        </CMField>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div className="label-mp">Club</div>
          <div
            className="mp-crear-match-club-search"
            style={{ position: "relative", flex: "1 1 140px", maxWidth: 280 }}
          >
            <span
              style={{
                position: "absolute",
                left: 10,
                top: 9,
                color: "var(--muted-fg)",
              }}
            >
              <Icon name="search" size={12} />
            </span>
            <input
              placeholder="Buscar club…"
              value={clubQuery}
              onChange={(e) => setClubQuery(e.target.value)}
              style={{
                ...cmInp,
                padding: "7px 10px 7px 28px",
                fontSize: 12,
                width: "100%",
              }}
            />
          </div>
        </div>
        {scheduleLoading ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)", padding: "8px 0" }}>
            Cargando clubes…
          </div>
        ) : filteredClubs.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              border: "1px dashed var(--border)",
              background: "#fafafa",
              fontSize: 12.5,
              color: "var(--muted-fg)",
            }}
          >
            {clubs.length === 0
              ? "No hay clubes disponibles para este deporte."
              : "Ningún club coincide con tu búsqueda."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredClubs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectClub(c)}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border:
                    form.clubId === c.id ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: form.clubId === c.id ? "#ecfdf5" : "#fff",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontFamily: "inherit",
                  textAlign: "left",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{c.city}</div>
                </div>
                {form.clubId === c.id ? (
                  <Icon name="check-circle-2" size={16} color="var(--primary)" />
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {form.clubId ? (
        <div>
          <div className="label-mp" style={{ marginBottom: 10 }}>
            Cancha
          </div>
          {courts.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              Este club no tiene canchas activas para el deporte elegido.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {courts.map((court) => {
                const label = courtLabel(court);
                const on = form.courtId === court.id;
                return (
                  <button
                    key={court.id}
                    type="button"
                    onClick={() => {
                      set("courtId", court.id);
                      set("courtLabel", label);
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 9999,
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: on ? "#0a0a0a" : "#fff",
                      color: on ? "#fff" : "#0a0a0a",
                      border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"),
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {form.clubId && form.courtId ? (
        <div>
          <div
            className="label-mp"
            style={{
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Hora de inicio</span>
            {availLoading ? (
              <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>
                Verificando…
              </span>
            ) : null}
          </div>
          <div
            className="mp-crear-match-time-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}
          >
            {timeSlots.map((s) => {
              const on = form.time === s;
              const busy = takenSlots.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => !busy && set("time", s)}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: busy ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    background: busy ? "#f4f4f5" : on ? "var(--primary)" : "#fff",
                    color: busy ? "#a1a1aa" : on ? "#fff" : "#0a0a0a",
                    border:
                      "1px solid " +
                      (busy ? "var(--border)" : on ? "var(--primary)" : "var(--border)"),
                    opacity: busy ? 0.65 : 1,
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {!availLoading && timeSlots.every((t) => takenSlots.has(t)) ? (
            <div style={{ fontSize: 11, color: "#b45309", fontWeight: 700, marginTop: 8 }}>
              No hay horarios libres este día. Prueba otra fecha o cancha.
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: "1px dashed var(--border)",
            background: "#fafafa",
            fontSize: 12.5,
            color: "var(--muted-fg)",
          }}
        >
          Elige club y cancha para ver los horarios disponibles.
        </div>
      )}
    </div>
  );
}

const VISIBILITY_OPTIONS: { k: Visibility; t: string; sub: string; i: string }[] = [
  { k: "amigos", t: "Solo amigos", sub: "Invitas tú directamente", i: "users" },
  { k: "club", t: "Club abierto", sub: "Visible para tu club", i: "building-2" },
  { k: "public", t: "Público", sub: "Cualquiera puede unirse", i: "globe" },
];

function Step3({
  form,
  set,
  currentUserId,
}: {
  form: Form;
  set: Setter;
  currentUserId: string | null;
}) {
  const pickerLabel =
    form.mode === "singles" ? "Tu rival" : "Pareja + rivales (3 jugadores)";
  const pickerMax = form.mode === "singles" ? 1 : 3;
  const excludeIds = currentUserId ? [currentUserId] : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div className="label-mp" style={{ marginBottom: 12 }}>
          Visibilidad
        </div>
        <div className="mp-grid-form-3 gap-2.5">
          {VISIBILITY_OPTIONS.map((o) => (
            <PickCard
              key={o.k}
              active={form.visibility === o.k}
              accent
              onClick={() => set("visibility", o.k)}
            >
              <Icon name={o.i} size={18} color="var(--primary)" />
              <div
                className="font-heading"
                style={{ fontSize: 14, fontWeight: 900, marginTop: 8 }}
              >
                {o.t}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{o.sub}</div>
            </PickCard>
          ))}
        </div>
      </div>
      {currentUserId == null ? (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: "1px dashed var(--border)",
            background: "#fafafa",
            fontSize: 12.5,
            color: "var(--muted-fg)",
          }}
        >
          Inicia sesión para invitar jugadores a tu match.
        </div>
      ) : (
        <PlayerPicker
          label={pickerLabel}
          max={pickerMax}
          selected={form.picks}
          onChange={(p) => set("picks", p)}
          excludeIds={excludeIds}
        />
      )}
      {form.mode !== "singles" && (
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: -10 }}>
          Orden esperado: el primero que selecciones será tu pareja; los dos
          siguientes serán los rivales.
        </div>
      )}
      <div style={{ marginTop: 4 }}>
        <RankedBadge />
      </div>
      <CMField
        label="Mensaje al equipo (opcional)"
        hint="Lo verán los invitados al recibir la notificación"
      >
        <textarea
          style={{ ...cmInp, minHeight: 60, resize: "vertical" }}
          placeholder="Vamos por la revancha del último set 🔥"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </CMField>
    </div>
  );
}

const SPORT_NAME: Record<Sport, string> = {
  padel: "Pádel",
  tenis: "Tenis",
  pickleball: "Pickleball",
};
const MODE_NAME: Record<Mode, string> = {
  singles: "Singles",
  dobles: "Dobles",
  mixto: "Mixto",
};
const VIS_NAME: Record<Visibility, string> = {
  amigos: "Solo amigos",
  club: "Club abierto",
  public: "Público",
};

function Step4({ form }: { form: Form }) {
  const sportName = SPORT_NAME[form.sport];
  const modeName = MODE_NAME[form.mode];
  const visName = VIS_NAME[form.visibility];
  const fmtDate = new Date(form.date + "T00:00").toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const costKnown = form.totalCost > 0;
  const perPlayer = costKnown
    ? form.splitCost
      ? (form.totalCost / (form.picks.length + 1)).toFixed(2)
      : form.totalCost.toFixed(2)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
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
            fontSize: 180,
            color: "rgba(255,255,255,0.07)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(10%, -10%)",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          {sportName.slice(0, 5)}
        </div>
        <div style={{ position: "relative", padding: 24 }}>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>
            Tu match
          </div>
          <h3
            className="font-heading"
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "6px 0 0",
            }}
          >
            {sportName} · {modeName}
            <span style={{ color: "#fbbf24" }}>.</span>
          </h3>
          <div
            style={{
              display: "flex",
              gap: 18,
              marginTop: 12,
              fontSize: 12.5,
              color: "rgba(255,255,255,0.85)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="calendar" size={13} color="#fff" />
              {fmtDate}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="clock" size={13} color="#fff" />
              {form.time} · {form.duration} min
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="map-pin" size={13} color="#fff" />
              {form.clubName || "Sin club"}
            </span>
          </div>
        </div>
      </div>

      <div className="mp-grid-form-2 gap-3">
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            Configuración
          </div>
          {form.level ? <Row k="Nivel" v={form.level} /> : null}
          <Row k="Visibilidad" v={visName} />
          <Row k="Cancha" v={form.courtLabel || "—"} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            Costo
          </div>
          <Row
            k="Total cancha"
            v={costKnown ? "$" + form.totalCost.toFixed(2) : "Por confirmar en el club"}
          />
          <Row k="Modalidad" v={form.splitCost ? "Dividir entre todos" : "Pago organizador"} />
          {costKnown && perPlayer ? (
            <Row k="Por jugador" v={"$" + perPlayer} accent />
          ) : null}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="label-mp" style={{ marginBottom: 10 }}>
          Jugadores ({form.picks.length})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {form.picks.map((p) => (
            <span
              key={p.id}
              style={{
                padding: "6px 11px",
                borderRadius: 9999,
                background: "var(--muted)",
                fontSize: 11.5,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="user" size={10} />
              {p.displayName}
            </span>
          ))}
          {form.picks.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              Aún no seleccionas jugadores · vuelve al paso 3.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        fontSize: 12.5,
        borderTop: "1px dashed var(--border)",
      }}
    >
      <span style={{ color: "var(--muted-fg)" }}>{k}</span>
      <span style={{ fontWeight: 900, color: accent ? "var(--primary)" : "#0a0a0a" }}>{v}</span>
    </div>
  );
}

function DoneScreen({ form }: { form: Form }) {
  const fmtDate = new Date(form.date + "T00:00").toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "#ecfdf5",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Icon name="check-circle-2" size={36} color="var(--primary)" />
      </div>
      <h3
        className="font-heading"
        style={{
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        ¡Match agendado!<span className="dot">.</span>
      </h3>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--muted-fg)",
          maxWidth: 440,
          margin: "10px auto 18px",
          lineHeight: 1.5,
        }}
      >
        Enviamos invitaciones a {form.picks.length} jugadores. Recibirás una notificación cuando
        confirmen su asistencia. Puedes ver y editar el match desde Inicio.
      </p>
      <div
        style={{
          display: "inline-flex",
          gap: 14,
          padding: "10px 18px",
          borderRadius: 10,
          background: "var(--muted)",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="calendar" size={12} />
          {fmtDate}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="clock" size={12} />
          {form.time}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="map-pin" size={12} />
          {form.clubName || "Sin club"}
        </span>
      </div>
    </div>
  );
}
