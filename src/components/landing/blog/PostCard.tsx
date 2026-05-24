import Link from "next/link";
import { CoverImage } from "./CoverImage";
import type { BlogPost } from "@/lib/blog/posts";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
  });
}

export function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="mp-blog-card group relative flex flex-col h-full">
      <Link
        href={`/blog/${post.slug}`}
        aria-label={post.title}
        className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-[14px]"
      />
      <div className="mp-blog-cover overflow-hidden rounded-[12px]">
        <CoverImage
          src={post.coverImage}
          alt={post.coverAlt}
          category={post.category}
          title={post.title}
          aspect="16/9"
          sizes="(min-width: 1024px) 360px, 100vw"
        />
      </div>
      <div className="pt-4 flex flex-col flex-1">
        <span
          className="font-heading"
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--primary-active)",
          }}
        >
          {post.category}
        </span>
        <h3
          className="font-heading mt-2"
          style={{
            fontSize: 19,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.015em",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {post.title}
        </h3>
        <p
          className="mt-2"
          style={{
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "var(--muted-fg)",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {post.excerpt}
        </p>
        <div
          className="mt-3 flex items-center gap-2"
          style={{ fontSize: 12, color: "var(--muted-fg)" }}
        >
          <span>{fmtDate(post.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span>{post.readMinutes} min</span>
        </div>
      </div>
    </article>
  );
}
