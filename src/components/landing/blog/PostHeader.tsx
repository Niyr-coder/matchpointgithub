import Link from "next/link";
import { ShareButtons } from "./ShareButtons";
import type { BlogPost } from "@/lib/blog/posts";

const SITE_URL = "https://matchpoint.top";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function categorySlug(cat: string): string {
  return cat
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-");
}

export function PostHeader({ post }: { post: BlogPost }) {
  const shareUrl = `${SITE_URL}/blog/${post.slug}`;

  return (
    <header className="mx-auto" style={{ maxWidth: 920 }}>
      <Link
        href={`/blog?cat=${categorySlug(post.category)}`}
        className="inline-flex items-center"
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--primary-active)",
          background: "var(--muted)",
          padding: "6px 12px",
          borderRadius: 9999,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        {post.category}
      </Link>
      <h1
        className="font-heading"
        style={{
          fontSize: "clamp(32px, 4.2vw, 48px)",
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: "-0.025em",
          margin: 0,
          marginBottom: 18,
        }}
      >
        {post.title}
      </h1>
      <p
        style={{
          fontSize: 19,
          lineHeight: 1.55,
          color: "var(--muted-fg)",
          margin: 0,
          marginBottom: 24,
        }}
      >
        {post.excerpt}
      </p>
      <div className="flex flex-wrap items-center gap-y-3 gap-x-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden
            className="inline-flex items-center justify-center font-heading"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--muted)",
              color: "var(--fg)",
              fontSize: 12,
              fontWeight: 800,
              backgroundImage: post.author.avatarUrl
                ? `url(${post.author.avatarUrl})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!post.author.avatarUrl && avatarInitials(post.author.name)}
          </span>
          <div
            className="flex flex-wrap items-center gap-x-2"
            style={{ fontSize: 13, color: "var(--muted-fg)" }}
          >
            <span style={{ color: "var(--fg)", fontWeight: 600 }}>
              {post.author.name}
            </span>
            <span aria-hidden>·</span>
            <span>{fmtDate(post.publishedAt)}</span>
            <span aria-hidden>·</span>
            <span>{post.readMinutes} min</span>
          </div>
        </div>
        <div className="ms-auto">
          <ShareButtons url={shareUrl} title={post.title} />
        </div>
      </div>
    </header>
  );
}
