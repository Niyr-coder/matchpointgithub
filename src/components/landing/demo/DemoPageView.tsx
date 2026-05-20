// /demo — migrado 1:1 desde MATCHPOINT Public.html (661-789)
"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";

const DAYS = [
  { d: "Hoy", n: "Mar 12", avail: false },
  { d: "Mié", n: "13 May", avail: true },
  { d: "Jue", n: "14 May", avail: true },
  { d: "Vie", n: "15 May", avail: true },
  { d: "Lún", n: "19 May", avail: true },
  { d: "Mar", n: "20 May", avail: true },
];
const SLOTS = ["09:00", "11:00", "14:00", "15:30", "17:00", "18:30"];
const TAKEN_SLOTS = new Set(["11:00", "15:30"]);

const EXPECT = [
  { i: "monitor", t: "Tour del dashboard", sub: "Calendario, finanzas, eventos en vivo" },
  { i: "wallet", t: "Cómo se mueven los pagos", sub: "Stripe, payouts, comisión" },
  { i: "smartphone", t: "Cómo es para tus jugadores", sub: "App móvil, reservas, ranking" },
  { i: "calculator", t: "Caso de tu club", sub: "Números con tus canchas y tarifas" },
] as const;

const STEPS_AFTER = [
  { n: 1, t: "Demo en vivo", d: "30 min de tour personalizado" },
  { n: 2, t: "Propuesta a medida", d: "Te enviamos números con tu club" },
  { n: 3, t: "Onboarding", d: "48h: cargamos canchas, tarifas, staff" },
  { n: 4, t: "Vivo en producción", d: "Reservas reales el viernes" },
];

const PREFILL = [
  ["Club", "Club Norte Pickleball"],
  ["Owner", "Andrés Calderón"],
  ["Email", "andres@clubnorte.ec"],
  ["WhatsApp", "+593 99 244 1208"],
] as const;

export function DemoPageView() {
  const [step, setStep] = useState<0 | 1>(0);
  const [day, setDay] = useState(2);
  const [time, setTime] = useState("17:00");

  return (
    <>
      <section
        className="relative overflow-hidden pt-22 md:pt-25 pb-8 md:pb-10"
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 200%)",
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
            fontSize: 280,
            color: "rgba(255,255,255,0.05)",
            letterSpacing: "-0.06em",
            transform: "rotate(-6deg) translate(15%, -15%)",
          }}
        >
          DEMO
        </div>
        <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 flex gap-5 items-center flex-wrap">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="check-check" size={30} />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
                background: "rgba(251,191,36,0.15)",
                border: "1px solid rgba(251,191,36,0.4)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#fbbf24",
              }}
            >
              ● Solicitud recibida
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: "clamp(2.5rem, 5vw, 4rem)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                textTransform: "uppercase",
                margin: "12px 0 6px",
                lineHeight: 1,
              }}
            >
              ¡Listo, Andrés!<span style={{ color: "#fbbf24" }}>.</span>
            </h1>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)" }}>
              Agenda tu demo de 30 min con un especialista. Sin pitch comercial — te mostramos el producto y resolvemos dudas.
            </p>
          </div>
        </div>
      </section>

      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-15 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6 md:gap-8">
        {step === 0 ? (
          <div className="card" style={{ padding: 28 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Paso 1 de 1</div>
            <h2
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                margin: "8px 0 22px",
              }}
            >
              Elige hora para tu demo<span className="dot">.</span>
            </h2>

            <div className="label-mp" style={{ marginBottom: 10 }}>1. ¿Qué día te queda mejor?</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-6">
              {DAYS.map((d, i) => {
                const on = day === i;
                const dis = !d.avail;
                return (
                  <button
                    key={d.n}
                    onClick={() => !dis && setDay(i)}
                    disabled={dis}
                    style={{
                      padding: "14px 6px",
                      borderRadius: 8,
                      border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: on ? "#ecfdf5" : dis ? "#fafafa" : "#fff",
                      cursor: dis ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      opacity: dis ? 0.5 : 1,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: "var(--muted-fg)",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      {d.d}
                    </div>
                    <div
                      className="font-heading"
                      style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", marginTop: 4 }}
                    >
                      {d.n}
                    </div>
                    {dis && <div style={{ fontSize: 8.5, color: "var(--muted-fg)", marginTop: 3 }}>Lleno</div>}
                  </button>
                );
              })}
            </div>

            <div className="label-mp" style={{ marginBottom: 10 }}>2. ¿A qué hora?</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-6">
              {SLOTS.map((t) => {
                const on = time === t;
                const taken = TAKEN_SLOTS.has(t);
                return (
                  <button
                    key={t}
                    disabled={taken}
                    onClick={() => !taken && setTime(t)}
                    style={{
                      padding: "12px 6px",
                      borderRadius: 8,
                      border: on ? "2px solid var(--primary)" : `1px solid ${taken ? "var(--border)" : "rgba(16,185,129,0.3)"}`,
                      background: on ? "var(--primary)" : taken ? "#fafafa" : "#ecfdf5",
                      color: on ? "#fff" : taken ? "var(--muted-fg)" : "#065f46",
                      cursor: taken ? "not-allowed" : "pointer",
                      fontSize: 12.5,
                      fontWeight: 900,
                      fontFamily: "inherit",
                      textDecoration: taken ? "line-through" : "none",
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <div className="label-mp" style={{ marginBottom: 10 }}>3. Confirma tus datos</div>
            <div
              style={{
                padding: 14,
                background: "var(--muted)",
                borderRadius: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 22,
              }}
            >
              {PREFILL.map(([k, v]) => (
                <div key={k}>
                  <div className="label-mp">{k}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3 }}>{v}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep(1)}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "14px 18px", fontSize: 13 }}
            >
              <Icon name="calendar-check" size={14} />
              Confirmar demo · {DAYS[day].d} {DAYS[day].n} · {time}
            </button>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", textAlign: "center", marginTop: 12 }}>
              30 min via Google Meet · te enviamos el link al email + WhatsApp
            </div>
          </div>
        ) : (
          <div
            className="card"
            style={{
              padding: 32,
              textAlign: "center",
              background: "#0a0a0a",
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
                fontSize: 220,
                color: "rgba(16,185,129,0.06)",
                letterSpacing: "-0.06em",
                transform: "rotate(-6deg) translate(15%, -15%)",
              }}
            >
              SET
            </div>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <Icon name="check-check" size={32} color="#fff" />
              </div>
              <h2
                className="font-heading"
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                ¡Demo agendada!<span style={{ color: "#fbbf24" }}>.</span>
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  color: "rgba(255,255,255,0.75)",
                  maxWidth: 460,
                  margin: "12px auto 22px",
                  lineHeight: 1.55,
                }}
              >
                Te enviamos el link de Google Meet a{" "}
                <b style={{ color: "#fff" }}>andres@clubnorte.ec</b> y por WhatsApp.
              </p>
              <div
                style={{
                  padding: 18,
                  background: "rgba(16,185,129,0.12)",
                  border: "1px solid var(--primary)",
                  borderRadius: 10,
                  display: "inline-block",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    color: "var(--primary)",
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  ● Tu reunión
                </div>
                <div
                  className="font-heading"
                  style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.025em", marginTop: 6 }}
                >
                  {DAYS[day].d} {DAYS[day].n} · {time}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                  30 minutos · con Diego Maldonado (CSM)
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                  <button className="btn" style={{ background: "#fff", color: "#0a0a0a", fontSize: 10.5 }}>
                    <Icon name="calendar-plus" size={11} />
                    Agregar a Google Calendar
                  </button>
                  <button
                    className="btn"
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.25)",
                      fontSize: 10.5,
                    }}
                  >
                    <Icon name="copy" size={11} />
                    Copiar link Meet
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 22 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● En la demo veremos</div>
            <h3
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "6px 0 14px",
              }}
            >
              30 minutos sin pitch<span className="dot">.</span>
            </h3>
            {EXPECT.map((s, i) => (
              <div
                key={s.t}
                style={{ display: "flex", gap: 11, padding: "10px 0", borderTop: i === 0 ? "0" : "1px dashed var(--border)" }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={s.i} size={14} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>{s.t}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/sandbox"
            className="card"
            style={{
              padding: 22,
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
              textDecoration: "none",
              color: "#0a0a0a",
              display: "block",
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
                fontSize: 140,
                color: "rgba(0,0,0,0.08)",
                letterSpacing: "-0.06em",
                lineHeight: 0.8,
                transform: "rotate(-6deg) translate(15%, -25%)",
              }}
            >
              PLAY
            </div>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 9px",
                  background: "#0a0a0a",
                  color: "#fff",
                  borderRadius: 9999,
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                ● Sin esperar
              </div>
              <h3
                className="font-heading"
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "-0.025em",
                  textTransform: "uppercase",
                  margin: "10px 0 6px",
                  lineHeight: 1.05,
                }}
              >
                Mientras tanto, juega con el sandbox<span style={{ color: "#0a0a0a" }}>.</span>
              </h3>
              <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0, color: "#78350f" }}>
                Entra al dashboard de un club ficticio con data real. Toca todo, no rompes nada.
              </p>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 14,
                  padding: "8px 14px",
                  background: "#0a0a0a",
                  color: "#fff",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Abrir sandbox <Icon name="arrow-right" size={12} />
              </div>
            </div>
          </Link>

          <div className="card" style={{ padding: 18 }}>
            <div className="label-mp">Qué pasa después</div>
            {STEPS_AFTER.map((s) => (
              <div
                key={s.n}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: s.n === 1 ? "0" : "1px dashed var(--border)",
                }}
              >
                <div
                  className="font-heading"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#0a0a0a",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {s.n}
                </div>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 900 }}>{s.t}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
