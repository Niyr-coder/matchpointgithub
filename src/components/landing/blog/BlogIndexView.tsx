"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MarketingShell } from "../MarketingShell";
import type { BlogPost } from "@/lib/blog/posts";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
}

export function BlogIndexView({ posts }: { posts: BlogPost[] }) {
  const [featured, ...rest] = posts;
  return (
    <MarketingShell
      eyebrow="Blog MatchPoint"
      title={
        <>
          Historias, guías y novedades del deporte del Ecuador
          <span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="Lo que estamos aprendiendo construyendo la plataforma y conversando con la comunidad: clubes, coaches y jugadores."
    >
      {featured && (
        <Link
          href={`/blog/${featured.slug}`}
          className="card grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 p-6 md:p-8 mb-7 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
              Destacado · {featured.category}
            </div>
            <h2
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
                margin: "0 0 14px",
              }}
            >
              {featured.title}
            </h2>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.78)", lineHeight: 1.55, margin: 0 }}>
              {featured.excerpt}
            </p>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 18 }}>
              {featured.author} · {fmtDate(featured.publishedAt)} · {featured.readMin} min
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
            <span
              className="font-heading"
              style={{
                fontSize: 110,
                fontWeight: 900,
                color: "rgba(255,255,255,0.08)",
                letterSpacing: "-0.06em",
                lineHeight: 0.85,
                transform: "rotate(-4deg)",
                textTransform: "uppercase",
              }}
            >
              READ
            </span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
        {rest.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="card"
            style={{
              padding: 22,
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span
              className="label-mp"
              style={{ color: "var(--primary)", marginBottom: 10 }}
            >
              {p.category}
            </span>
            <h3
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.015em",
                margin: "0 0 8px",
                lineHeight: 1.2,
              }}
            >
              {p.title}
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5, margin: "0 0 14px", flex: 1 }}>
              {p.excerpt}
            </p>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-fg)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{fmtDate(p.publishedAt)} · {p.readMin} min</span>
              <Icon name="arrow-right" size={12} />
            </div>
          </Link>
        ))}
      </div>
    </MarketingShell>
  );
}
