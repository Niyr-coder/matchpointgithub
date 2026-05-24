import { Icon } from "@/components/Icon";

/**
 * "¿Cómo cobramos?" block — copy exactly as approved in MAT-19 decision.
 * Static content; can render server-side.
 */
export function PaymentExplainer() {
  return (
    <section
      aria-labelledby="payment-explainer-heading"
      style={{
        marginTop: 56,
        padding: 32,
        background: "var(--muted)",
        borderRadius: 18,
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 28,
        alignItems: "start",
      }}
      className="payment-explainer"
    >
      <div>
        <div className="label-mp" style={{ color: "var(--primary-active)", marginBottom: 10 }}>
          ¿Cómo cobramos?
        </div>
        <h2
          id="payment-explainer-heading"
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: "0 0 14px",
          }}
        >
          Sin comisión por reserva del club<span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg)", margin: "0 0 12px" }}>
          Hoy aceptamos pagos por <strong>transferencia bancaria</strong> y <strong>DeUna</strong>{" "}
          (Ecuador) — el cobro al jugador llega íntegro al club. La suscripción de tu plan se activa
          con un comprobante.
        </p>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--fg)",
            margin: "0 0 12px",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ marginTop: 2, flexShrink: 0 }}>
            <Icon name="clock" size={14} color="var(--primary)" />
          </span>
          <span>
            Desde{" "}
            <strong style={{ color: "var(--primary-active)", fontWeight: 800 }}>Octubre 2026</strong>{" "}
            activamos cobro automático con tarjeta vía <strong>Stripe Connect</strong>. Los tiers y
            bullets de esta página ya están adaptados para esa transición — no tienes que cambiar
            nada cuando llegue.
          </span>
        </p>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted-fg)",
            margin: 0,
            lineHeight: 1.55,
            fontStyle: "italic",
          }}
        >
          La take-rate de torneos (10% Free / 5% Partner Pro) y de clases (20% / 10% / 7%) se cobra
          al jugador o alumno al inscribirse, no al club por recibir el dinero.
        </p>
      </div>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: "rgba(16,185,129,0.12)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="wallet" size={44} color="var(--primary)" />
        </div>
      </div>
    </section>
  );
}
