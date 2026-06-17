"use client";

// Placeholder verify — reemplazar por input 6 dígitos + challengeAndVerifyTotp.
export function MfaVerifyPlaceholder({ next }: { next: string }) {
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
          ● Verificación 2FA
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
          Confirma tu identidad
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55, margin: "0 0 20px" }}>
          Ingresa el código de 6 dígitos de tu app autenticadora para acceder al
          panel staff. El formulario se conectará en la siguiente fase.
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--muted-fg)",
            margin: 0,
            wordBreak: "break-all",
          }}
        >
          Destino tras verificar: {next}
        </p>
      </div>
    </main>
  );
}
