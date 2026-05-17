"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";

const FLOW = [
  {
    n: "01",
    title: "Crea tu perfil de coach",
    body: "Foto, biografía, deportes, niveles que enseñas y zonas donde das clases. Verificamos tu identidad y subes tu cédula como respaldo.",
  },
  {
    n: "02",
    title: "Define tus tarifas",
    body: "Una tarifa por hora individual y una para grupos. Puedes tener tarifas distintas según nivel del alumno o si es clase a domicilio.",
  },
  {
    n: "03",
    title: "Los alumnos te encuentran",
    body: "Tu perfil aparece en /coaches según deporte, nivel y ciudad. Los alumnos reservan clase desde la app y te llega notificación inmediata.",
  },
  {
    n: "04",
    title: "Cobras por transferencia o DeUna",
    body: "El alumno paga al inscribirse en la clase: sube comprobante de transferencia o DeUna, tú validas. Te queda registro de cada cobro en tu panel.",
  },
];

export function ComoCobrarPageView() {
  return (
    <MarketingShell
      eyebrow="Para coaches"
      title={
        <>
          Cobra tus clases sin tarjetas ni comisiones internacionales<span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="MatchPoint no se queda con porcentaje de tus clases. Recibes el pago íntegro a tu cuenta o DeUna directo, igual que si te pagaran en persona."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 48 }}>
        {FLOW.map((s) => (
          <div
            key={s.n}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr",
              gap: 18,
              padding: 22,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            <div
              className="font-heading"
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "var(--primary)",
              }}
            >
              {s.n}
            </div>
            <div>
              <h3
                className="font-heading"
                style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", margin: "0 0 6px" }}
              >
                {s.title}
              </h3>
              <p style={{ fontSize: 13.5, color: "var(--muted-fg)", lineHeight: 1.55, margin: 0 }}>
                {s.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 26 }}>
        <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
          Sobre comisiones
          <span className="dot">.</span>
        </h3>
        <div style={{ fontSize: 13.5, color: "var(--muted-fg)", lineHeight: 1.6 }}>
          MatchPoint cobra una <strong style={{ color: "#0a0a0a" }}>tarifa fija de plataforma</strong> al
          coach (USD 9/mes después de los primeros 30 días). No tomamos porcentaje de cada clase. Los
          pagos por transferencia/DeUna llegan directo a tu cuenta — nosotros solo registramos la
          transacción en tu panel para que tengas historial fiscal.
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <Link href="/coaches" className="btn btn-primary">
            <Icon name="graduation-cap" size={14} color="#fff" />
            Ver coaches activos
          </Link>
          <a href="mailto:coaches@matchpoint.top?subject=Quiero%20ser%20coach%20MatchPoint" className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            <Icon name="mail" size={14} />
            Escribirnos
          </a>
        </div>
      </div>
    </MarketingShell>
  );
}
