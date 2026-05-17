// RetarModal — migrado 1:1 desde ui_kits/dashboard/RetarModal.jsx
// Escucha window event 'mp-open-retar' con detail = { name, level, sport, city, av, avBg }
"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Rival = {
  name: string;
  level: number;
  sport?: string;
  city?: string;
  av?: string;
  avBg: string;
};

type Form = {
  mode: "singles" | "dobles";
  bestOf: 1 | 3 | 5;
  ranked: boolean;
  stakes: "none" | "bragging" | "dinner" | "custom";
  customStakes: string;
  date: "hoy" | "mañ" | "sab" | "dom";
  time: string;
  club: string;
  msg: string;
  yourPartner: string;
  theirPartner: string;
};

const INITIAL_FORM: Form = {
  mode: "singles",
  bestOf: 3,
  ranked: true,
  stakes: "none",
  customStakes: "",
  date: "sab",
  time: "19:00",
  club: "Club Norte Pickleball",
  msg: "",
  yourPartner: "",
  theirPartner: "",
};

const YOU = {
  name: "Camila Aguilar",
  level: 4.0,
  av: "CA",
  avBg: "linear-gradient(135deg,#10b981,#047857)",
};
const H2H = { you: 3, rival: 2, total: 5, streak: "2 victorias seguidas" };

export function RetarModal() {
  const [open, setOpen] = useState(false);
  const [rival, setRival] = useState<Rival | null>(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<Form>(INITIAL_FORM);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Partial<Rival>>).detail;
      setRival({
        name: detail?.name || "Andrés Vega",
        level: detail?.level ?? 4.5,
        sport: detail?.sport || "Pádel",
        city: detail?.city || "Cumbayá",
        av: detail?.av || "AV",
        avBg: detail?.avBg || "linear-gradient(135deg,#ca8a04,#facc15)",
      });
      setOpen(true);
      setStep(0);
      setDone(false);
      setForm(INITIAL_FORM);
    };
    window.addEventListener("mp-open-retar", handler);
    return () => window.removeEventListener("mp-open-retar", handler);
  }, []);

  if (!open || !rival) return null;
  const close = () => setOpen(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div
      onClick={close}
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
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
        }}
      >
        <RTHero rival={rival} done={done} onClose={close} />

        {!done && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 24px",
              borderBottom: "1px solid var(--border)",
              background: "#fff",
            }}
          >
            {["Reglas", "Cuándo & dónde"].map((s, i) => {
              const dn = i < step;
              const cur = i === step;
              return (
                <div key={s} style={{ display: "contents" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      opacity: dn || cur ? 1 : 0.45,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: dn ? "var(--primary)" : cur ? "#0a0a0a" : "#fff",
                        border: dn || cur ? "0" : "1px solid var(--border)",
                        color: dn || cur ? "#fff" : "#0a0a0a",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 900,
                        fontFamily: "Plus Jakarta Sans",
                      }}
                    >
                      {dn ? "✓" : i + 1}
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
                  {i < 1 && (
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

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {done ? (
            <RTDone you={YOU} rival={rival} form={form} onClose={close} />
          ) : step === 0 ? (
            <RTStep1 form={form} set={set} rival={rival} />
          ) : (
            <RTStep2 form={form} set={set} rival={rival} />
          )}
        </div>

        {!done && (
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#0a0a0a",
              color: "#fff",
            }}
          >
            <button
              onClick={() => (step === 0 ? close() : setStep(0))}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 9999,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="arrow-left" size={12} color="#fff" />
              {step === 0 ? "Cancelar" : "Atrás"}
            </button>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.6)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              {step === 0 ? "1 · Reglas del duelo" : "2 · Acuerda cuándo"}
            </div>
            <button
              onClick={() => (step === 1 ? setDone(true) : setStep(1))}
              className="btn btn-primary"
              style={{ padding: "9px 18px" }}
            >
              {step === 1 ? (
                <>
                  <Icon name="swords" size={13} color="#fff" />
                  Enviar reto
                </>
              ) : (
                <>
                  Siguiente
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

function RTHero({ rival, done, onClose }: { rival: Rival; done: boolean; onClose: () => void }) {
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 24px 18px",
        background: done
          ? "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)"
          : "linear-gradient(135deg, #0a0a0a 0%, #1f1f23 60%, #7c2d12 100%)",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          fontFamily: "Plus Jakarta Sans",
          fontWeight: 900,
          fontSize: 200,
          color: "rgba(255,255,255,0.05)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          pointerEvents: "none",
        }}
      >
        VS
      </div>
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
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
        <Icon name="x" size={13} color="#fff" />
      </button>
      <div className="label-mp" style={{ color: done ? "#fbbf24" : "var(--primary)" }}>
        ● {done ? "Reto enviado" : "Duelo · " + (rival.sport || "Pickleball")}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginTop: 14,
          gap: 14,
          position: "relative",
        }}
      >
        {/* You */}
        <AvatarBlock who={YOU} side="you" />
        {/* Score */}
        <div style={{ textAlign: "center", padding: "0 6px", flexShrink: 0 }}>
          <div
            className="font-heading"
            style={{
              fontSize: 38,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              color: "#fff",
            }}
          >
            <span style={{ color: "var(--primary)" }}>{H2H.you}</span>
            <span style={{ color: "rgba(255,255,255,0.4)", margin: "0 6px", fontSize: 22 }}>
              —
            </span>
            <span style={{ color: "#fbbf24" }}>{H2H.rival}</span>
          </div>
          <div
            style={{
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            Cara a cara · {H2H.total}
          </div>
          <div style={{ fontSize: 9, color: "var(--primary)", fontWeight: 800, marginTop: 4 }}>
            ● {H2H.streak}
          </div>
        </div>
        {/* Rival */}
        <AvatarBlock who={rival} side="rival" />
      </div>
    </div>
  );
}

function AvatarBlock({
  who,
  side,
}: {
  who: { name: string; level: number; av?: string; avBg: string };
  side: "you" | "rival";
}) {
  const isYou = side === "you";
  const av = who.av || who.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: isYou ? "flex-start" : "flex-end",
        gap: 8,
      }}
    >
      <div style={{ position: "relative", display: "inline-block" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: who.avBg,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid #fff",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          <span
            className="font-heading"
            style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}
          >
            {av}
          </span>
        </div>
        <span
          style={{
            position: "absolute",
            top: -4,
            [isYou ? "left" : "right"]: -4,
            padding: "2px 6px",
            borderRadius: 4,
            background: isYou ? "var(--primary)" : "#fbbf24",
            color: isYou ? "#fff" : "#0a0a0a",
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          {isYou ? "TÚ" : "RIVAL"}
        </span>
      </div>
      <div style={{ textAlign: isYou ? "left" : "right" }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.2 }}>{who.name}</div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 7px",
            background: "rgba(255,255,255,0.12)",
            borderRadius: 9999,
            fontSize: 9.5,
            fontWeight: 800,
            marginTop: 4,
          }}
        >
          <Icon name="zap" size={9} color="#fbbf24" />
          Nivel {who.level}
        </div>
      </div>
    </div>
  );
}

function RTStep1({
  form,
  set,
  rival,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  rival: Rival;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="label-mp">Modalidad</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { k: "singles" as const, l: "Singles", s: "1v1 · tú vs " + rival.name.split(" ")[0], i: "user" },
          { k: "dobles" as const, l: "Dobles", s: "2v2 · eliges tu partner", i: "users" },
        ].map((o) => {
          const on = form.mode === o.k;
          return (
            <button
              key={o.k}
              onClick={() => set("mode", o.k)}
              style={{
                padding: 11,
                borderRadius: 10,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: on ? "var(--primary)" : "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={o.i} size={14} color={on ? "#fff" : "#0a0a0a"} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900 }}>{o.l}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{o.s}</div>
              </div>
            </button>
          );
        })}
      </div>

      {form.mode === "dobles" && (
        <div
          style={{
            padding: 12,
            background: "var(--muted)",
            borderRadius: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div>
            <div className="label-mp" style={{ marginBottom: 5 }}>
              Tu partner
            </div>
            <select
              value={form.yourPartner}
              onChange={(e) => set("yourPartner", e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "inherit",
                background: "#fff",
              }}
            >
              <option value="">Sin elegir aún…</option>
              <option>Diego Carrasco · 4.0</option>
              <option>Camila Reyes · 3.5</option>
              <option>Felipe Donoso · 4.1</option>
            </select>
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 5 }}>
              Partner del rival
            </div>
            <select
              value={form.theirPartner}
              onChange={(e) => set("theirPartner", e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "inherit",
                background: "#fff",
              }}
            >
              <option value="">Lo elige él/ella</option>
              <option>Sugerir Joaquín Silva · 4.3</option>
              <option>Sugerir Matías Rojas · 4.6</option>
            </select>
          </div>
        </div>
      )}

      <div className="label-mp" style={{ marginTop: 4 }}>
        Formato
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { b: 1 as const, l: "Set único" },
          { b: 3 as const, l: "Mejor de 3" },
          { b: 5 as const, l: "Mejor de 5" },
        ].map((o) => {
          const on = form.bestOf === o.b;
          return (
            <button
              key={o.b}
              onClick={() => set("bestOf", o.b)}
              style={{
                flex: 1,
                padding: "9px 6px",
                borderRadius: 8,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                className="font-heading"
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: on ? "var(--primary)" : "#0a0a0a",
                }}
              >
                {o.b === 1 ? "1" : "BO" + o.b}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>{o.l}</div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => set("ranked", !form.ranked)}
        style={{
          padding: 12,
          borderRadius: 10,
          border: form.ranked ? "2px solid var(--primary)" : "1px solid var(--border)",
          background: form.ranked ? "#ecfdf5" : "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          display: "flex",
          gap: 11,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 32,
            height: 18,
            borderRadius: 9999,
            background: form.ranked ? "var(--primary)" : "#d4d4d8",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: form.ranked ? 16 : 2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              transition: "left 0.2s",
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>Cuenta para el ranking</div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
            Tu nivel sube o baja según el resultado · diferencia esperada ±0.08
          </div>
        </div>
        {form.ranked && (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 9999,
              background: "var(--primary)",
              color: "#fff",
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: "0.14em",
              flexShrink: 0,
            }}
          >
            RANKED
          </span>
        )}
      </button>

      <div className="label-mp" style={{ marginTop: 4 }}>
        ¿Qué se juega? · opcional
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {[
          { k: "none" as const, l: "Nada", i: "circle-dashed" },
          { k: "bragging" as const, l: "Bragging rights", i: "crown" },
          { k: "dinner" as const, l: "Cena", i: "utensils" },
          { k: "custom" as const, l: "Custom", i: "sparkles" },
        ].map((o) => {
          const on = form.stakes === o.k;
          return (
            <button
              key={o.k}
              onClick={() => set("stakes", o.k)}
              style={{
                padding: "10px 6px",
                borderRadius: 8,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "center",
              }}
            >
              <Icon name={o.i} size={13} color={on ? "var(--primary)" : "#0a0a0a"} />
              <div style={{ fontSize: 10, fontWeight: 800, marginTop: 5 }}>{o.l}</div>
            </button>
          );
        })}
      </div>
      {form.stakes === "custom" && (
        <input
          value={form.customStakes}
          onChange={(e) => set("customStakes", e.target.value)}
          placeholder="Ej. quien pierde paga el Uber del próximo match…"
          style={{
            padding: "9px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "inherit",
            background: "#fff",
          }}
        />
      )}
    </div>
  );
}

function RTStep2({
  form,
  set,
  rival,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  rival: Rival;
}) {
  const days = [
    { k: "hoy" as const, d: "HOY", n: "12 may", avail: false },
    { k: "mañ" as const, d: "MAR", n: "13 may", avail: true },
    { k: "sab" as const, d: "SÁB", n: "17 may", avail: true, hot: true },
    { k: "dom" as const, d: "DOM", n: "18 may", avail: true },
  ];
  // Slots alineados con la convención de booking: cada hora 09:00–21:00.
  const slots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="label-mp">¿Cuándo?</div>
      <div style={{ display: "flex", gap: 6 }}>
        {days.map((d) => {
          const on = form.date === d.k;
          return (
            <button
              key={d.k}
              onClick={() => set("date", d.k)}
              style={{
                flex: 1,
                padding: "10px 4px",
                borderRadius: 8,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                position: "relative",
              }}
            >
              {d.hot && (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: 4,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: "#fbbf24",
                    color: "#0a0a0a",
                    fontSize: 7.5,
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                  }}
                >
                  SUGERIDO
                </span>
              )}
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: "var(--muted-fg)",
                  letterSpacing: "0.1em",
                }}
              >
                {d.d}
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em" }}
              >
                {d.n}
              </div>
              <div
                style={{
                  fontSize: 8.5,
                  color: d.avail ? "var(--primary)" : "#dc2626",
                  fontWeight: 800,
                  marginTop: 3,
                }}
              >
                {d.avail ? "● libre" : "○ ocupado"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="label-mp" style={{ marginTop: 4 }}>
        Hora
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5 }}>
        {slots.map((t) => {
          const on = form.time === t;
          return (
            <button
              key={t}
              onClick={() => set("time", t)}
              style={{
                padding: "9px 4px",
                borderRadius: 8,
                border: on ? "2px solid var(--primary)" : "1px solid rgba(16,185,129,0.3)",
                background: on ? "var(--primary)" : "#ecfdf5",
                color: on ? "#fff" : "#065f46",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 900,
                fontFamily: "inherit",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="label-mp" style={{ marginTop: 4 }}>
        Cancha
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg,#10b981,#064e3b)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          <Icon name="building-2" size={14} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>{form.club}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            Cumbayá · 4 canchas · favorito de {rival.name.split(" ")[0]}
          </div>
        </div>
        <button
          style={{
            padding: "6px 11px",
            background: "var(--muted)",
            border: 0,
            borderRadius: 9999,
            fontSize: 10,
            fontWeight: 800,
            fontFamily: "inherit",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Cambiar
        </button>
      </div>

      <div className="label-mp" style={{ marginTop: 4 }}>
        Mensaje · opcional
      </div>
      <div style={{ position: "relative" }}>
        <textarea
          value={form.msg}
          onChange={(e) => set("msg", e.target.value)}
          placeholder={'"Vamos por la revancha del último set 🔥"'}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12.5,
            fontFamily: "inherit",
            background: "#fff",
            minHeight: 60,
            resize: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 12,
            fontSize: 9.5,
            color: "var(--muted-fg)",
          }}
        >
          {form.msg.length}/180
        </div>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {["Revancha 🔥", "Te aguanto", "Sin excusas", "Hagamos historia"].map((t) => (
          <button
            key={t}
            onClick={() => set("msg", (form.msg ? form.msg + " " : "") + t)}
            style={{
              padding: "4px 9px",
              borderRadius: 9999,
              background: "var(--muted)",
              border: 0,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const DAY_LABEL: Record<Form["date"], string> = {
  hoy: "Hoy",
  "mañ": "mar 13 may",
  sab: "sáb 17 may",
  dom: "dom 18 may",
};

function RTDone({
  you,
  rival,
  form,
  onClose,
}: {
  you: typeof YOU;
  rival: Rival;
  form: Form;
  onClose: () => void;
}) {
  const dayLabel = DAY_LABEL[form.date];
  const stakesLabel =
    form.stakes === "none"
      ? "—"
      : form.stakes === "bragging"
      ? "Bragging rights"
      : form.stakes === "dinner"
      ? "Cena"
      : form.customStakes || "Custom";

  return (
    <div>
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 14,
          background: "#ecfdf5",
          border: "1px solid var(--primary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--primary)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="send-horizonal" size={17} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              ¡Reto enviado!<span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div style={{ fontSize: 11.5, color: "#065f46", marginTop: 3 }}>
              {rival.name} recibió tu reto. Tienes hasta 24 h para que conteste — si no, expira.
            </div>
          </div>
        </div>
      </div>

      <div className="label-mp" style={{ marginBottom: 8 }}>
        Resumen del duelo
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        {[
          ["Modalidad", form.mode === "singles" ? "Singles · 1v1" : "Dobles · 2v2"],
          ["Formato", form.bestOf === 1 ? "Set único" : "Mejor de " + form.bestOf + " sets"],
          ["Ranked", form.ranked ? "Sí · cuenta para el ranking" : "No · friendly match"],
          ["Stakes", stakesLabel],
          ["Cuándo", dayLabel + " · " + form.time],
          ["Cancha", form.club],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "5px 0",
              fontSize: 11.5,
              borderTop: "1px dashed var(--border)",
            }}
          >
            <span style={{ color: "var(--muted-fg)" }}>{k}</span>
            <span style={{ fontWeight: 800 }}>{v}</span>
          </div>
        ))}
        {form.msg && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "#fafafa",
              borderRadius: 8,
              fontSize: 11.5,
              fontStyle: "italic",
              color: "#0a0a0a",
              borderLeft: "3px solid var(--primary)",
            }}
          >
            &quot;{form.msg}&quot;
          </div>
        )}
      </div>

      <div className="label-mp" style={{ marginBottom: 8 }}>
        Lo que ve {rival.name.split(" ")[0]}
      </div>
      <div style={{ padding: 14, background: "#0a0a0a", color: "#fff", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "var(--primary)", fontSize: 12, fontWeight: 900 }}>●</span>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9.5,
                color: "rgba(255,255,255,0.5)",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              MATCHPOINT · ahora
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.4 }}>
              <b>{you.name}</b> te retó a un duelo · {form.mode === "singles" ? "1v1" : "2v2"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              {dayLabel} · {form.time} · {form.club}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button
                style={{
                  padding: "6px 12px",
                  borderRadius: 9999,
                  background: "var(--primary)",
                  color: "#fff",
                  border: 0,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  cursor: "default",
                  display: "inline-flex",
                  gap: 5,
                  alignItems: "center",
                }}
              >
                <Icon name="swords" size={11} color="#fff" />
                Aceptar reto
              </button>
              <button
                style={{
                  padding: "6px 12px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.25)",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  cursor: "default",
                }}
              >
                Proponer otra hora
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            flex: 1,
            justifyContent: "center",
          }}
          onClick={onClose}
        >
          Cerrar
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={onClose}
        >
          <Icon name="message-circle" size={13} color="#fff" />
          Ir al chat del duelo
        </button>
      </div>
    </div>
  );
}
