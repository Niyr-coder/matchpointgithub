"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ContactSalesForm } from "@/components/landing/forms/ContactSalesForm";
import { trackPricingEvent } from "@/lib/telemetry/pricing";

const PLANS = [
  {
    name: "Club Starter",
    price: "USD 49.99",
    sub: "por mes",
    highlight: false,
    copy: "Para ordenar reservas, staff y pagos manuales sin cambiar todo de golpe.",
    items: ["Perfil público del club", "Reservas y agenda operativa", "Pagos por transferencia, DeUna o caja", "Soporte de onboarding inicial"],
  },
  {
    name: "Club Pro",
    price: "USD 149.99",
    sub: "por mes",
    highlight: true,
    copy: "Para convertir el club en un negocio medible con comunidad, campañas y reportes.",
    items: ["Todo lo de Starter", "Membresías, eventos y torneos del club", "Marketing y comunicaciones", "Reportes para operación y crecimiento"],
  },
  {
    name: "Club Fundador",
    price: "Pro a precio Starter",
    sub: "por 90 días",
    highlight: false,
    copy: "Cupos limitados para pilotos reales con setup asistido y revisión quincenal.",
    items: ["Setup gratis", "Carga inicial de canchas y staff", "Primera campaña acompañada", "Compromiso de feedback y caso de estudio"],
  },
] as const;

const PROBLEMS = [
  "Reservas repartidas entre WhatsApp, Excel y llamadas.",
  "Pagos manuales sin trazabilidad ni estado claro.",
  "Torneos, membresías y comunidad operan en herramientas separadas.",
  "Poca visibilidad sobre ocupación, ingresos y próximos pasos.",
] as const;

const SOLUTIONS = [
  { icon: "calendar-check", title: "Operación ordenada", text: "Agenda, reservas, canchas, staff y estados de pago en un mismo tablero." },
  { icon: "users", title: "Comunidad que vuelve", text: "Eventos, torneos, membresías y comunicación para mantener activo al jugador." },
  { icon: "bar-chart-3", title: "Crecimiento medible", text: "Reportes simples para entender ocupación, ingresos, demanda y oportunidades." },
] as const;

const FAQS = [
  ["Ya usamos WhatsApp y Excel, ¿por qué cambiar?", "MATCHPOINT no elimina tus canales de un día para otro. Ordena reservas, eventos, pagos y reportes para que WhatsApp deje de ser la base operativa."],
  ["¿Cómo funciona el setup?", "En Club Fundador hacemos onboarding asistido: canchas, horarios, staff, reglas básicas y primera campaña. Si entregas la información, puedes estar operativo en 48 a 72 horas."],
  ["¿Los pagos son automáticos?", "No todavía. En beta usamos transferencia, DeUna o cobro en club. MATCHPOINT registra el estado y el comprobante, pero el cobro real sigue siendo manual."],
  ["¿Pueden migrar mi información?", "Sí. Podemos cargar canchas, horarios, staff y una base inicial de clientes o socios desde una hoja de cálculo."],
  ["¿Qué soporte recibo?", "Tienes acompañamiento de onboarding y soporte por WhatsApp o email según el plan. Club Fundador incluye revisión quincenal durante el piloto."],
  ["¿Qué pasa si ya uso otro software?", "Puedes correr ambos en paralelo al inicio. La demo sirve para identificar qué se reemplaza, qué se mantiene y qué vale migrar primero."],
] as const;

export function SoyClubPageView() {
  useEffect(() => {
    trackPricingEvent({
      name: "pricing_page_viewed",
      props: { page: "soy_club", audience: "club" },
    });
  }, []);

  function trackClubCta(tierKey: string) {
    trackPricingEvent({
      name: "pricing_tier_cta_clicked",
      props: { tier_key: tierKey, audience: "club", billing_period: "monthly", page: "soy_club" },
    });
  }

  return (
    <>
      <section
        style={{
          position: "relative",
          minHeight: "calc(100vh - 90px)",
          background: "linear-gradient(180deg, #0a0a0a 0%, #111827 58%, #064e3b 120%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 82% 20%, rgba(16,185,129,0.24), transparent 58%)" }} />
        <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 pt-22 md:pt-25 pb-12 md:pb-18 grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-10 md:gap-14 items-center">
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 9999, background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.38)", color: "#6ee7b7", fontSize: 10.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 24 }}>
              ● Para clubes deportivos
            </div>
            <h1 className="font-heading" style={{ fontSize: "clamp(3.2rem, 7vw, 6.6rem)", fontWeight: 900, letterSpacing: "-0.045em", textTransform: "uppercase", margin: 0, lineHeight: 0.92 }}>
              Llena tus canchas
              <br />
              y ordena tu operación<span className="dot">.</span>
            </h1>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.82)", maxWidth: 640, marginTop: 24, lineHeight: 1.65 }}>
              MATCHPOINT centraliza reservas, eventos, comunidad, pagos manuales y reportes para clubes que quieren vender más sin vivir en hojas de cálculo y chats dispersos.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
              <a href="#ventas" className="btn btn-primary" onClick={() => trackClubCta("club_demo")} style={{ padding: "16px 28px", fontSize: 13, textDecoration: "none" }}>
                Agendar demo
                <Icon name="arrow-right" size={14} color="#fff" />
              </a>
              <a href="#planes" className="btn" onClick={() => trackClubCta("club_founder")} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", padding: "15px 26px", fontSize: 13, textDecoration: "none" }}>
                Quiero ser Club Fundador
              </a>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 38, flexWrap: "wrap" }}>
              {(["48-72h", "setup asistido", "sin PSP", "pagos manuales", "mensual", "sin permanencia"] as const).map((item) => (
                <span key={item} style={{ fontSize: 10.5, color: "rgba(255,255,255,0.58)", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 24, background: "#fff", color: "#0a0a0a", boxShadow: "0 24px 70px rgba(0,0,0,0.36)" }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Plan recomendado</div>
            <h2 className="font-heading" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.035em", textTransform: "uppercase", margin: "8px 0 10px" }}>
              Club Pro<span className="dot">.</span>
            </h2>
            <div className="font-heading tabular" style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.04em" }}>
              USD 149.99 <span style={{ fontSize: 14, color: "var(--muted-fg)", fontWeight: 700 }}>/mes</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55 }}>
              Para clubes que necesitan membresías, campañas, reportes, eventos y sponsor local sin esperar integraciones de pago automático.
            </p>
            <div style={{ display: "grid", gap: 9, marginTop: 16 }}>
              {["Reservas y staff", "Eventos y comunidad", "Pagos manuales trazables", "Reportes para crecer"].map((item) => (
                <div key={item} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, fontWeight: 800 }}>
                  <Icon name="check-circle-2" size={15} color="var(--primary)" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-15 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-10 md:gap-14">
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● El problema</div>
            <h2 className="font-heading" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 900, letterSpacing: "-0.035em", textTransform: "uppercase", margin: "12px 0 18px", lineHeight: 1 }}>
              Operar con parches cuesta caro<span className="dot">.</span>
            </h2>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {PROBLEMS.map((item) => (
              <div key={item} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 12, background: "var(--muted)", border: "1px solid var(--border)" }}>
                <Icon name="alert-triangle" size={16} color="#f59e0b" />
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 pb-15 md:pb-20">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● La solución</div>
        <h2 className="font-heading" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 900, letterSpacing: "-0.035em", textTransform: "uppercase", margin: "12px 0 36px", lineHeight: 1 }}>
          Digitaliza operación, comunidad y crecimiento<span className="dot">.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SOLUTIONS.map((item) => (
            <div key={item.title} className="card" style={{ padding: 24 }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(16,185,129,0.12)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon name={item.icon} size={21} color="var(--primary)" />
              </span>
              <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>
                {item.title}<span className="dot">.</span>
              </h3>
              <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55, margin: "8px 0 0" }}>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="planes" className="py-15 md:py-20" style={{ background: "var(--muted)" }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-8">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap", marginBottom: 26 }}>
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Planes</div>
              <h2 className="font-heading" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 900, letterSpacing: "-0.035em", textTransform: "uppercase", margin: "12px 0 0", lineHeight: 1 }}>
                Precios reales para beta<span className="dot">.</span>
              </h2>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", maxWidth: 420, lineHeight: 1.55, margin: 0 }}>
              No cobramos por tarjeta ni prometemos PSP todavía. La venta inicia con onboarding asistido y pagos manuales.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <div key={plan.name} className="card" style={{ padding: 24, border: plan.highlight ? "2px solid var(--primary)" : "1px solid var(--border)", position: "relative" }}>
                {plan.highlight && (
                  <span style={{ position: "absolute", top: -12, left: 22, background: "var(--primary)", color: "#0a0a0a", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", padding: "4px 9px", borderRadius: 999, textTransform: "uppercase" }}>
                    Recomendado
                  </span>
                )}
                <div className="label-mp">{plan.name}</div>
                <div className="font-heading" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", margin: "8px 0 2px" }}>{plan.price}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 800 }}>{plan.sub}</div>
                <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55, margin: "14px 0 18px" }}>{plan.copy}</p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "grid", gap: 9 }}>
                  {plan.items.map((item) => (
                    <li key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, fontWeight: 700 }}>
                      <Icon name="check" size={14} color="var(--primary)" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a href="#ventas" className={plan.highlight ? "btn btn-primary" : "btn"} onClick={() => trackClubCta(plan.name.toLowerCase().replace(/\s+/g, "_"))} style={{ width: "100%", justifyContent: "center", textDecoration: "none", background: plan.highlight ? undefined : "#fff", border: plan.highlight ? undefined : "1px solid var(--border)" }}>
                  Hablar con ventas
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ventas" className="py-15 md:py-20" style={{ background: "#0a0a0a", color: "#fff" }}>
        <div className="max-w-[920px] mx-auto px-4 md:px-8">
          <div className="label-mp" style={{ color: "#6ee7b7" }}>● Agenda una demo</div>
          <h2 className="font-heading" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 900, letterSpacing: "-0.035em", textTransform: "uppercase", margin: "12px 0 12px", lineHeight: 1, textAlign: "center" }}>
            Cuéntanos de tu club<span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", textAlign: "center", margin: "0 0 28px" }}>
            Te contactamos para revisar operación, plan ideal y próximos pasos de implementación.
          </p>
          <ContactSalesForm
            defaultLeadType="club"
            defaultMessage="Me interesa agendar una demo para un club."
            heading="Hablar con ventas"
            description="Déjanos tus datos y el contexto del club. Respondemos en menos de 24 horas hábiles."
            tone="dark"
            ctaLabel="Enviar datos del club"
            onSuccess={(leadId) =>
              trackPricingEvent({
                name: "lead_submitted",
                props: { lead_type: "club", source_url: typeof window !== "undefined" ? window.location.href : null, lead_id: leadId, page: "soy_club" },
              })
            }
          />
        </div>
      </section>

      <section className="max-w-[920px] mx-auto px-4 md:px-8 py-15 md:py-20">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Preguntas frecuentes</div>
        <h2 className="font-heading" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "12px 0 28px", lineHeight: 1 }}>
          Objeciones comunes<span className="dot">.</span>
        </h2>
        {FAQS.map(([question, answer], index) => (
          <details key={question} style={{ padding: "16px 0", borderTop: index === 0 ? "1px solid var(--border)" : undefined, borderBottom: "1px solid var(--border)" }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", fontSize: 15, fontWeight: 900 }}>
              {question}
              <Icon name="plus" size={18} color="var(--primary)" />
            </summary>
            <p style={{ fontSize: 13.5, color: "var(--muted-fg)", margin: "12px 0 0", lineHeight: 1.6 }}>{answer}</p>
          </details>
        ))}
      </section>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 pb-16">
        <div className="card" style={{ padding: 26, display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Siguiente paso</div>
            <h2 className="font-heading" style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "5px 0 0" }}>
              ¿Quieres validar si MATCHPOINT encaja con tu club?<span className="dot">.</span>
            </h2>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="#ventas" className="btn btn-primary" onClick={() => trackClubCta("closing_demo")} style={{ textDecoration: "none" }}>
              Agendar llamada
            </a>
            <Link href="/precios" className="btn" style={{ background: "#fff", border: "1px solid var(--border)", textDecoration: "none" }}>
              Ver precios
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
