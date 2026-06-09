// Esqueleto genérico para páginas públicas mientras el server fetch corre.
// Match aproximado a /clubes /eventos /coaches /ranking (hero + grid).
//
// Importante: este skeleton se renderiza desde loading.tsx (Suspense fallback)
// y debe poder hacerlo de forma sincrónica. Por eso NO usamos PublicChrome
// (que es server async + lee sesión), sino el wrapper client con auth=null.
// La sesión real la resolverá la pantalla cuando el contenido finalize.
import { PublicChromeClient } from "@/components/landing/PublicChromeClient";

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
    <PublicChromeClient auth={null}>
      <style>{`@keyframes mpSkeleton { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-15">
        <div style={{ ...BAR, width: 220, height: 12, marginBottom: 16 }} />
        <div style={{ ...BAR, width: "50%", height: 64, marginBottom: 24 }} />
        <div style={{ ...BAR, width: "70%", maxWidth: 540, height: 14, marginBottom: 28 }} />
        <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ ...BAR, width: 90, height: 36, borderRadius: 9999 }} />
          ))}
        </div>
        {variant === "grid" ? (
          <div
            className="mp-page-skeleton-grid"
            style={{ "--mp-cols": cols } as React.CSSProperties}
          >
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
          <div className="mp-landing-split" style={{ gap: 32 }}>
            <div>
              <div style={{ ...BAR, width: 140, height: 12, marginBottom: 16 }} />
              <div style={{ ...BAR, width: "60%", height: 36, marginBottom: 20 }} />
              <div style={{ ...BAR, height: 14, marginBottom: 8 }} />
              <div style={{ ...BAR, height: 14, marginBottom: 8 }} />
              <div style={{ ...BAR, width: "70%", height: 14, marginBottom: 32 }} />
              <div className="mp-page-skeleton-detail-kpis">
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
    </PublicChromeClient>
  );
}
