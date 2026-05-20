// /soy-partner — landing para organizadores de torneos / partners
// Estructura espejo de SoyClubPageView pero con copy y CTAs orientados a torneos.
"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";

const BENEFITS = [
  {
    i: "trophy",
    t: "Inscripciones online",
    d: "Tus jugadores se inscriben y pagan en 60 segundos. Cero hojas de cálculo, cero transferencias para confirmar.",
    stat: "92%",
    sub: "inscritos sin pedirles nada",
  },
  {
    i: "calendar-check",
    t: "Brackets automáticos",
    d: "Round robin, eliminación directa o mixto. Generas, publicas y actualizas resultados en vivo desde el móvil.",
    stat: "3 min",
    sub: "para armar el bracket completo",
  },
  {
    i: "megaphone",
    t: "Difusión a tu segmento",
    d: "Aparece en el feed de eventos de 8.4k jugadores y reciben notificación push según su deporte y nivel.",
    stat: "12.4k",
    sub: "alcance mensual orgánico",
  },
] as const;

const INCLUDED = [
  "Panel del organizador (calendario · brackets · pagos)",
  "Cobro online por inscripción · Stripe + DeUna",
  "Comunicación masiva (push + email) a los inscritos",
  "Página pública del torneo con tu marca",
  "Resultados en vivo y publicación en ranking",
  "Soporte WhatsApp · español",
  "Sin permanencia · cancela cuando quieras",
];

const FAQ: [string, string][] = [
  ["¿Cuánto cuesta publicar un torneo?", "Publicar es gratis. Solo cobramos 8% sobre las inscripciones que se paguen vía MATCHPOINT. Si tu torneo se paga en efectivo, no pagas comisión."],
  ["¿Necesito tener un club registrado?", "No. Cualquier organizador o asociación puede publicar torneos. Si además operas un club, mira /soy-club."],
  ["¿Puedo cobrar inscripciones en USD y DeUna?", "Sí, ambas. El dinero llega a tu cuenta bancaria ecuatoriana en máximo 7 días después del torneo."],
  ["¿Los puntos del torneo cuentan para el ranking?", "Sí, si el torneo se marca como ranked. MATCHPOINT aplica ELO según el resultado de cada partido oficial."],
  ["¿Cuánto demora la aprobación?", "Menos de 24 horas. Tu equipo revisa el formato, fechas y premios y te confirma por WhatsApp."],
];

const FIELDS = [
  { l: "Nombre del torneo / organización", p: "ej. Pickleball Open Quito 2026", required: true, full: true, type: "text" },
  { l: "Tu nombre", p: "ej. Andrés Calderón", required: true, type: "text" },
  { l: "Tu rol", p: "Organizador · Federación · Marca", required: true, type: "text" },
  { l: "Email", p: "andres@ejemplo.ec", required: true, type: "email" },
  { l: "WhatsApp", p: "+593 99 ...", required: true, type: "text" },
] as const;

export function SoyPartnerPageView() {
  const [sent, setSent] = useState(false);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSent(true);
  };

  return (
    <>
      {/* Hero */}
      <section
        style={{
          position: "relative",
          minHeight: "calc(100vh - 90px)",
          background: "linear-gradient(180deg, #0a0a0a 0%, #1f1f23 60%, #7c2d12 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 20% 50%, rgba(251,146,60,0.18), transparent 60%)",
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
          TORNEO
        </div>
        <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 pt-22 md:pt-25 pb-10 md:pb-15">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 14px",
              background: "rgba(251,146,60,0.15)",
              border: "1px solid rgba(251,146,60,0.4)",
              borderRadius: 9999,
              fontSize: 10.5,
              fontWeight: 900,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#fb923c",
              marginBottom: 24,
            }}
          >
            ● PARA ORGANIZADORES DE TORNEOS
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
              maxWidth: 980,
            }}
          >
            Publica tu torneo<span style={{ color: "#fb923c" }}>.</span>
            <br />
            Llena cupos en horas<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.85)",
              maxWidth: 560,
              marginTop: 24,
              lineHeight: 1.6,
            }}
          >
            Inscripciones online, brackets automáticos y difusión a 8.4k jugadores activos.
            <b style={{ color: "#fff" }}> Publicar es gratis. Solo 8% por inscripción cobrada.</b>
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
            <a
              href="#form"
              className="btn btn-primary"
              style={{ padding: "16px 28px", fontSize: 13, textDecoration: "none" }}
            >
              Solicitar publicación
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
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-15 md:py-25">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Por qué MATCHPOINT para tu torneo</div>
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
          Menos logística.<br />
          Más jugadores<span className="dot">.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {BENEFITS.map((b) => (
            <div key={b.t} className="p-6 md:p-7" style={{ borderRadius: 14.4, border: "1px solid var(--border)", background: "#fff" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 13,
                  background: "#fb923c",
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
                  style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", color: "#fb923c" }}
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

      {/* Pricing + Included */}
      <section className="py-15 md:py-25" style={{ background: "var(--muted)" }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Sin riesgos</div>
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
                Solo 8%<span className="dot">.</span><br />
                Por inscripción<span style={{ color: "#fb923c" }}>.</span>
              </h2>
              <p style={{ fontSize: 15, color: "var(--muted-fg)", lineHeight: 1.65, marginBottom: 24 }}>
                Publicar el torneo es gratis. Solo cobramos 8% de comisión sobre las inscripciones que se paguen por MATCHPOINT. Pagos en efectivo no pagan comisión.
              </p>
              <div style={{ padding: 18, background: "#fff", borderRadius: 12, border: "1px solid var(--border)" }}>
                <div className="label-mp">Ejemplo real</div>
                <div style={{ marginTop: 10 }}>
                  {([
                    ["Torneo de 64 inscritos · $25 c/u", "$1,600"],
                    ["Comisión MATCHPOINT (8%)", "–$128"],
                    ["Comisión Stripe (2.9%)", "–$46"],
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
                      style={{ fontSize: 28, fontWeight: 900, color: "#fb923c", letterSpacing: "-0.025em" }}
                    >
                      $1,426
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
                    <Icon name="check-circle-2" size={18} color="#fb923c" />
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Form */}
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
            background: "radial-gradient(ellipse at 50% 120%, rgba(251,146,60,0.22), transparent 70%)",
          }}
        />
        <div className="relative max-w-[880px] mx-auto px-4 md:px-8">
          <div className="label-mp" style={{ color: "#fb923c" }}>● Aprobación en menos de 24h</div>
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
            Cuéntanos del torneo<span style={{ color: "#fb923c" }}>.</span>
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 36 }}>
            Un especialista te contacta el mismo día. Demo del panel del organizador, sin compromiso.
          </p>
          {sent ? (
            <div
              style={{
                padding: 36,
                background: "rgba(251,146,60,0.12)",
                border: "1px solid #fb923c",
                borderRadius: 14.4,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "#fb923c",
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
                ¡Recibido!<span style={{ color: "#fb923c" }}>.</span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.75)",
                  maxWidth: 460,
                  margin: "10px auto 0",
                }}
              >
                Te contactamos por WhatsApp en menos de 24 horas.
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
                    {f.l} {f.required && <span style={{ color: "#fb923c" }}>*</span>}
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
                  Detalles del torneo
                </div>
                <textarea
                  placeholder="Deporte, fechas tentativas, formato, número de cupos, premios…"
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
                  <Icon name="send" size={14} />
                  Enviar solicitud
                </button>
                <Link
                  href="/eventos"
                  className="btn btn-outline"
                  style={{
                    background: "transparent",
                    color: "#fff",
                    borderColor: "rgba(255,255,255,0.25)",
                    textDecoration: "none",
                  }}
                >
                  <Icon name="eye" size={13} />
                  Ver torneos publicados
                </Link>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                  O{" "}
                  <a
                    href="https://wa.me/593992441208"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#fb923c", fontWeight: 800 }}
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
              <Icon name="plus" size={18} color="#fb923c" />
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
