// /soy-club — migrado 1:1 desde MATCHPOINT Public.html (líneas 876-1086)
"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

const BENEFITS = [
  {
    i: "calendar-check",
    t: "Reservas automáticas",
    d: "Tu calendario en tiempo real. Jugadores reservan y pagan solos. Adiós planilla en Excel y llamadas perdidas.",
    stat: "+24%",
    sub: "reservas el primer mes",
  },
  {
    i: "wallet",
    t: "Cobros y payouts",
    d: "Cobramos por ti con Stripe. Payout semanal automático a tu cuenta. Tú solo ves caer la plata.",
    stat: "7 días",
    sub: "desde reserva a tu banco",
  },
  {
    i: "megaphone",
    t: "Tu club, más visible",
    d: "Apareces en los resultados de búsqueda de 8,412 jugadores. Eventos en tu club generan tráfico extra todo el año.",
    stat: "12.4k",
    sub: "alcance mensual",
  },
] as const;

const INCLUDED = [
  "Dashboard web completo (Owner + Manager + Empleado)",
  "App móvil para jugadores y tu staff",
  "Pasarela de pago Stripe · sin setup",
  "Reportes y analytics en tiempo real",
  "Soporte en español · WhatsApp",
  "Onboarding asistido (48 horas)",
  "Sin permanencia · te puedes ir cuando quieras",
];

const TESTIMONIOS = [
  {
    q: "Triplicamos las reservas en 2 meses. El equipo ya no contesta llamadas: la gente reserva sola y paga sola. Recuperamos 8 horas a la semana de operación.",
    n: "Andrés Calderón",
    r: "Owner · Club Norte Pickleball",
    c: "8 canchas · Cumbayá",
    stat: "+212%",
    sub: "reservas vs antes",
  },
  {
    q: "Antes pagaba $800 al mes por software gringo en inglés. Ahora pago solo cuando cobro, y el sistema es 10x mejor para Ecuador.",
    n: "María José Lara",
    r: "Owner · Pickle Garden",
    c: "5 canchas · Cumbayá",
    stat: "$9.6k",
    sub: "ahorrados en software al año",
  },
];

const FAQ: [string, string][] = [
  ["¿Cuánto cuesta?", "Solo 10% de comisión por reserva pagada. Si no facturas, no pagas nada. Sin mensualidad, sin setup fee, sin permanencia."],
  ["¿Cuánto demora el setup?", "48 horas en la mayoría de casos. Nuestro equipo carga tus canchas, horarios y tarifas. Tu club está listo para recibir reservas el viernes si nos contactas el miércoles."],
  ["¿Necesito tarjeta o depósito?", "No. Cero compromiso financiero. Solo necesitas RUC del club y cuenta bancaria ecuatoriana para recibir payouts semanales."],
  ["¿Qué pasa con mi sistema actual?", "Mantienes el control. Importamos tus socios y reservas existentes. Puedes correr ambos en paralelo el primer mes."],
  ["¿Funciona para varios deportes?", "Sí — Pickleball, Pádel, Tenis y Fútbol. Cada cancha se configura con su deporte y tarifa propia."],
];

const FIELDS = [
  { l: "Nombre del club", p: "ej. Club Norte Pickleball", required: true, full: true, type: "text" },
  { l: "Tu nombre", p: "ej. Andrés Calderón", required: true, type: "text" },
  { l: "Tu rol", p: "Owner · Manager · Inversionista", required: true, type: "text" },
  { l: "Email", p: "andres@clubnorte.ec", required: true, type: "email" },
  { l: "WhatsApp", p: "+593 99 ...", required: true, type: "text" },
] as const;

export function SoyClubPageView() {
  const router = useRouter();
  const [sent, setSent] = useState(false);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSent(true);
    // Original llevaba directo a /sandbox. Mantengo el comportamiento.
    setTimeout(() => router.push("/sandbox"), 800);
  };

  return (
    <>
      {/* Hero */}
      <section
        style={{
          position: "relative",
          minHeight: "calc(100vh - 90px)",
          background: "linear-gradient(180deg, #0a0a0a 0%, #1f1f23 60%, #064e3b 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 20% 50%, rgba(251,191,36,0.12), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 360,
            color: "rgba(255,255,255,0.04)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(10%, -15%)",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          CLUB
        </div>
        <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 pt-22 md:pt-25 pb-10 md:pb-15 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-10 md:gap-15 items-center">
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 14px",
                background: "rgba(251,191,36,0.15)",
                border: "1px solid rgba(251,191,36,0.4)",
                borderRadius: 9999,
                fontSize: 10.5,
                fontWeight: 900,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#fbbf24",
                marginBottom: 24,
              }}
            >
              ● PARA DUEÑOS DE CLUB
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: "clamp(3.5rem, 8vw, 7rem)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                textTransform: "uppercase",
                margin: 0,
                lineHeight: 0.92,
              }}
            >
              Tu club.
              <br />
              Más reservas<span style={{ color: "#fbbf24" }}>.</span>
              <br />
              Menos trabajo<span style={{ color: "var(--primary)" }}>.</span>
            </h1>
            <p
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.85)",
                maxWidth: 480,
                marginTop: 24,
                lineHeight: 1.6,
              }}
            >
              El software que organiza tu calendario, cobra automático, atrae jugadores y te paga semanal.
              Sin mensualidades. Sin compromiso. <b style={{ color: "#fff" }}>Solo 10% de comisión por reserva.</b>
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
              <a
                href="#form"
                className="btn btn-primary"
                style={{ padding: "16px 28px", fontSize: 13, textDecoration: "none" }}
              >
                Solicitar demo
                <Icon name="arrow-right" size={14} />
              </a>
              <a
                href="https://wa.me/593992441208"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.25)",
                  padding: "15px 26px",
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                <Icon name="message-circle" size={14} />
                Hablar por WhatsApp
              </a>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 40, flexWrap: "wrap" }}>
              {([
                ["142", "clubes activos"],
                ["78%", "ocupación promedio"],
                ["+18%", "revenue vs antes"],
              ] as const).map(([v, l]) => (
                <div key={l}>
                  <div
                    className="font-heading tabular"
                    style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}
                  >
                    {v}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "rgba(255,255,255,0.55)",
                      fontWeight: 800,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      marginTop: 5,
                    }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Mock dashboard screenshot */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                transform: "rotate(2deg)",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  background: "#fafafa",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                {["#dc2626", "#fbbf24", "#10b981"].map((c) => (
                  <span key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                ))}
                <span style={{ fontSize: 9.5, color: "var(--muted-fg)", marginLeft: 8 }}>
                  club-norte.matchpoint.app
                </span>
              </div>
              <div style={{ padding: 14, background: "#fff" }}>
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--primary)",
                  }}
                >
                  ● OWNER · CLUB NORTE
                </div>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "-0.025em",
                    textTransform: "uppercase",
                    marginTop: 4,
                    color: "#0a0a0a",
                  }}
                >
                  Hola, Andrés<span style={{ color: "#fbbf24" }}>.</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 10 }}>
                  {([
                    ["Hoy", "$1,842", "var(--primary)"],
                    ["Ocup.", "78%", "#0a0a0a"],
                    ["Socios", "486", "#0ea5e9"],
                    ["Rating", "4.9★", "#fbbf24"],
                  ] as const).map(([l, v, c]) => (
                    <div
                      key={l}
                      style={{ padding: 8, background: "#fafafa", borderRadius: 6, border: "1px solid var(--border)" }}
                    >
                      <div
                        style={{
                          fontSize: 7,
                          color: "var(--muted-fg)",
                          fontWeight: 900,
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                        }}
                      >
                        {l}
                      </div>
                      <div
                        className="font-heading"
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: c,
                          letterSpacing: "-0.02em",
                          marginTop: 2,
                        }}
                      >
                        {v}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: 10, background: "#0a0a0a", borderRadius: 6, color: "#fff" }}>
                  <div
                    style={{
                      fontSize: 7.5,
                      fontWeight: 900,
                      letterSpacing: "0.16em",
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    PAYOUT MAÑANA
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      color: "var(--primary)",
                      marginTop: 3,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    $9,536
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits 3-up */}
      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-15 md:py-25">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Por qué MATCHPOINT</div>
        <h2
          className="font-heading"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: "12px 0 48px",
            lineHeight: 1,
          }}
        >
          Tres cosas cambian.<br />
          Las tres importan<span className="dot">.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {BENEFITS.map((b) => (
            <div key={b.t} className="p-6 md:p-7" style={{ borderRadius: 14.4, border: "1px solid var(--border)", background: "#fff" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 13,
                  background: "var(--primary)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <Icon name={b.i} size={24} />
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase" }}
              >
                {b.t}<span className="dot">.</span>
              </div>
              <p style={{ fontSize: 13.5, color: "var(--muted-fg)", margin: "10px 0 18px", lineHeight: 1.55 }}>
                {b.d}
              </p>
              <div style={{ paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
                <div
                  className="font-heading tabular"
                  style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", color: "var(--primary)" }}
                >
                  {b.stat}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted-fg)",
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginTop: 3,
                  }}
                >
                  {b.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="py-15 md:py-25" style={{ background: "var(--muted)" }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Sin sorpresas</div>
              <h2
                className="font-heading"
                style={{
                  fontSize: "clamp(2.5rem, 5vw, 4rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                  textTransform: "uppercase",
                  margin: "12px 0 18px",
                  lineHeight: 1,
                }}
              >
                Solo 10%<span className="dot">.</span><br />
                De cada reserva<span style={{ color: "#fbbf24" }}>.</span>
              </h2>
              <p style={{ fontSize: 15, color: "var(--muted-fg)", lineHeight: 1.65, marginBottom: 24 }}>
                Sin mensualidad. Sin setup fee. Sin tarjeta. Solo cobramos cuando tú cobras. Si no facturas, no pagas nada.
              </p>
              <div style={{ padding: 18, background: "#fff", borderRadius: 12, border: "1px solid var(--border)" }}>
                <div className="label-mp">Ejemplo real</div>
                <div style={{ marginTop: 10 }}>
                  {([
                    ["Cancha a $14/h · 100 reservas/mes", "$1,400"],
                    ["Comisión MATCHPOINT (10%)", "–$140"],
                    ["Comisión Stripe (2.9%)", "–$41"],
                  ] as const).map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "7px 0",
                        fontSize: 12.5,
                        borderTop: "1px dashed var(--border)",
                      }}
                    >
                      <span style={{ color: "var(--muted-fg)" }}>{k}</span>
                      <span style={{ fontWeight: 800 }}>{v}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      paddingTop: 10,
                      borderTop: "1.5px solid #0a0a0a",
                      marginTop: 4,
                    }}
                  >
                    <span
                      className="font-heading"
                      style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}
                    >
                      Tu neto
                    </span>
                    <span
                      className="font-heading"
                      style={{ fontSize: 28, fontWeight: 900, color: "var(--primary)", letterSpacing: "-0.025em" }}
                    >
                      $1,219
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div className="label-mp">Incluido sin costo extra</div>
              <div style={{ marginTop: 14 }}>
                {INCLUDED.map((f) => (
                  <div
                    key={f}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 0",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <Icon name="check-circle-2" size={18} color="var(--primary)" />
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonios */}
      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-15 md:py-25">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Lo que dicen owners</div>
        <h2
          className="font-heading"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: "12px 0 48px",
            lineHeight: 1,
          }}
        >
          Casos reales<span className="dot">.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {TESTIMONIOS.map((t) => (
            <div key={t.n} className="card p-6 md:p-8" style={{ borderLeft: "3px solid var(--primary)" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Icon key={s} name="star" size={14} color="#d97706" />
                ))}
              </div>
              <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>&quot;{t.q}&quot;</p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: "1px dashed var(--border)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 900 }}>{t.n}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{t.r}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{t.c}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    className="font-heading tabular"
                    style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", color: "var(--primary)" }}
                  >
                    {t.stat}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted-fg)",
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginTop: 3,
                    }}
                  >
                    {t.sub}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Form / contact */}
      <section
        id="form"
        className="relative overflow-hidden py-15 md:py-25"
        style={{
          background: "#0a0a0a",
          color: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 50% 120%, rgba(16,185,129,0.25), transparent 70%)",
          }}
        />
        <div className="relative max-w-[880px] mx-auto px-4 md:px-8">
          <div className="label-mp" style={{ color: "#fbbf24" }}>● Listo en 48 horas</div>
          <h2
            className="font-heading"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 900,
              letterSpacing: "-0.035em",
              textTransform: "uppercase",
              margin: "12px 0 18px",
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            Cuéntanos de tu club<span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 36 }}>
            Un especialista te contacta en menos de 24h. Demo en vivo, sin compromiso.
          </p>
          {sent ? (
            <div
              style={{
                padding: 36,
                background: "rgba(16,185,129,0.12)",
                border: "1px solid var(--primary)",
                borderRadius: 14.4,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Icon name="check-check" size={28} color="#fff" />
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase" }}
              >
                ¡Recibido!<span style={{ color: "#fbbf24" }}>.</span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.75)",
                  maxWidth: 460,
                  margin: "10px auto 0",
                }}
              >
                Llevándote al sandbox de prueba…
              </p>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-6 md:p-8"
              style={{
                background: "rgba(255,255,255,0.04)",
                borderRadius: 14.4,
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {FIELDS.map((f) => (
                <div key={f.l} style={{ gridColumn: "full" in f && f.full ? "1 / -1" : "auto" }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.65)",
                      marginBottom: 5,
                    }}
                  >
                    {f.l} {f.required && <span style={{ color: "#fbbf24" }}>*</span>}
                  </div>
                  <input
                    required={f.required}
                    type={f.type}
                    placeholder={f.p}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 9,
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#fff",
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.65)",
                    marginBottom: 5,
                  }}
                >
                  Cuéntanos un poco
                </div>
                <textarea
                  placeholder="Cuántas canchas tienes, qué deportes, qué software usas hoy…"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 9,
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                    minHeight: 90,
                    resize: "vertical",
                  }}
                />
              </div>
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <button type="submit" className="btn btn-primary" style={{ padding: "14px 26px", fontSize: 13 }}>
                  <Icon name="play-circle" size={14} />
                  Entrar al demo ahora
                </button>
                <Link
                  href="/demo"
                  className="btn btn-outline"
                  style={{
                    background: "transparent",
                    color: "#fff",
                    borderColor: "rgba(255,255,255,0.25)",
                    textDecoration: "none",
                  }}
                >
                  <Icon name="calendar" size={13} />
                  Prefiero agendar una llamada
                </Link>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                  O{" "}
                  <a
                    href="https://wa.me/593992441208"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#fbbf24", fontWeight: 800 }}
                  >
                    WhatsApp directo
                  </a>
                </span>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-[880px] mx-auto px-4 md:px-8 py-15 md:py-25">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Preguntas frecuentes</div>
        <h2
          className="font-heading"
          style={{
            fontSize: "clamp(2rem, 4vw, 3rem)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "12px 0 32px",
            lineHeight: 1,
          }}
        >
          Lo que todos preguntan<span className="dot">.</span>
        </h2>
        {FAQ.map((qa, i) => (
          <details
            key={qa[0]}
            style={{
              padding: "16px 0",
              borderTop: i === 0 ? "1px solid var(--border)" : "none",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <summary
              style={{
                fontSize: 15,
                fontWeight: 900,
                cursor: "pointer",
                listStyle: "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {qa[0]}
              <Icon name="plus" size={18} color="var(--primary)" />
            </summary>
            <p style={{ fontSize: 13.5, color: "var(--muted-fg)", marginTop: 12, lineHeight: 1.6 }}>
              {qa[1]}
            </p>
          </details>
        ))}
      </section>
    </>
  );
}
