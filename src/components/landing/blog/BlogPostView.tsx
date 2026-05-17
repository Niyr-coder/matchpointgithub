"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { BlogPost } from "@/lib/blog/posts";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
}

export function BlogPostView({ post }: { post: BlogPost }) {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "60px 32px 80px" }}>
      <Link
        href="/blog"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--muted-fg)",
          textDecoration: "none",
          marginBottom: 22,
        }}
      >
        <Icon name="arrow-left" size={12} />
        Volver al blog
      </Link>

      <div className="label-mp" style={{ color: "var(--primary)", marginBottom: 14 }}>
        {post.category}
      </div>
      <h1
        className="font-heading"
        style={{
          fontSize: 42,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: 0,
          marginBottom: 18,
        }}
      >
        {post.title}
      </h1>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 12.5,
          color: "var(--muted-fg)",
          marginBottom: 36,
          paddingBottom: 22,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span>{post.author}</span>
        <span>·</span>
        <span>{fmtDate(post.publishedAt)}</span>
        <span>·</span>
        <span>{post.readMin} min de lectura</span>
      </div>

      <article style={{ fontSize: 16, lineHeight: 1.7, color: "#1a1a1a" }}>
        {post.body.map((p, i) => (
          <p key={i} style={{ margin: "0 0 18px" }}>
            {p}
          </p>
        ))}
      </article>

      <div
        style={{
          marginTop: 48,
          padding: 24,
          background: "var(--muted)",
          borderRadius: 14,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "0 0 12px" }}>
          ¿Te sirvió este post? Síguenos para no perderte los próximos.
        </p>
        <Link href="/blog" className="btn">
          <Icon name="book-open" size={13} />
          Ver más posts
        </Link>
      </div>
    </main>
  );
}
