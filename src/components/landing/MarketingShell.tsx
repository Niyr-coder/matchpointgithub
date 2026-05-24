// Layout reutilizable para páginas marketing/contenido del landing.
// Envuelve hero + secciones con el ancho/padding estándar.
import type { ReactNode } from "react";

export function MarketingShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="max-w-[1100px] mx-auto px-4 md:px-8 pt-22 md:pt-25 pb-15 md:pb-20">
      <div className="label-mp" style={{ color: "var(--primary)", marginBottom: 14 }}>
        {eyebrow}
      </div>
      <h1
        className="font-heading text-[34px] md:text-[48px] max-w-[820px]"
        style={{
          fontWeight: 900,
          letterSpacing: "-0.035em",
          textTransform: "uppercase",
          lineHeight: 0.98,
          margin: 0,
          marginBottom: 18,
        }}
      >
        {title}
      </h1>
      {lead && (
        <p
          style={{
            fontSize: 16,
            color: "var(--muted-fg)",
            lineHeight: 1.55,
            maxWidth: 720,
            marginBottom: 48,
          }}
        >
          {lead}
        </p>
      )}
      {children}
    </main>
  );
}

export function ComingSoon({
  eyebrow,
  title,
  hint,
}: {
  eyebrow: string;
  title: ReactNode;
  hint: string;
}) {
  return (
    <MarketingShell
      eyebrow={eyebrow}
      title={title}
      lead="Esta sección está en construcción. Vuelve pronto."
    >
      <div
        style={{
          padding: 48,
          textAlign: "center",
          background: "var(--muted)",
          border: "1px dashed var(--border)",
          borderRadius: 16,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55, maxWidth: 540, margin: "0 auto" }}>
          {hint}
        </div>
      </div>
    </MarketingShell>
  );
}
