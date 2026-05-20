"use client";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";

const ASSETS = [
  {
    title: "Plantillas Instagram",
    desc: "10 stories + 6 posts editables en Canva. Tu foto, tu nombre, tu tarifa — listas en 5 min.",
    icon: "image",
    badge: "10 stories · 6 posts",
  },
  {
    title: "Banner WhatsApp",
    desc: "Plantilla para tu estado y tu foto de perfil con espacio para tu marca personal.",
    icon: "message-circle",
    badge: "PSD + PNG",
  },
  {
    title: "Cartilla precios",
    desc: "PDF para imprimir o enviar con tus tarifas, paquetes, métodos de pago y QR a tu perfil.",
    icon: "file-text",
    badge: "PDF A4",
  },
  {
    title: "Guía de captación",
    desc: "8 páginas con tácticas que funcionan para conseguir tus primeros 20 alumnos en MATCHPOINT.",
    icon: "book-open",
    badge: "PDF · 8 pág.",
  },
  {
    title: "Logos MATCHPOINT",
    desc: "Logos de la plataforma en distintos formatos para que los uses en tus piezas (acreditando).",
    icon: "shield",
    badge: "SVG + PNG",
  },
  {
    title: "Fotos stock deportivas",
    desc: "Banco de 30 fotos con derechos libres para tus posts: pickleball, pádel y tenis en Ecuador.",
    icon: "camera",
    badge: "30 fotos JPG",
  },
];

export function MaterialPageView() {
  return (
    <MarketingShell
      eyebrow="Material de marketing"
      title={
        <>
          Kit completo para promocionar tus clases<span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="Plantillas, fotos y guías listas para que armes tu marca personal y consigas más alumnos. Gratis para coaches con perfil activo en MATCHPOINT."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 36 }}>
        {ASSETS.map((a) => (
          <div
            key={a.title}
            className="card"
            style={{
              padding: 22,
              position: "relative",
              opacity: 0.95,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "#ecfdf5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Icon name={a.icon} size={18} color="var(--primary)" />
            </div>
            <h3
              className="font-heading"
              style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.015em", margin: "0 0 6px" }}
            >
              {a.title}
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5, margin: "0 0 12px" }}>
              {a.desc}
            </p>
            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "3px 8px",
                background: "var(--muted)",
                borderRadius: 6,
                color: "var(--muted-fg)",
              }}
            >
              {a.badge}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 32,
          background: "#0a0a0a",
          color: "#fff",
          borderRadius: 16,
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 28,
          alignItems: "center",
        }}
      >
        <div>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>Solicitar kit</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "8px 0 10px",
            }}
          >
            Te enviamos el kit por email<span style={{ color: "var(--primary)" }}>.</span>
          </h3>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, margin: 0 }}>
            Para evitar que cualquiera descargue las plantillas, el kit lo enviamos manualmente a
            coaches con perfil activo. Escríbenos desde el correo asociado a tu cuenta MATCHPOINT y
            lo recibes en menos de 24 h.
          </p>
        </div>
        <a
          href="mailto:coaches@matchpoint.top?subject=Solicitud%20kit%20de%20marketing"
          className="btn btn-primary"
          style={{ justifyContent: "center", padding: "12px 18px", fontSize: 14 }}
        >
          <Icon name="mail" size={14} color="#fff" />
          Solicitar kit completo
        </a>
      </div>

      <p
        style={{
          fontSize: 11.5,
          color: "var(--muted-fg)",
          marginTop: 24,
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        * Las plantillas se actualizan trimestralmente. Si ya solicitaste el kit y queremos enviarte
        una nueva versión, te llega por email automáticamente.
      </p>
    </MarketingShell>
  );
}
