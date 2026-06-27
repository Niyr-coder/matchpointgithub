export const metadata = {
  robots: { index: false, follow: false },
};

export default function TvEmptyPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 32,
        fontFamily: "Plus Jakarta Sans, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#10b981",
        }}
      >
        ● MATCHPOINT · Pantalla de venue
      </div>

      <div
        style={{
          fontSize: "clamp(28px, 6vw, 64px)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color: "#fff",
          textAlign: "center",
          lineHeight: 1,
        }}
      >
        tv.matchpoint.top
      </div>

      <div
        style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.5)",
          textAlign: "center",
          maxWidth: 420,
          lineHeight: 1.6,
        }}
      >
        Esta pantalla muestra resultados en vivo de torneos MATCHPOINT.
        El organizador del evento debe enviarte el link con el código de acceso.
      </div>

      <div
        style={{
          marginTop: 8,
          padding: "14px 24px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.35)",
          fontSize: 13,
          fontFamily: "monospace",
          letterSpacing: "0.04em",
        }}
      >
        tv.matchpoint.top/nombre-torneo?k=código
      </div>
    </div>
  );
}
