"use client";

// Placeholder enroll — reemplazar por QR + verify cuando conectemos la UI.
export function MfaEnrollPlaceholder({ next }: { next: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg, #fafafa)",
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: "100%", padding: 28, textAlign: "center" }}
      >
        <div
          className="label-mp"
          style={{ color: "var(--primary)", marginBottom: 8 }}
        >
          ● Seguridad staff
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            margin: "0 0 8px",
          }}
        >
          Activa 2FA
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55, margin: "0 0 20px" }}>
          Las cuentas operativas de MATCHPOINT requieren un código de tu app
          autenticadora (Google Authenticator, 1Password, etc.). La configuración
          visual llegará en la siguiente fase; la infraestructura ya está lista.
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--muted-fg)",
            margin: 0,
            wordBreak: "break-all",
          }}
        >
          Destino tras completar: {next}
        </p>
      </div>
    </main>
  );
}
