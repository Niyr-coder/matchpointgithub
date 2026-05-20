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
import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { createMatch } from "@/server/actions/matches";
import { PlayerPicker, type Player } from "@/components/dashboard/widgets/PlayerPicker";
import { RankedBadge } from "@/components/dashboard/widgets/RankedBadge";
import { useEnabledSports } from "@/components/SportsProvider";

type Sport = "pickleball" | "padel" | "tenis";
type Mode = "singles" | "dobles" | "mixto";
type Visibility = "amigos" | "club" | "public";

type Form = {
  sport: Sport;
  mode: Mode;
  date: string;
  time: string;
  duration: number;
  club: string;
  court: string;
  visibility: Visibility;
  level: string;
  splitCost: boolean;
  totalCost: number;
  notes: string;
  // Jugadores reales seleccionados con el PlayerPicker.
  //  · singles: 1 elemento (el rival).
  //  · doubles / mixto: 3 elementos en este orden [partner, rivalA, rivalB].
  picks: Player[];
};

const INITIAL_FORM: Form = {
  sport: "pickleball",
  mode: "dobles",
  date: "2026-05-12",
  time: "19:00",
  duration: 60,
  club: "Club Norte Pickleball",
  court: "Cancha 3",
  visibility: "amigos",
  level: "3.5-4.0",
  splitCost: true,
  totalCost: 24,
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
      setForm(INITIAL_FORM);
    };
    window.addEventListener("mp-open-crear-match", handler);
    return () => window.removeEventListener("mp-open-crear-match", handler);
  }, []);

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
    startSubmit(async () => {
      // Combina date + time en horario local del navegador.
      const playedAt = new Date(`${form.date}T${form.time}:00`).toISOString();
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
        // TODO: cuando exista selector real de club/cancha, pasar UUIDs reales.
        clubId: null,
        courtId: null,
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
          maxWidth: 760,
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
            padding: "20px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
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
          <div
            style={{
              padding: "14px 28px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 0,
              alignItems: "center",
            }}
          >
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
                    }}
                  >
                    {i < step ? <Icon name="check" size={11} color="#fff" /> : i + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: i === step ? 900 : 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {s}
                  </span>
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
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
          {done ? (
            <DoneScreen form={form} />
          ) : step === 0 ? (
            <Step1 form={form} set={set} />
          ) : step === 1 ? (
            <Step2 form={form} set={set} />
          ) : step === 2 ? (
            <Step3 form={form} set={set} currentUserId={currentUserId} />
          ) : (
            <Step4 form={form} />
          )}
        </div>

        <div
          style={{
            padding: "16px 28px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            background: "#fafafa",
          }}
        >
          {done ? (
            <>
              <button
                className="btn"
                onClick={close}
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                Cerrar
              </button>
              <button className="btn btn-primary" onClick={close}>
                <Icon name="message-circle" size={13} color="#fff" />
                Ir al chat del match
              </button>
            </>
          ) : (
            <>
              <button
                className="btn"
                onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                <Icon name="arrow-left" size={13} />
                {step === 0 ? "Cancelar" : "Atrás"}
              </button>
              <button
                className="btn btn-primary"
                disabled={step === 3 && (submitting || !canSubmit)}
                onClick={() => {
                  if (step !== 3) {
                    setStep((s) => s + 1);
                    return;
                  }
                  handleSubmit();
                }}
                style={
                  step === 3 && !canSubmit
                    ? { opacity: 0.55, cursor: "not-allowed" }
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
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
        <div className="label-mp" style={{ marginBottom: 12 }}>
          Nivel sugerido
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => set("level", l)}
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

// Slots alineados con la convención de booking: cada hora 09:00–21:00.
const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];
const CLUBS = [
  { n: "Club Norte Pickleball", d: "Cumbayá · 8 km", price: "$24/h" },
  { n: "MatchPoint Quito", d: "La Carolina · 4 km", price: "$28/h" },
  { n: "Smash Sport Cumbayá", d: "Cumbayá · 12 km", price: "$22/h" },
  { n: "Pickle Club Guayaquil", d: "Samborondón · 6 km", price: "$26/h" },
];

function Step2({ form, set }: { form: Form; set: Setter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <CMField label="Fecha">
          <input
            type="date"
            style={cmInp}
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </CMField>
        <CMField label="Duración">
          <select
            style={cmInp}
            value={form.duration}
            onChange={(e) => set("duration", +e.target.value)}
          >
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
          </select>
        </CMField>
      </div>
      <div>
        <div className="label-mp" style={{ marginBottom: 10 }}>
          Hora de inicio
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {TIME_SLOTS.map((s) => (
            <button
              key={s}
              onClick={() => set("time", s)}
              style={{
                padding: "10px 8px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                background: form.time === s ? "var(--primary)" : "#fff",
                color: form.time === s ? "#fff" : "#0a0a0a",
                border: "1px solid " + (form.time === s ? "var(--primary)" : "var(--border)"),
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div className="label-mp">Club</div>
          <div style={{ position: "relative" }}>
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
              style={{
                ...cmInp,
                padding: "7px 10px 7px 28px",
                fontSize: 12,
                width: 180,
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CLUBS.map((c) => (
            <button
              key={c.n}
              onClick={() => set("club", c.n)}
              style={{
                padding: 12,
                borderRadius: 10,
                border: form.club === c.n ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: form.club === c.n ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>{c.n}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{c.d}</div>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--primary)" }}>
                {c.price}
              </div>
            </button>
          ))}
        </div>
      </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
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
  const perPlayer = form.splitCost
    ? (form.totalCost / (form.picks.length + 1)).toFixed(2)
    : form.totalCost.toFixed(2);

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
              {form.club}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            Configuración
          </div>
          <Row k="Nivel" v={form.level} />
          <Row k="Visibilidad" v={visName} />
          <Row k="Cancha" v={form.court} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            Costo
          </div>
          <Row k="Total cancha" v={"$" + form.totalCost.toFixed(2)} />
          <Row k="Modalidad" v={form.splitCost ? "Dividir entre todos" : "Pago organizador"} />
          <Row k="Por jugador" v={"$" + perPlayer} accent />
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
          {form.club}
        </span>
      </div>
    </div>
  );
}
