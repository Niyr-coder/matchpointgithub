"use client";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";

const CASES = [
  {
    club: "Club Norte Pickleball",
    city: "Cumbayá, Quito",
    sport: "Pickleball",
    courts: 4,
    quote:
      "Antes coordinábamos las reservas por WhatsApp y se nos pasaban turnos. Con MatchPoint pasamos a un calendario único; las reservas se llenan solas y nadie se queda esperando.",
    by: "Mauricio P., dueño",
    metrics: [
      { k: "Ocupación", v: "+38%", sub: "vs trimestre anterior" },
      { k: "Reservas/mes", v: "412", sub: "promedio últimos 3 meses" },
      { k: "Tiempo admin", v: "−6 h/sem", sub: "menos llamadas y mensajes" },
    ],
  },
  {
    club: "MatchPoint Quito",
    city: "La Carolina, Quito",
    sport: "Pickleball · Pádel",
    courts: 6,
    quote:
      "Subir las canchas de pádel a la plataforma nos abrió un público nuevo. Los pickleberos ya nos conocían; ahora también nos llegan paddelistas de toda la ciudad.",
    by: "Sofía A., gerente",
    metrics: [
      { k: "Jugadores nuevos", v: "+220", sub: "en 90 días" },
      { k: "Tasa no-show", v: "−54%", sub: "con confirmación de pago" },
      { k: "NPS clientes", v: "78", sub: "primer trimestre" },
    ],
  },
  {
    club: "Smash Sport Cumbayá",
    city: "Cumbayá, Quito",
    sport: "Pickleball",
    courts: 3,
    quote:
      "El check-in en mostrador con MatchPoint nos ahorró el cuaderno. La caja del día cuadra sola y nuestros empleados ya no tienen que armar el reporte a mano.",
    by: "Andrés V., owner",
    metrics: [
      { k: "Ingresos mensuales", v: "+27%", sub: "vs antes de MatchPoint" },
      { k: "Cuadres en caja", v: "100%", sub: "automáticos" },
      { k: "Eventos del club", v: "9", sub: "torneos internos en 6 meses" },
    ],
  },
  {
    club: "Pickle Club Guayaquil",
    city: "Samborondón, Guayaquil",
    sport: "Pickleball",
    courts: 5,
    quote:
      "Nuestra liga mensual creció de 24 a 96 jugadores en 4 ediciones. El bracket y el ranking automático fueron lo que necesitábamos para escalar sin contratar a nadie.",
    by: "Carla M., directora deportiva",
    metrics: [
      { k: "Liga mensual", v: "96 jug.", sub: "vs 24 al empezar" },
      { k: "Ingresos torneos", v: "$3,800", sub: "última edición" },
      { k: "Tiempo armado bracket", v: "−95%", sub: "automatizado por la app" },
    ],
  },
];

export function CasosPageView() {
  return (
    <MarketingShell
      eyebrow="Casos de éxito"
      title={
        <>
          Clubes ecuatorianos que escalaron con MatchPoint
          <span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="Los siguientes son ejemplos representativos de clubes que ya operan con MatchPoint. Si quieres aparecer aquí con tu caso real, escríbenos a hola@matchpoint.top."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {CASES.map((c) => (
          <div
            key={c.club}
            className="card"
            style={{
              padding: 28,
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 28,
              alignItems: "stretch",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #10b981, #047857)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="building-2" size={18} color="#fff" />
                </div>
                <div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    {c.club}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                    {c.city} · {c.sport} · {c.courts} canchas
                  </div>
                </div>
              </div>
              <blockquote
                style={{
                  margin: "14px 0 12px",
                  padding: "14px 18px",
                  borderLeft: "3px solid var(--primary)",
                  background: "var(--muted)",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "#262626",
                }}
              >
                «{c.quote}»
              </blockquote>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>— {c.by}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {c.metrics.map((m) => (
                <div
                  key={m.k}
                  style={{
                    padding: 14,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                  }}
                >
                  <div className="label-mp" style={{ color: "var(--muted-fg)" }}>{m.k}</div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      letterSpacing: "-0.025em",
                      color: "var(--primary)",
                      marginTop: 4,
                    }}
                  >
                    {m.v}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                    {m.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
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
        * Las cifras de esta página son ejemplos representativos del impacto que vemos en clubes
        usando MatchPoint. Para un caso real verificado, contáctanos.
      </p>
    </MarketingShell>
  );
}
