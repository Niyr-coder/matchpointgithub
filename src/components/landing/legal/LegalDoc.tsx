"use client";
import type { ReactNode } from "react";

// Layout de documento legal: tipografía centrada, secciones numeradas.
export function LegalDoc({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "60px 32px 80px" }}>
      <div className="label-mp" style={{ color: "var(--primary)", marginBottom: 14 }}>
        {eyebrow}
      </div>
      <h1
        className="font-heading"
        style={{
          fontSize: 40,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          lineHeight: 1,
          margin: 0,
          marginBottom: 10,
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 40px" }}>
        Última actualización: {updated} · Jurisdicción: Ecuador
      </p>
      <article
        style={{
          fontSize: 14.5,
          lineHeight: 1.7,
          color: "#262626",
        }}
      >
        {children}
      </article>
    </main>
  );
}

export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        className="font-heading"
        style={{
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: "-0.015em",
          textTransform: "uppercase",
          margin: "0 0 8px",
        }}
      >
        {n}. {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}
