"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";

const STEPS = [
  {
    n: "01",
    title: "Encuentra tu cancha",
    body: "Busca clubes en tu ciudad por deporte, distancia o precio. Mira disponibilidad real en tiempo real, sin llamar ni esperar respuesta.",
    icon: "search",
  },
  {
    n: "02",
    title: "Reserva en segundos",
    body: "Elige día, cancha y duración (1 h o 2 h). Confirma y subes tu comprobante de transferencia o DeUna. El club aprueba y tu cupo queda asegurado.",
    icon: "calendar-check",
  },
  {
    n: "03",
    title: "Súbete al ranking",
    body: "Cada partido que reportas suma puntos a tu ranking nacional. Compite en torneos, eventos sociales y ligas mensuales.",
    icon: "trophy",
  },
];

const FEATURES = [
  { title: "Disponibilidad real", body: "Vemos los cupos directamente del calendario del club. Nada de horarios desactualizados." },
  { title: "Pagos por transferencia o DeUna", body: "Sin tarjetas internacionales ni comisiones extras. Subes tu comprobante y listo." },
  { title: "Comunidad de pickleball, pádel y tenis", body: "Encuentra rivales de tu nivel, arma partidos, descubre torneos abiertos a tu categoría." },
  { title: "Tu historial deportivo", body: "Reservas, partidos jugados, eventos asistidos y ranking — todo en un solo lugar." },
];

export function ComoFuncionaPageView() {
  return (
    <MarketingShell
      eyebrow="Cómo funciona"
      title={
        <>
          Reserva, juega y sube de nivel<span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="MATCHPOINT es la plataforma #1 de pickleball en Ecuador. Conecta jugadores con clubes y eventos en tu ciudad, con disponibilidad real y pago local."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-14">
        {STEPS.map((s) => (
          <div key={s.n} className="card" style={{ padding: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "#ecfdf5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <Icon name={s.icon} size={20} color="var(--primary)" />
            </div>
            <div className="label-mp" style={{ color: "var(--muted-fg)", marginBottom: 6 }}>
              Paso {s.n}
            </div>
            <h3
              className="font-heading"
              style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", margin: "0 0 8px" }}
            >
              {s.title}
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5, margin: 0 }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>

      <div className="label-mp" style={{ marginBottom: 18 }}>¿Qué hace distinto a MATCHPOINT?</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-14">
        {FEATURES.map((f) => (
          <div key={f.title} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Icon name="check-circle-2" size={15} color="var(--primary)" />
              <strong style={{ fontSize: 14 }}>{f.title}</strong>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5, margin: 0 }}>
              {f.body}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 32,
          background: "#0a0a0a",
          color: "#fff",
          borderRadius: 16,
          textAlign: "center",
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
            margin: 0,
            marginBottom: 8,
          }}
        >
          Empieza a jugar hoy<span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 18px" }}>
          Crear tu cuenta toma menos de un minuto. Sin tarjeta de crédito.
        </p>
        <Link
          href="/auth/signup"
          className="btn btn-primary"
          style={{ display: "inline-flex" }}
        >
          <Icon name="user-plus" size={14} color="#fff" />
          Crear cuenta gratis
        </Link>
      </div>
    </MarketingShell>
  );
}
