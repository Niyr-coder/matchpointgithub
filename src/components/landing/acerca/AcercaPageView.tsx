"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";

const VALUES = [
  { title: "Comunidad primero", body: "Cada feature se decide pensando en el jugador y el club local de barrio, no en métricas de Silicon Valley." },
  { title: "Pagos del Ecuador para el Ecuador", body: "Transferencia y DeUna, no tarjetas internacionales. Sin comisiones de PSP." },
  { title: "Datos del jugador del jugador", body: "Tu ranking, tu historial y tus contactos son tuyos. Exportables cuando los pidas." },
];

export function AcercaPageView() {
  return (
    <MarketingShell
      eyebrow="Acerca de MatchPoint"
      title={
        <>
          Construido en Quito,<br />
          para el pickleball del Ecuador<span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="MatchPoint nació de la frustración de coordinar partidos y reservar canchas por WhatsApp. Hoy es la plataforma que conecta jugadores, coaches, clubes y partners en una sola app."
    >
      <div className="card" style={{ padding: 28, marginBottom: 32 }}>
        <h3 className="font-heading" style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
          Por qué existimos
          <span className="dot">.</span>
        </h3>
        <p style={{ fontSize: 14, color: "var(--muted-fg)", lineHeight: 1.65, margin: 0 }}>
          El deporte de cancha en Ecuador creció más rápido que la infraestructura digital
          que lo soporta. Clubes coordinan su agenda por mensajes; jugadores invitan amigos
          uno por uno; los torneos viven en planillas dispersas. MatchPoint unifica todo
          eso en una sola plataforma con pagos locales y datos abiertos para la comunidad.
        </p>
      </div>

      <div className="label-mp" style={{ marginBottom: 18 }}>Nuestros principios</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-10">
        {VALUES.map((v) => (
          <div key={v.title} style={{ padding: 22, border: "1px solid var(--border)", borderRadius: 12 }}>
            <Icon name="check-circle-2" size={20} color="var(--primary)" />
            <h4 className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.015em", margin: "10px 0 6px" }}>
              {v.title}
            </h4>
            <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55, margin: 0 }}>
              {v.body}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-7" style={{ background: "#0a0a0a", color: "#fff", borderRadius: 16 }}>
        <div>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>Contacto</div>
          <h3 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", margin: "8px 0 12px" }}>
            ¿Hablamos<span style={{ color: "var(--primary)" }}>?</span>
          </h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, margin: 0 }}>
            Nos escribes a cualquiera de estos canales y te respondemos en menos de 24 h.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignSelf: "center" }}>
          <a href="mailto:hola@matchpoint.top" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", textDecoration: "none", fontSize: 14 }}>
            <Icon name="mail" size={16} color="#fff" />
            hola@matchpoint.top
          </a>
          <Link href="/trabaja-con-nosotros" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", textDecoration: "none", fontSize: 14 }}>
            <Icon name="briefcase" size={16} color="#fff" />
            Trabaja con nosotros
          </Link>
          <Link href="/clubes/precios" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", textDecoration: "none", fontSize: 14 }}>
            <Icon name="building-2" size={16} color="#fff" />
            Precios para clubes
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
