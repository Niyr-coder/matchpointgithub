// Skeleton instantáneo entre navegaciones dentro del dashboard.
// El layout ya está renderizado (sidebar + topbar), así que esto solo
// llena el área de <main>. Mantenelo ligero — corre antes de cualquier fetch.
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Block height={140} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Block height={260} />
        <Block height={260} />
      </div>
      <Block height={200} />
    </div>
  );
}

function Block({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 14,
        background:
          "linear-gradient(90deg, var(--muted) 0%, rgba(0,0,0,0.04) 50%, var(--muted) 100%)",
        backgroundSize: "200% 100%",
        animation: "mpSkeleton 1.4s ease-in-out infinite",
      }}
    />
  );
}
