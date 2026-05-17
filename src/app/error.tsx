"use client";

// Root error boundary. Catches anything that escapes nested boundaries.
import { useEffect } from "react";
import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
     
    console.error("[root:error]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafafa",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            background: "#fff",
            border: "1px solid #e5e5e5",
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontWeight: 900,
              fontSize: 22,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
            }}
          >
            Algo no funcionó<span style={{ color: "#dc2626" }}>.</span>
          </h1>
          <p style={{ fontSize: 13, color: "#737373", margin: "0 0 16px" }}>
            {error.message || "Error inesperado."}
          </p>
          {error.digest && (
            <div
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                color: "#737373",
                padding: "6px 10px",
                borderRadius: 6,
                background: "#f5f5f4",
                display: "inline-block",
                marginBottom: 16,
              }}
            >
              ID · {error.digest}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 16px",
                background: "#10b981",
                color: "#fff",
                border: 0,
                borderRadius: 9999,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <Link
              href="/"
              style={{
                padding: "10px 16px",
                background: "#fff",
                border: "1px solid #e5e5e5",
                borderRadius: 9999,
                fontWeight: 800,
                textDecoration: "none",
                color: "#0a0a0a",
              }}
            >
              Inicio
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
