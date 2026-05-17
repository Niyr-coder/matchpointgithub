// CrearJuegoModal — migrado 1:1 desde ui_kits/dashboard/CrearJuegoModal.jsx
// Round Robin / KOTC wizard. Escucha 'mp-open-crear-juego'.
"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";

type GType = "rr" | "kotc";
type Fmt = "singles" | "dobles" | "mixto";
type System = "weighted" | "classic";
type TeamMode = "manual" | "random" | "balanced";
type LiveTab = "teams" | "matches" | "standings";

type Form = {
  type: GType;
  fmt: Fmt;
  name: string;
  date: string;
  time: string;
  dur: number;
  club: string;
  players: number;
  rounds: number;
  scoreTo: 11 | 15 | 21;
  system: System;
  invited: string[];
  teamMode: TeamMode;
};

const INITIAL: Form = {
  type: "rr",
  fmt: "dobles",
  name: "Round Robin Cumbayá · Mayo",
  date: "2026-05-12",
  time: "19:00",
  dur: 120,
  club: "Club Norte Pickleball · Cancha 3",
  players: 8,
  rounds: 3,
  scoreTo: 11,
  system: "weighted",
  invited: ["Diego Carrasco", "Camila Reyes", "Andrés Vega", "Felipe Donoso", "Constanza R.", "Joaquín Silva", "Bárbara Núñez"],
  teamMode: "balanced",
};

const STEPS = ["Tipo", "Formato", "Detalles", "Jugadores", "Equipos"];

export function CrearJuegoModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState<LiveTab>("teams");
  const [form, setForm] = useState<Form>(INITIAL);

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setStep(0);
      setLive(false);
      setTab("teams");
      setForm(INITIAL);
    };
    window.addEventListener("mp-open-crear-juego", handler);
    return () => window.removeEventListener("mp-open-crear-juego", handler);
  }, []);

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
          maxWidth: 860,
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
          }}
        >
          <div>
            <div className="label-mp">{live ? "En vivo · Round Robin" : "Crear juego · Round Robin"}</div>
            <h2
              className="font-heading"
              style={{
                fontSize: 19,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              {live ? form.name : "Arma tu juego"}
              <span style={{ color: "var(--primary)" }}>.</span>
            </h2>
          </div>
          <button
            onClick={close}
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

        {!live ? (
          <div
            style={{
              padding: "12px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
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
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: done ? "var(--primary)" : cur ? "#0a0a0a" : "#fff",
                        border: done || cur ? "0" : "1px solid var(--border)",
                        color: done || cur ? "#fff" : "#0a0a0a",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 900,
                        fontFamily: "Plus Jakarta Sans",
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
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
                        margin: "0 10px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 24px" }}>
            {(
              [
                { k: "teams" as const, l: "Teams", i: "users" },
                { k: "matches" as const, l: "Matches", i: "swords" },
                { k: "standings" as const, l: "Standings", i: "list-ordered" },
              ] satisfies { k: LiveTab; l: string; i: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                style={{
                  padding: "12px 18px",
                  background: "transparent",
                  border: 0,
                  borderBottom: "2px solid " + (tab === t.k ? "#0a0a0a" : "transparent"),
                  color: tab === t.k ? "#0a0a0a" : "var(--muted-fg)",
                  fontWeight: tab === t.k ? 900 : 600,
                  fontSize: 11.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  marginBottom: -1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name={t.i} size={12} />
                {t.l}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {live ? (
            tab === "teams" ? (
              <CJTeamsLive />
            ) : tab === "matches" ? (
              <CJMatchesLive />
            ) : (
              <CJStandingsLive />
            )
          ) : step === 0 ? (
            <CJ_S1 form={form} set={set} />
          ) : step === 1 ? (
            <CJ_S2 form={form} set={set} />
          ) : step === 2 ? (
            <CJ_S3 form={form} set={set} />
          ) : step === 3 ? (
            <CJ_S4 form={form} set={set} />
          ) : (
            <CJ_S5 form={form} set={set} />
          )}
        </div>

        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            background: "#fafafa",
          }}
        >
          {live ? (
            <>
              <button
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
                onClick={close}
              >
                <Icon name="x" size={13} />
                Cerrar
              </button>
              <button className="btn btn-primary">
                <Icon name="play" size={13} color="#fff" />
                Empezar match 1
              </button>
            </>
          ) : (
            <>
              <button
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
                onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
              >
                <Icon name="arrow-left" size={13} />
                {step === 0 ? "Cancelar" : "Atrás"}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => (step === 4 ? setLive(true) : setStep((s) => s + 1))}
              >
                {step === 4 ? (
                  <>
                    <Icon name="play" size={13} color="#fff" />
                    Iniciar Round Robin
                  </>
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

const cjGhost: CSSProperties = { background: "#fff", border: "1px solid var(--border)" };
const cjInp: CSSProperties = {
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 12.5,
  outline: "none",
  background: "#fff",
  width: "100%",
};

function CJPick({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 14,
        border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
        borderRadius: 12,
        background: active ? "#ecfdf5" : "#fff",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        position: "relative",
      }}
    >
      {children}
    </button>
  );
}

function CJField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label
        style={{
          fontSize: 10,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#0a0a0a",
        }}
      >
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{hint}</div>}
    </div>
  );
}

type Setter = <K extends keyof Form>(k: K, v: Form[K]) => void;

function CJ_S1({ form, set }: { form: Form; set: Setter }) {
  const types: { k: GType; t: string; sub: string; desc: string; i: string; badge?: string }[] = [
    { k: "rr", t: "Round Robin", sub: "Todos contra todos", desc: "Cada equipo enfrenta a los demás. Standings por winrate ponderado.", i: "shuffle", badge: "Más popular" },
    { k: "kotc", t: "King of the Court", sub: "El que gana se queda", desc: "Reto contínuo a la cancha del rey. Ideal para sesiones rápidas.", i: "crown" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="label-mp" style={{ marginBottom: 4 }}>
          Paso 1 · ¿Qué tipo de juego?
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: 0 }}>
          Elige el formato. Después definimos modalidad, jugadores y equipos.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {types.map((t) => (
          <CJPick key={t.k} active={form.type === t.k} onClick={() => set("type", t.k)}>
            {t.badge && (
              <span
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  fontSize: 8.5,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  padding: "3px 7px",
                  borderRadius: 9999,
                  background: "#0a0a0a",
                  color: "#fff",
                  zIndex: 2,
                }}
              >
                {t.badge}
              </span>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: form.type === t.k ? "var(--primary)" : "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={t.i} size={17} color={form.type === t.k ? "#fff" : "#0a0a0a"} />
              </div>
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.015em",
                textTransform: "uppercase",
              }}
            >
              {t.t}
              <span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: "var(--primary)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: "3px 0 6px",
              }}
            >
              {t.sub}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
              {t.desc}
            </div>
          </CJPick>
        ))}
      </div>
      <div
        style={{
          padding: 12,
          background: "#0a0a0a",
          color: "#fff",
          borderRadius: 10,
          display: "flex",
          gap: 10,
        }}
      >
        <span style={{ flexShrink: 0, marginTop: 2 }}>
          <Icon name="info" size={14} color="var(--primary)" />
        </span>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
          Score por <b style={{ color: "#fff" }}>winrate ponderado</b>: ganar 11-3 vale más que
          ganar 11-9.
        </div>
      </div>
    </div>
  );
}

function CJ_S2({ form, set }: { form: Form; set: Setter }) {
  const fmts: { k: Fmt; t: string; sub: string; need: string; i: string }[] = [
    { k: "singles", t: "Singles", sub: "1 vs 1", need: "Mín. 4 jugadores", i: "user" },
    { k: "dobles", t: "Dobles", sub: "2 vs 2", need: "Mín. 8 jugadores", i: "users" },
    { k: "mixto", t: "Mixto", sub: "Parejas mixtas", need: "Mín. 8 (4F + 4M)", i: "user-round" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="label-mp" style={{ marginBottom: 4 }}>
          Paso 2 · Modalidad
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: 0 }}>
          Cómo se enfrentan los jugadores en cada match.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {fmts.map((f) => (
          <CJPick key={f.k} active={form.fmt === f.k} onClick={() => set("fmt", f.k)}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: form.fmt === f.k ? "var(--primary)" : "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Icon name={f.i} size={16} color={form.fmt === f.k ? "#fff" : "#0a0a0a"} />
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: "-0.015em",
                textTransform: "uppercase",
              }}
            >
              {f.t}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--primary)", fontWeight: 800, marginTop: 2 }}>
              {f.sub}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--muted-fg)",
                marginTop: 7,
                padding: "5px 9px",
                background: "var(--muted)",
                borderRadius: 6,
                fontWeight: 700,
              }}
            >
              {f.need}
            </div>
          </CJPick>
        ))}
      </div>
    </div>
  );
}

function CJ_S3({ form, set }: { form: Form; set: Setter }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <CJField label="Nombre de la sesión">
        <input style={cjInp} value={form.name} onChange={(e) => set("name", e.target.value)} />
      </CJField>
      <CJField label="Deporte">
        <div
          style={{
            padding: "9px 11px",
            border: "1.5px solid var(--primary)",
            borderRadius: 8,
            background: "#ecfdf5",
            fontSize: 12.5,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>🏓</span> Pickleball
        </div>
      </CJField>
      <CJField label="Fecha">
        <input
          style={cjInp}
          type="date"
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </CJField>
      <CJField label="Hora · duración">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input
            style={cjInp}
            type="time"
            value={form.time}
            onChange={(e) => set("time", e.target.value)}
          />
          <select
            style={cjInp}
            value={form.dur}
            onChange={(e) => set("dur", +e.target.value)}
          >
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
            <option value={180}>3 horas</option>
          </select>
        </div>
      </CJField>
      <CJField label="Club / cancha">
        <input style={cjInp} value={form.club} onChange={(e) => set("club", e.target.value)} />
      </CJField>
      <CJField label="# jugadores" hint="Hasta 24 por sesión">
        <input
          style={cjInp}
          type="number"
          value={form.players}
          onChange={(e) => set("players", +e.target.value)}
        />
      </CJField>
      <CJField label="Rondas" hint="Auto-calculado por # equipos">
        <input
          style={cjInp}
          type="number"
          value={form.rounds}
          onChange={(e) => set("rounds", +e.target.value)}
        />
      </CJField>
      <CJField label="Score por match">
        <select
          style={cjInp}
          value={form.scoreTo}
          onChange={(e) => set("scoreTo", +e.target.value as 11 | 15 | 21)}
        >
          <option value={11}>A 11 pts · gana por 2</option>
          <option value={15}>A 15 pts</option>
          <option value={21}>A 21 pts</option>
        </select>
      </CJField>
      <div style={{ gridColumn: "1 / -1" }}>
        <CJField label="Sistema de puntaje" hint="Winrate ponderado: la diferencia de score importa.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(
              [
                { k: "weighted", l: "Winrate ponderado", d: "Score = victorias × (puntos ganados / total). 11-3 vale más que 11-9." },
                { k: "classic", l: "Puntos clásicos", d: "W = 3, D = 1, L = 0. Tiebreaker por diferencial." },
              ] as { k: System; l: string; d: string }[]
            ).map((o) => {
              const on = form.system === o.k;
              return (
                <button
                  key={o.k}
                  onClick={() => set("system", o.k)}
                  style={{
                    padding: 11,
                    borderRadius: 10,
                    border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: on ? "#ecfdf5" : "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.01em" }}>{o.l}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{o.d}</div>
                </button>
              );
            })}
          </div>
        </CJField>
      </div>
    </div>
  );
}

const CJ_FRIENDS = [
  { n: "Diego Carrasco", city: "Quito", lvl: 4.0, av: "linear-gradient(135deg,#0a0a0a,#374151)" },
  { n: "Camila Reyes", city: "Cumbayá", lvl: 3.5, av: "linear-gradient(135deg,#7c3aed,#db2777)" },
  { n: "Andrés Vega", city: "Quito", lvl: 4.5, av: "linear-gradient(135deg,#ca8a04,#facc15)" },
  { n: "Felipe Donoso", city: "Cumbayá", lvl: 4.1, av: "linear-gradient(135deg,#dc2626,#fb923c)" },
  { n: "Constanza R.", city: "Tumbaco", lvl: 3.6, av: "linear-gradient(135deg,#0891b2,#06b6d4)" },
  { n: "Joaquín Silva", city: "Cumbayá", lvl: 4.3, av: "linear-gradient(135deg,#10b981,#047857)" },
  { n: "Bárbara Núñez", city: "Quito", lvl: 3.9, av: "linear-gradient(135deg,#9333ea,#c026d3)" },
  { n: "Matías Rojas", city: "La Carolina", lvl: 4.6, av: "linear-gradient(135deg,#0ea5e9,#3b82f6)" },
  { n: "Renata Salas", city: "Cumbayá", lvl: 3.7, av: "linear-gradient(135deg,#f59e0b,#ef4444)" },
];

function CJ_S4({ form, set }: { form: Form; set: Setter }) {
  const toast = useToast();
  const toggle = (name: string) => {
    const has = form.invited.includes(name);
    set("invited", has ? form.invited.filter((n) => n !== name) : [...form.invited, name]);
  };
  const total = form.invited.length + 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="label-mp">
          {total} de {form.players} jugadores · {Math.max(0, form.players - total)} faltan
        </div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: 9, color: "var(--muted-fg)" }}>
            <Icon name="search" size={12} />
          </span>
          <input
            placeholder="Buscar nombre o email…"
            style={{ ...cjInp, padding: "7px 10px 7px 28px", fontSize: 11.5, width: 220 }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        {[
          { k: "amigos", l: "Amigos", n: 24, on: true },
          { k: "club", l: "Club", n: 86, on: false },
          { k: "search", l: "Buscar", on: false },
          { k: "csv", l: "Importar CSV", on: false },
        ].map((t) => (
          <button
            key={t.k}
            style={{
              padding: "9px 13px",
              background: "transparent",
              border: 0,
              borderBottom: "2px solid " + (t.on ? "#0a0a0a" : "transparent"),
              fontFamily: "inherit",
              fontSize: 10.5,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: t.on ? "#0a0a0a" : "var(--muted-fg)",
              cursor: "pointer",
              marginBottom: -1,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {t.l}
            {t.n != null && (
              <span
                style={{
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: t.on ? "#0a0a0a" : "var(--muted)",
                  color: t.on ? "#fff" : "var(--muted-fg)",
                  fontSize: 9,
                }}
              >
                {t.n}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {CJ_FRIENDS.map((f) => {
          const sel = form.invited.includes(f.n);
          return (
            <button
              key={f.n}
              onClick={() => toggle(f.n)}
              style={{
                padding: "7px 9px",
                borderRadius: 10,
                border: sel ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: sel ? "#ecfdf5" : "#fff",
                display: "flex",
                gap: 9,
                alignItems: "center",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: f.av,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Plus Jakarta Sans",
                  fontWeight: 900,
                  fontSize: 9.5,
                  flexShrink: 0,
                }}
              >
                {f.n
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {f.n}
                </div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>
                  {f.city} · Niv {f.lvl}
                </div>
              </div>
              {sel ? (
                <Icon name="check-circle-2" size={13} color="var(--primary)" />
              ) : (
                <Icon name="circle-plus" size={13} color="var(--muted-fg)" />
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: 11,
          background: "var(--muted)",
          borderRadius: 10,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Icon name="link" size={13} color="var(--muted-fg)" />
        <div style={{ flex: 1, fontSize: 11 }}>
          <b>Link de invitación</b> · matchpoint.app/j/RR-2614 · cualquiera puede sumarse
        </div>
        <button
          onClick={() => toast({ icon: "copy", title: "Link copiado", sub: "matchpoint.app/j/RR-2614" })}
          className="btn"
          style={{ ...cjGhost, fontSize: 10, padding: "5px 9px" }}
        >
          <Icon name="copy" size={10} />
          Copiar
        </button>
      </div>
    </div>
  );
}

const CJ_TEAMS = [
  { i: 1, p1: "Tú · 4.0", p2: "Joaquín · 4.3", avg: 4.15, color: "#10b981" },
  { i: 2, p1: "Diego · 4.0", p2: "Andrés · 4.5", avg: 4.25, color: "#0a0a0a" },
  { i: 3, p1: "Felipe · 4.1", p2: "Bárbara · 3.9", avg: 4.0, color: "#7c3aed" },
  { i: 4, p1: "Camila · 3.5", p2: "Constanza · 3.6", avg: 3.55, color: "#f59e0b" },
];

function CJ_S5({ form, set }: { form: Form; set: Setter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 4,
          background: "var(--muted)",
          borderRadius: 10,
        }}
      >
        {(
          [
            { k: "manual", l: "Manual", sub: "Arrastrar jugadores" },
            { k: "random", l: "Aleatorio", sub: "Random" },
            { k: "balanced", l: "Balanceado", sub: "Por nivel" },
          ] as { k: TeamMode; l: string; sub: string }[]
        ).map((o) => {
          const on = form.teamMode === o.k;
          return (
            <button
              key={o.k}
              onClick={() => set("teamMode", o.k)}
              style={{
                flex: 1,
                padding: "9px 11px",
                borderRadius: 8,
                border: 0,
                background: on ? "#fff" : "transparent",
                boxShadow: on ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: on ? 900 : 700 }}>{o.l}</div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{o.sub}</div>
            </button>
          );
        })}
        <button className="btn" style={{ ...cjGhost, fontSize: 10.5 }}>
          <Icon name="refresh-cw" size={11} />
          Re-balancear
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {CJ_TEAMS.map((t) => (
          <div
            key={t.i}
            className="card"
            style={{ padding: 12, position: "relative", borderLeft: "3px solid " + t.color }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: t.color,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 11,
                  }}
                >
                  {t.i}
                </div>
                <span
                  className="font-heading"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Equipo {t.i}
                </span>
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  padding: "2px 7px",
                  borderRadius: 9999,
                  background: "var(--muted)",
                  fontWeight: 800,
                }}
              >
                NIV {t.avg}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  padding: "6px 10px",
                  background: "var(--muted)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {t.p1}
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  background: "var(--muted)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {t.p2}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 11,
          background: "#0a0a0a",
          color: "#fff",
          borderRadius: 10,
          display: "flex",
          gap: 10,
        }}
      >
        <span style={{ marginTop: 2 }}>
          <Icon name="zap" size={14} color="var(--primary)" />
        </span>
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          4 equipos · 6 matches · 3 rondas. Cada equipo juega 3 veces.{" "}
          <b>Score promedio: 4.0</b> — diferencia 0.7.
        </div>
      </div>
    </div>
  );
}

// ── Live ──────────────────────────────────────────────────────────────
const CJ_LIVE_TEAMS = [
  { i: 1, name: "Verde Lima", avg: 4.15, players: [{ n: "Tú", lvl: 4.0 }, { n: "Joaquín Silva", lvl: 4.3 }], color: "#10b981" },
  { i: 2, name: "Negro Total", avg: 4.25, players: [{ n: "Diego", lvl: 4.0 }, { n: "Andrés", lvl: 4.5 }], color: "#0a0a0a" },
  { i: 3, name: "Púrpura Pro", avg: 4.0, players: [{ n: "Felipe", lvl: 4.1 }, { n: "Bárbara", lvl: 3.9 }], color: "#7c3aed" },
  { i: 4, name: "Amber Slam", avg: 3.55, players: [{ n: "Camila", lvl: 3.5 }, { n: "Constanza", lvl: 3.6 }], color: "#f59e0b" },
];

function CJTeamsLive() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {CJ_LIVE_TEAMS.map((t) => (
        <div
          key={t.i}
          className="card"
          style={{ padding: 14, position: "relative", borderLeft: "4px solid " + t.color }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: t.color,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Plus Jakarta Sans",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                {t.i}
              </div>
              <span
                className="font-heading"
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "-0.01em",
                }}
              >
                {t.name}
              </span>
            </div>
            <span
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 9999,
                background: "var(--muted)",
                fontWeight: 800,
              }}
            >
              NIV {t.avg}
            </span>
          </div>
          {t.players.map((p) => (
            <div
              key={p.n}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 10px",
                background: "var(--muted)",
                borderRadius: 6,
                marginBottom: 4,
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              <span>{p.n}</span>
              <span style={{ color: "var(--primary)" }}>{p.lvl}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const CJ_ROUNDS = [
  {
    r: 1,
    status: "done" as const,
    matches: [
      { a: "Verde Lima", b: "Negro Total", sa: 11, sb: 8, court: "C3" },
      { a: "Púrpura Pro", b: "Amber Slam", sa: 11, sb: 6, court: "C3" },
    ],
  },
  {
    r: 2,
    status: "live" as const,
    matches: [
      { a: "Verde Lima", b: "Púrpura Pro", sa: 7, sb: 5, court: "C3", live: true },
      { a: "Negro Total", b: "Amber Slam", sa: "-", sb: "-", court: "C3", upcoming: true },
    ],
  },
  {
    r: 3,
    status: "pending" as const,
    matches: [
      { a: "Verde Lima", b: "Amber Slam", sa: "-", sb: "-", court: "C3" },
      { a: "Negro Total", b: "Púrpura Pro", sa: "-", sb: "-", court: "C3" },
    ],
  },
];

function CJMatchesLive() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {CJ_ROUNDS.map((r) => (
        <div key={r.r}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span className="label-mp">Ronda {r.r}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                padding: "2px 7px",
                borderRadius: 9999,
                background:
                  r.status === "done"
                    ? "var(--primary)"
                    : r.status === "live"
                    ? "#fbbf24"
                    : "var(--muted)",
                color: r.status === "pending" ? "var(--muted-fg)" : "#fff",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {r.status === "done" ? "✓ Lista" : r.status === "live" ? "● En vivo" : "Próxima"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {r.matches.map((m, i) => {
              const live = "live" in m && m.live;
              return (
                <div
                  key={i}
                  className="card"
                  style={{
                    padding: 12,
                    position: "relative",
                    border: live ? "2px solid #fbbf24" : "1px solid var(--border)",
                    background: live ? "#fffbeb" : "#fff",
                  }}
                >
                  {live && (
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        fontSize: 8.5,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#fbbf24",
                        color: "#0a0a0a",
                        fontWeight: 900,
                        letterSpacing: "0.12em",
                      }}
                    >
                      ● LIVE
                    </span>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{m.a}</span>
                    <span
                      className="font-heading"
                      style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
                    >
                      {m.sa}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{m.b}</span>
                    <span
                      className="font-heading"
                      style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
                    >
                      {m.sb}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "var(--muted-fg)",
                      marginTop: 6,
                      fontWeight: 700,
                    }}
                  >
                    {m.court}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const CJ_STANDINGS = [
  { r: 1, team: "Negro Total", color: "#0a0a0a", w: 2, l: 0, pf: 22, pa: 11, wr: "100%", score: 200 },
  { r: 2, team: "Verde Lima", color: "#10b981", w: 1, l: 1, pf: 18, pa: 16, wr: "50%", score: 140 },
  { r: 3, team: "Púrpura Pro", color: "#7c3aed", w: 1, l: 1, pf: 16, pa: 17, wr: "50%", score: 95 },
  { r: 4, team: "Amber Slam", color: "#f59e0b", w: 0, l: 2, pf: 13, pa: 25, wr: "0%", score: 0 },
];

function CJStandingsLive() {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "10px 14px",
          display: "grid",
          gridTemplateColumns: "32px 1fr 50px 50px 70px 80px 70px",
          gap: 10,
          background: "var(--muted)",
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
        }}
      >
        <div>#</div>
        <div>Team</div>
        <div style={{ textAlign: "center" }}>W</div>
        <div style={{ textAlign: "center" }}>L</div>
        <div style={{ textAlign: "center" }}>Pts</div>
        <div style={{ textAlign: "center" }}>Winrate</div>
        <div style={{ textAlign: "right" }}>Score</div>
      </div>
      {CJ_STANDINGS.map((r) => (
        <div
          key={r.r}
          style={{
            padding: "11px 14px",
            display: "grid",
            gridTemplateColumns: "32px 1fr 50px 50px 70px 80px 70px",
            gap: 10,
            alignItems: "center",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background:
                r.r === 1
                  ? "#fbbf24"
                  : r.r === 2
                  ? "#9ca3af"
                  : r.r === 3
                  ? "#d97706"
                  : "var(--muted)",
              color: r.r <= 3 ? (r.r === 1 ? "#0a0a0a" : "#fff") : "var(--muted-fg)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 10,
            }}
          >
            {r.r}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: r.color }} />
            <span style={{ fontSize: 12, fontWeight: 800 }}>{r.team}</span>
          </div>
          <div
            className="font-heading"
            style={{ textAlign: "center", fontSize: 13, fontWeight: 900 }}
          >
            {r.w}
          </div>
          <div
            className="font-heading"
            style={{
              textAlign: "center",
              fontSize: 13,
              fontWeight: 900,
              color: r.l > 0 ? "#dc2626" : "inherit",
            }}
          >
            {r.l}
          </div>
          <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted-fg)" }}>
            {r.pf} / {r.pa}
          </div>
          <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 800 }}>{r.wr}</div>
          <div
            className="font-heading"
            style={{
              textAlign: "right",
              fontSize: 14,
              fontWeight: 900,
              color: "var(--primary)",
              letterSpacing: "-0.02em",
            }}
          >
            {r.score}
          </div>
        </div>
      ))}
    </div>
  );
}
