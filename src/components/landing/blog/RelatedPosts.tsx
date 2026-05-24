import Link from "next/link";
import { CoverImage } from "./CoverImage";
import { PostCard } from "./PostCard";
import type { BlogPost } from "@/lib/blog/posts";

type Variant = "sidebar" | "grid";

type Props = {
  posts: BlogPost[];
  variant: Variant;
  className?: string;
};

export function RelatedPosts({ posts, variant, className }: Props) {
  if (posts.length === 0) return null;

  if (variant === "sidebar") {
    return (
      <section aria-label="Lecturas relacionadas" className={className ?? ""}>
        <h3
          className="font-heading"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            margin: 0,
            marginBottom: 12,
          }}
        >
          Lecturas relacionadas
        </h3>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 12,
          }}
        >
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="flex gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-md"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  className="shrink-0 overflow-hidden"
                  style={{ width: 64, height: 64, borderRadius: 10 }}
                >
                  <CoverImage
                    src={p.coverImage}
                    alt={p.coverAlt}
                    category={p.category}
                    title={p.title}
                    aspect="16/9"
                    sizes="64px"
                    rounded={10}
                    showOverlayTitle={false}
                  />
                </div>
                <div className="min-w-0 flex flex-col">
                  <span
                    className="font-heading group-hover:text-[var(--primary)]"
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      letterSpacing: "-0.01em",
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                    }}
                  >
                    {p.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--muted-fg)",
                      marginTop: 4,
                    }}
                  >
                    {p.readMinutes} min · {p.category}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-label="Lecturas relacionadas" className={className ?? ""}>
      <h2
        className="font-heading"
        style={{
          fontSize: 18,
          fontWeight: 800,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          margin: 0,
          marginBottom: 16,
        }}
      >
        Lecturas relacionadas
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </section>
  );
}
