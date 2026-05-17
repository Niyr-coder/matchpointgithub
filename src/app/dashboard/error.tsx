"use client";

// Dashboard route-group error boundary. Catches Server Action / RSC throws and
// renders a recoverable fallback instead of pantalla blanca.
import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry capture — no-op if SENTRY_DSN missing.
     
    console.error("[dashboard:error]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 480, width: "100%", padding: 24, textAlign: "center" }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 16px",
            borderRadius: "50%",
            background: "#fef2f2",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="alert-triangle" size={26} color="#dc2626" />
        </div>
        <h2
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Algo se rompió<span style={{ color: "#dc2626" }}>.</span>
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 8 }}>
          {error.message || "Error inesperado en el dashboard."}
        </p>
        {error.digest && (
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              color: "var(--muted-fg)",
              padding: "6px 10px",
              borderRadius: 6,
              background: "var(--muted)",
              display: "inline-block",
            }}
          >
            ID · {error.digest}
          </div>
        )}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            gap: 8,
            justifyContent: "center",
          }}
        >
          <button onClick={reset} className="btn btn-primary">
            <Icon name="rotate-ccw" size={13} color="#fff" />
            Reintentar
          </button>
          <Link
            href="/"
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
