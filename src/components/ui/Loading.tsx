// Generic loading placeholder. Use inside a card when data is being fetched.
export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div
      role="status"
      style={{
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "var(--muted-fg)",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "2px solid var(--border)",
          borderTopColor: "var(--primary)",
          animation: "mp-spin 0.9s linear infinite",
        }}
      />
      <span>{label}</span>
      <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
