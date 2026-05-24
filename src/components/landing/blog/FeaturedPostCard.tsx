import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CoverImage } from "./CoverImage";
import type { BlogPost } from "@/lib/blog/posts";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function FeaturedPostCard({ post }: { post: BlogPost }) {
  return (
    <article className="mp-blog-featured grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 md:gap-8 mb-10 md:mb-12">
      <div className="overflow-hidden rounded-[16px]">
        <CoverImage
          src={post.coverImage}
          alt={post.coverAlt}
          category={post.category}
          title={post.title}
          aspect="16/9"
          priority
          sizes="(min-width: 1024px) 600px, 100vw"
          rounded={16}
        />
      </div>
      <div className="flex flex-col justify-center">
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
          Destacado · {post.category}
        </span>
        <h2
          className="font-heading mt-3"
          style={{
            fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
            margin: 0,
          }}
        >
          <Link
            href={`/blog/${post.slug}`}
            className="focus:outline-none focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            {post.title}
          </Link>
        </h2>
        <p
          className="mt-4"
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--muted-fg)",
            maxWidth: 540,
          }}
        >
          {post.excerpt}
        </p>
        <div
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1"
          style={{ fontSize: 12.5, color: "var(--muted-fg)" }}
        >
          <span>{post.author.name}</span>
          <span aria-hidden>·</span>
          <span>{fmtDate(post.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span>{post.readMinutes} min</span>
        </div>
        <div className="mt-5">
          <Link
            href={`/blog/${post.slug}`}
            className="btn btn-primary inline-flex items-center gap-2"
            style={{ paddingInline: 18 }}
          >
            Leer artículo
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
