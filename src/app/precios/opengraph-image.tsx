import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Precios — MATCHPOINT";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          background:
            "radial-gradient(140% 90% at 100% 0%, rgba(16,185,129,0.20) 0%, rgba(10,10,10,1) 60%), #0a0a0a",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#10b981",
              marginRight: 14,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: -0.5,
              textTransform: "uppercase",
            }}
          >
            MATCHPOINT
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#10b981",
              marginBottom: 24,
            }}
          >
            Precios
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 78,
              lineHeight: 1,
              fontWeight: 900,
              letterSpacing: -2.5,
              textTransform: "uppercase",
              maxWidth: 980,
              marginBottom: 24,
            }}
          >
            Precios honestos para cada lado de la cancha.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "rgba(255,255,255,0.78)",
              maxWidth: 920,
              lineHeight: 1.35,
            }}
          >
            Jugadores · Clubes · Partners · Coaches. Sin permanencia y sin comisión por reserva del club.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "rgba(255,255,255,0.6)",
              letterSpacing: 1,
            }}
          >
            matchpoint.top/precios
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "rgba(255,255,255,0.6)",
              letterSpacing: 1,
            }}
          >
            Free · MP+ $5 · Club Pro $49 · Coach Pro $35
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
