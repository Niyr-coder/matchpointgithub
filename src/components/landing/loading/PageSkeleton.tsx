// Esqueleto genérico para páginas públicas mientras el server fetch corre.
// Match aproximado a /clubes /eventos /coaches /ranking (hero + grid).
import { PublicChrome } from "@/components/landing/PublicChrome";

const BAR: React.CSSProperties = {
  display: "block",
  background: "linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06))",
  borderRadius: 6,
  animation: "mpSkeleton 1.4s ease-in-out infinite",
};

type Props = {
  variant?: "grid" | "detail";
  cols?: number;
};

export function PageSkeleton({ variant = "grid", cols = 3 }: Props) {
  return (
    <PublicChrome>
      <style>{`@keyframes mpSkeleton { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 32px" }}>
        <div style={{ ...BAR, width: 220, height: 12, marginBottom: 16 }} />
        <div style={{ ...BAR, width: "50%", height: 64, marginBottom: 24 }} />
        <div style={{ ...BAR, width: "70%", maxWidth: 540, height: 14, marginBottom: 28 }} />
        <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ ...BAR, width: 90, height: 36, borderRadius: 9999 }} />
          ))}
        </div>
        {variant === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
            {Array.from({ length: cols * 2 }).map((_, i) => (
              <div
                key={i}
                className="card"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div style={{ ...BAR, height: 160, borderRadius: 0 }} />
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ ...BAR, width: "80%", height: 14 }} />
                  <div style={{ ...BAR, width: "50%", height: 11 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32 }}>
            <div>
              <div style={{ ...BAR, width: 140, height: 12, marginBottom: 16 }} />
              <div style={{ ...BAR, width: "60%", height: 36, marginBottom: 20 }} />
              <div style={{ ...BAR, height: 14, marginBottom: 8 }} />
              <div style={{ ...BAR, height: 14, marginBottom: 8 }} />
              <div style={{ ...BAR, width: "70%", height: 14, marginBottom: 32 }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ ...BAR, height: 44, borderRadius: 8 }} />
                ))}
              </div>
            </div>
            <div>
              <div className="card" style={{ padding: 26 }}>
                <div style={{ ...BAR, width: 80, height: 11, marginBottom: 12 }} />
                <div style={{ ...BAR, width: 140, height: 48, marginBottom: 18 }} />
                <div style={{ ...BAR, height: 44, borderRadius: 8 }} />
              </div>
            </div>
          </div>
        )}
      </main>
    </PublicChrome>
  );
}
