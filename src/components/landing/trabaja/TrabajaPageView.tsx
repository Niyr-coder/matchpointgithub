"use client";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";

const OPENINGS = [
  { area: "Producto", role: "Diseñador/a UI Senior", ubic: "Quito · Híbrido", typ: "Full-time" },
  { area: "Ingeniería", role: "Full-stack TypeScript", ubic: "Remoto LATAM", typ: "Full-time" },
  { area: "Operaciones", role: "Account Manager Clubes", ubic: "Quito · Presencial", typ: "Full-time" },
];

export function TrabajaPageView() {
  return (
    <MarketingShell
      eyebrow="Trabaja con nosotros"
      title={
        <>
          Construye la cancha digital del Ecuador<span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="Somos un equipo pequeño en Quito construyendo la plataforma deportiva más usada del país. Si te apasiona el deporte y resolver problemas reales con software local, nos interesa tu CV."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {OPENINGS.map((o) => (
          <div
            key={o.role}
            style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr auto",
              gap: 18,
              alignItems: "center",
              padding: 18,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            <span
              className="label-mp"
              style={{ color: "var(--muted-fg)", letterSpacing: "0.14em" }}
            >
              {o.area}
            </span>
            <div>
              <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em" }}>
                {o.role}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
                {o.ubic} · {o.typ}
              </div>
            </div>
            <a
              href={`mailto:trabaja@matchpoint.top?subject=Aplicación%20·%20${encodeURIComponent(o.role)}`}
              className="btn btn-primary"
              style={{ fontSize: 12 }}
            >
              Postular
              <Icon name="arrow-right" size={12} color="#fff" />
            </a>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 24, background: "var(--muted)" }}>
        <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
          No ves tu rol<span className="dot">.</span>
        </h3>
        <p style={{ fontSize: 13.5, color: "var(--muted-fg)", lineHeight: 1.55, margin: "0 0 14px" }}>
          Si crees que podemos sumarte aunque no tengamos vacante abierta, mándanos tu CV y un párrafo
          de por qué te interesa MatchPoint. Te respondemos siempre.
        </p>
        <a
          href="mailto:trabaja@matchpoint.top?subject=Postulación%20espontánea"
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
        >
          <Icon name="mail" size={13} />
          trabaja@matchpoint.top
        </a>
      </div>
    </MarketingShell>
  );
}
