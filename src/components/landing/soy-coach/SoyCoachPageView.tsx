// /soy-coach — onboarding B2B para coaches. Estructura paralela a SoyClubPageView.
// Spec en MAT-22 (documento `plan`). Tiers Free/Verified/Pro alineados a MAT-1.
// Copy de cobros omite "Stripe" hasta que MAT-19 cierre con decisión del board.
"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

const BENEFITS = [
  {
    i: "search",
    t: "Visibilidad real",
    d: "Apareces en el directorio buscable por ciudad, nivel y deporte. Cuando un jugador busca coach, te encuentra.",
    stat: "8,400+",
    sub: "jugadores activos",
  },
  {
    i: "wallet",
    // MAT-19 dependency: no mencionar Stripe hasta que el board apruebe Connect.
    t: "Cobros sin fricción",
    d: "Cobra cada clase por DeUna o transferencia directa. Queda comprobante de cada pago para tu contabilidad y tus alumnos.",
    stat: "0%",
    sub: "comisión en Free hasta tu primera clase pagada",
  },
  {
    i: "calendar-check",
    t: "Herramientas pro",
    d: "Calendario, evaluaciones de nivel, biblioteca de drills y reportes de progreso por alumno — disponibles en Coach Pro.",
    stat: "< 60s",
    sub: "para agendar una clase",
  },
] as const;

// Tiers tomados de MAT-1 §Coach. Tier del medio marcado como recomendado.
type Tier = {
  k: "free" | "verified" | "pro";
  name: string;
  price: string;
  period?: string;
  blurb: string;
  rows: string[];
  cta: string;
  recommended?: boolean;
};

const TIERS: Tier[] = [
  {
    k: "free",
    name: "Free",
    price: "$0",
    blurb: "Para probar la plataforma sin compromiso.",
    rows: [
      "Perfil público en el directorio",
      "Hasta 3 clases pagadas por mes",
      "Comisión 20% por clase",
      "Soporte por correo",
    ],
    cta: "Empezar gratis",
  },
  {
    k: "verified",
    name: "Coach Verified",
    price: "$10",
    period: "/mes",
    blurb: "Para coaches activos que quieren más visibilidad y mejor comisión.",
    rows: [
      "Badge Verificado en perfil y búsqueda",
      "Clases ilimitadas",
      "Comisión 10% por clase",
      "Analytics básico (alumnos, ingresos, retención)",
      "Soporte por WhatsApp",
    ],
    cta: "Quiero verificarme",
    recommended: true,
  },
  {
    k: "pro",
    name: "Coach Pro",
    price: "$30",
    period: "/mes",
    blurb: "Todo lo de Verified más herramientas de coaching profesional.",
    rows: [
      "Calendario sync con Google y Apple",
      "Biblioteca de drills y planes de clase",
      "Evaluaciones de nivel por alumno",
      "Analytics avanzado con reportes mensuales",
      "Prioridad en directorio",
    ],
    cta: "Probar Coach Pro",
  },
];

const TESTIMONIOS = [
  {
    // PLACEHOLDER — reemplazar con coach real post-beta (owner: ops).
    q: "Dejé de chasear pagos por WhatsApp. La gente reserva, paga y aparece. Mi calendario semanal está lleno y no toco una planilla.",
    n: "Sofía Reyes",
    r: "Coach IPTPA Lvl 2 · Quito",
    c: "120 alumnos activos",
    stat: "+38%",
    sub: "ingresos vs antes",
  },
  {
    // PLACEHOLDER — reemplazar con coach real post-beta (owner: ops).
    q: "El badge Verificado me cambió la cantidad de leads. Antes mandaba mensajes para conseguir clientes; ahora los clientes me escriben a mí.",
    n: "Daniel Vélez",
    r: "PPR Certified · Guayaquil",
    c: "Coach Verified desde mes 2",
    stat: "+62%",
    sub: "leads mensuales",
  },
];

const FAQ: [string, string][] = [
  [
    "¿Cómo me verifico como coach?",
    "Subes una foto de tu cédula y una credencial de coaching (IPTPA, PPR, federación local o equivalente). Verificamos en 24-48 horas y activamos el badge. Sin badge sigues funcionando, pero con badge apareces más arriba en las búsquedas.",
  ],
  [
    "¿Cuánto puedo cobrar por clase?",
    "Tú pones el precio. Hoy los coaches en MATCHPOINT cobran entre $12 y $35 por hora según ciudad, nivel y modalidad (individual, grupo o clínica). Te damos benchmarks por ciudad en tu dashboard para que pongas un precio justo.",
  ],
  [
    "¿Cuánto cobra MATCHPOINT de comisión?",
    "20% sobre cada clase pagada en plan Free. En Coach Verified ($10/mes) y Coach Pro ($30/mes) baja a 10%. No hay setup fee, no hay permanencia. Cancelas cuando quieras.",
  ],
  [
    "¿Cuándo me pagan?",
    "Una vez por semana, los martes. El dinero de las clases pagadas hasta el domingo cae a tu cuenta el martes siguiente. Si cobraste en efectivo, lo reportas en la app y queda registrado.",
  ],
  [
    "¿Funciona si trabajo en varios clubes?",
    "Sí. Configuras tus horarios por club y el sistema no te deja tener dos clases en paralelo. Si un club tiene MATCHPOINT, tus clases ahí se integran al calendario del club. Si no, igual cobras y mantienes tu agenda en la app.",
  ],
];

const FIELDS = [
  { l: "Tu nombre completo", p: "ej. Sofía Reyes", required: true, full: true, type: "text" },
  { l: "Email", p: "sofia@coaches.ec", required: true, type: "email" },
  { l: "WhatsApp", p: "+593 99 ...", required: true, type: "tel" },
  { l: "Ciudad", p: "Quito · Cumbayá · Guayaquil", required: true, type: "text" },
  { l: "Certificaciones (opcional)", p: "IPTPA Lvl 2, PPR ...", required: false, type: "text" },
] as const;

export function SoyCoachPageView() {
  const router = useRouter();
  const [sent, setSent] = useState(false);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSent(true);
    setTimeout(() => router.push("/auth/signup?role=coach"), 800);
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
          COACH
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
              ● PARA COACHES Y ENTRENADORES
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
              Tu cancha.
              <br />
              Tus alumnos<span style={{ color: "#fbbf24" }}>.</span>
              <br />
              Tus reglas<span style={{ color: "var(--primary)" }}>.</span>
            </h1>
            <p
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.85)",
                maxWidth: 500,
                marginTop: 24,
                lineHeight: 1.6,
              }}
            >
              El software que llena tu agenda de clases, cobra por ti y deja constancia de cada
              sesión. <b style={{ color: "#fff" }}>Apareces ante 8,400+ jugadores activos.</b> Sin
              mensualidades. Empiezas gratis.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
              <a
                href="#form"
                className="btn btn-primary"
                style={{ padding: "16px 28px", fontSize: 13, textDecoration: "none" }}
              >
                Registra tu perfil de coach
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
                ["38", "coaches activos"],
                ["4.8★", "rating promedio"],
                ["420", "clases/mes en plataforma"],
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
          {/* Mock dashboard del coach */}
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
                  coach.matchpoint.app
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
                  ● COACH PRO · CUMBAYÁ
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
                  Hola, Sofía<span style={{ color: "#fbbf24" }}>.</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 10 }}>
                  {([
                    ["Hoy", "4 clases", "var(--primary)"],
                    ["Mes", "$1,840", "#0a0a0a"],
                    ["Alumnos", "23", "#0ea5e9"],
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
                    PRÓXIMO PAGO · MARTES
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
                    $420
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

      {/* Pricing — 3 tiers (Free · Verified · Pro) */}
      <section className="py-15 md:py-25" style={{ background: "var(--muted)" }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-8">
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Tres planes, una decisión</div>
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
            Empieza gratis<span className="dot">.</span><br />
            Sube cuando crezcas<span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <p style={{ fontSize: 15, color: "var(--muted-fg)", lineHeight: 1.65, marginBottom: 36, maxWidth: 620 }}>
            Sin permanencia. Cancela cuando quieras. Empezar en Free no te obliga a nada — solo pagas
            comisión cuando cobras una clase.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 items-stretch">
            {TIERS.map((tier) => {
              const isRec = !!tier.recommended;
              return (
                <div
                  key={tier.k}
                  className="p-6 md:p-7"
                  style={{
                    position: "relative",
                    borderRadius: 14.4,
                    border: isRec ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: "#fff",
                    boxShadow: isRec ? "0 12px 40px rgba(16,185,129,0.18)" : "none",
                    transform: isRec ? "translateY(-6px)" : "none",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {isRec && (
                    <div
                      style={{
                        position: "absolute",
                        top: -12,
                        left: "50%",
                        transform: "translateX(-50%)",
                        padding: "4px 12px",
                        background: "var(--primary)",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        borderRadius: 9999,
                      }}
                    >
                      Recomendado
                    </div>
                  )}
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    {tier.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
                    <span
                      className="font-heading tabular"
                      style={{
                        fontSize: 40,
                        fontWeight: 900,
                        letterSpacing: "-0.04em",
                        color: isRec ? "var(--primary)" : "#0a0a0a",
                      }}
                    >
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span style={{ fontSize: 13, color: "var(--muted-fg)", fontWeight: 700 }}>
                        {tier.period}
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--muted-fg)",
                      margin: "8px 0 18px",
                      lineHeight: 1.5,
                    }}
                  >
                    {tier.blurb}
                  </p>
                  <div style={{ flex: 1 }}>
                    {tier.rows.map((row) => (
                      <div
                        key={row}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          padding: "8px 0",
                          fontSize: 13,
                          borderTop: "1px dashed var(--border)",
                        }}
                      >
                        <Icon name="check-circle-2" size={16} color="var(--primary)" />
                        <span style={{ lineHeight: 1.45 }}>{row}</span>
                      </div>
                    ))}
                  </div>
                  <a
                    href="#form"
                    className={isRec ? "btn btn-primary" : "btn btn-outline"}
                    style={{
                      marginTop: 18,
                      justifyContent: "center",
                      padding: "12px 18px",
                      fontSize: 12,
                      textDecoration: "none",
                    }}
                  >
                    {tier.cta}
                  </a>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <Link
              href="/precios#coaches"
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "var(--muted-fg)",
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              Ver el detalle completo en /precios
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonios */}
      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-15 md:py-25">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Lo que dicen coaches</div>
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
          <div className="label-mp" style={{ color: "#fbbf24" }}>● Empiezas hoy mismo</div>
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
            Cuéntanos de ti<span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 36 }}>
            Te creamos tu perfil de coach en menos de 24 horas. Sin tarjeta. Sin compromiso.
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
                ¡Bienvenido coach!<span style={{ color: "#fbbf24" }}>.</span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.75)",
                  maxWidth: 460,
                  margin: "10px auto 0",
                }}
              >
                Llevándote al registro…
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
                  placeholder="Años entrenando, especialidad, alumnos activos, club donde trabajas…"
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
                  Empezar a coachear ahora
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
