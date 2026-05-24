"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";
import { ContactSalesForm } from "../forms/ContactSalesForm";
import type { SalesLeadType } from "@/lib/schemas/sales-leads";
import { trackPricingEvent } from "@/lib/telemetry/pricing";

const CONTACT_ANCHOR = "contacto-ventas";

type SalesPreset = {
  leadType: SalesLeadType;
  message: string;
};

type TierCtaKind =
  | { kind: "link"; href: string }
  | { kind: "contact"; preset: SalesPreset };

type Tier = {
  name: string;
  priceMonth: number | null;
  desc: string;
  features: string[];
  cta: string;
  ctaTarget: TierCtaKind;
  highlight: boolean;
};

const PLAYER_TIERS: Tier[] = [
  {
    name: "Free",
    priceMonth: 0,
    desc: "Para empezar a jugar y descubrir clubes de tu ciudad.",
    features: [
      "Crear cuenta y perfil deportivo",
      "Reservar canchas en clubes activos",
      "Inscribirte a eventos y torneos abiertos",
      "Ranking básico nacional",
      "Mensajería con jugadores de tu zona",
    ],
    cta: "Crear cuenta",
    ctaTarget: { kind: "link", href: "/auth/signup" },
    highlight: false,
  },
  {
    name: "MATCHPOINT+",
    priceMonth: 5,
    desc: "Para quienes juegan varias veces por semana y arman partidos.",
    features: [
      "Todo lo del plan Free",
      "Reservas sin tope mensual",
      "Estadísticas históricas detalladas",
      "Ranking premium con analytics",
      "Crear juegos / matches sin límite",
      "Soporte prioritario",
    ],
    cta: "Activar MATCHPOINT+",
    ctaTarget: { kind: "link", href: "/dashboard/user?upgrade=premium" },
    highlight: true,
  },
];

const CLUB_TIERS: Tier[] = [
  {
    name: "Starter",
    priceMonth: 0,
    desc: "Para clubes que recién están armando su agenda online.",
    features: [
      "Hasta 2 canchas activas",
      "Calendario de reservas",
      "Hasta 50 reservas/mes",
      "Soporte por email",
    ],
    cta: "Empezar gratis",
    ctaTarget: { kind: "link", href: "/soy-club" },
    highlight: false,
  },
  {
    name: "Pro",
    priceMonth: 29,
    desc: "Para clubes activos con varios deportes y empleados de mostrador.",
    features: [
      "Canchas ilimitadas",
      "Reservas ilimitadas",
      "Roster de empleados y check-in",
      "Pagos por transferencia + DeUna",
      "Eventos y torneos del club",
      "Soporte prioritario",
    ],
    cta: "Hablar con ventas",
    ctaTarget: {
      kind: "contact",
      preset: {
        leadType: "club",
        message: "Me interesa el plan Pro para clubes.",
      },
    },
    highlight: true,
  },
  {
    name: "Partner",
    priceMonth: null,
    desc: "Organizaciones que corren torneos en múltiples clubes.",
    features: [
      "Multi-club bajo un mismo brand",
      "Brackets, ligas y rankings dedicados",
      "Comisión negociada por torneo",
      "Onboarding personalizado",
    ],
    cta: "Hablar con ventas",
    ctaTarget: {
      kind: "contact",
      preset: {
        leadType: "partner",
        message: "Me interesa el plan Partner para organizadores multi-club.",
      },
    },
    highlight: false,
  },
];

function TierCard({
  t,
  onContact,
}: {
  t: Tier;
  onContact: (preset: SalesPreset) => void;
}) {
  const btnStyle: React.CSSProperties = t.highlight
    ? { width: "100%", justifyContent: "center" }
    : {
        width: "100%",
        justifyContent: "center",
        background: "#fff",
        border: "1px solid var(--border)",
      };
  const btnClass = t.highlight ? "btn btn-primary" : "btn";

  return (
    <div
      className="card"
      style={{
        padding: 26,
        border: t.highlight ? "2px solid var(--primary)" : "1px solid var(--border)",
        position: "relative",
      }}
    >
      {t.highlight && (
        <span
          style={{
            position: "absolute",
            top: -12,
            left: 26,
            background: "var(--primary)",
            color: "#0a0a0a",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.14em",
            padding: "4px 9px",
            borderRadius: 6,
            textTransform: "uppercase",
          }}
        >
          Más popular
        </span>
      )}
      <div className="label-mp" style={{ color: "var(--muted-fg)" }}>{t.name}</div>
      <div
        className="font-heading"
        style={{
          fontSize: 38,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          margin: "6px 0 8px",
        }}
      >
        {t.priceMonth == null ? "A medida" : `$${t.priceMonth}`}
        {t.priceMonth != null && t.priceMonth > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted-fg)" }}> /mes</span>
        )}
        {t.priceMonth === 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted-fg)" }}> /siempre</span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5, margin: "0 0 18px" }}>
        {t.desc}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 9 }}>
        {t.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
            <Icon name="check-circle-2" size={14} color="var(--primary)" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {t.ctaTarget.kind === "link" ? (
        <Link href={t.ctaTarget.href} className={btnClass} style={btnStyle}>
          {t.cta}
        </Link>
      ) : (
        <button
          type="button"
          className={btnClass}
          style={btnStyle}
          onClick={() => onContact((t.ctaTarget as { kind: "contact"; preset: SalesPreset }).preset)}
        >
          {t.cta}
        </button>
      )}
    </div>
  );
}

export function PreciosPageView() {
  const [preset, setPreset] = useState<SalesPreset>({
    leadType: "club",
    message: "",
  });

  useEffect(() => {
    trackPricingEvent({ name: "pricing_page_viewed" });
  }, []);

  function handleContact(next: SalesPreset) {
    setPreset(next);
    if (typeof window !== "undefined") {
      const el = document.getElementById(CONTACT_ANCHOR);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  return (
    <MarketingShell
      eyebrow="Precios"
      title={
        <>
          Sin permanencia. Sin comisión por reserva
          <span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead={
        <>
          <strong style={{ color: "#0a0a0a" }}>¿Cómo cobramos?</strong>
          <br />
          Sin comisión por reserva del club. Hoy aceptamos pagos por transferencia bancaria y DeUna (Ecuador). A partir de <strong style={{ color: "#0a0a0a" }}>Octubre 2026</strong> activamos cobro automático con tarjeta vía Stripe Connect — los planes y bullets ya están adaptados para esa transición.
        </>
      }
    >
      <section style={{ marginBottom: 56 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 18,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Para jugadores<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            Activas Premium con un comprobante de transferencia o DeUna.
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {PLAYER_TIERS.map((t) => (
            <TierCard key={t.name} t={t} onContact={handleContact} />
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 18,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Para clubes<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            Solo pagas la suscripción del plan; sin porcentaje por reserva.
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {CLUB_TIERS.map((t) => (
            <TierCard key={t.name} t={t} onContact={handleContact} />
          ))}
        </div>
      </section>

      <section id={CONTACT_ANCHOR} style={{ marginBottom: 48, scrollMarginTop: 90 }}>
        <ContactSalesForm
          // Remount the form when the user clicks a different tier CTA so
          // defaultLeadType/defaultMessage re-seed state cleanly.
          key={`${preset.leadType}::${preset.message}`}
          heading="Hablar con ventas"
          description="Cuéntanos sobre tu club o partner y te contactamos en menos de 24 horas hábiles."
          defaultLeadType={preset.leadType}
          defaultMessage={preset.message}
          ctaLabel="Enviar mensaje"
        />
      </section>

      <div
        style={{
          padding: 24,
          background: "var(--muted)",
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <h3
          className="font-heading"
          style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}
        >
          Preguntas frecuentes
        </h3>
        <div style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55 }}>
          <strong style={{ color: "#0a0a0a" }}>¿MATCHPOINT cobra comisión por reserva o pago?</strong>{" "}
          No. Solo pagas la suscripción de tu plan; cada reserva o cobro que recibe el club te llega
          íntegro.
          <br /><br />
          <strong style={{ color: "#0a0a0a" }}>¿Cómo activo Premium?</strong> Desde tu dashboard
          pides el upgrade, haces la transferencia o DeUna, subes el comprobante y nosotros lo
          aprobamos en menos de 24 h. Tu plan queda activo 30 días desde la aprobación.
          <br /><br />
          <strong style={{ color: "#0a0a0a" }}>¿Puedo cambiar de plan después?</strong> Sí, en
          cualquier momento. Sin permanencia. Si bajas de Premium a Free, el resto del mes ya pagado
          sigue activo.
          <br /><br />
          <strong style={{ color: "#0a0a0a" }}>¿Cómo se cobra a los jugadores en el club?</strong>{" "}
          Por transferencia bancaria o DeUna. El jugador sube comprobante y el admin del club lo
          aprueba desde el panel.
        </div>
      </div>
    </MarketingShell>
  );
}
