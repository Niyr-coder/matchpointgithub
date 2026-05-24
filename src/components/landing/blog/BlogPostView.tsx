import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PostHeader } from "./PostHeader";
import { CoverImage } from "./CoverImage";
import { MDXContent } from "./MDXContent";
import { RelatedPosts } from "./RelatedPosts";
import { ContextualPostCTA } from "./ContextualPostCTA";
import { NewsletterCard } from "./NewsletterCard";
import type { BlogPost } from "@/lib/blog/posts";

type Props = {
  post: BlogPost;
  related: BlogPost[];
};

export function BlogPostView({ post, related }: Props) {
  return (
    <main className="max-w-[1180px] mx-auto px-4 md:px-8 pt-22 md:pt-25 pb-15 md:pb-20">
      <Link
        href="/blog"
        className="inline-flex items-center"
        style={{
          gap: 6,
          fontSize: 12.5,
          color: "var(--muted-fg)",
          textDecoration: "none",
          marginBottom: 22,
        }}
      >
        <Icon name="arrow-left" size={12} />
        Volver al blog
      </Link>

      <PostHeader post={post} />

      <div className="mx-auto mt-8 md:mt-10 mb-10" style={{ maxWidth: 1100 }}>
        <CoverImage
          src={post.coverImage}
          alt={post.coverAlt}
          category={post.category}
          title={post.title}
          aspect="16/9"
          priority
          rounded={20}
          sizes="(min-width: 1024px) 1100px, 100vw"
        />
      </div>

      <article className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12">
        <div>
          <MDXContent body={post.body} />
        </div>
        <aside className="hidden lg:block">
          <div
            className="sticky"
            style={{
              top: "calc(var(--site-nav-h, 76px) + 24px)",
              display: "grid",
              gap: 24,
            }}
          >
            <RelatedPosts posts={related} variant="sidebar" />
            <ContextualPostCTA post={post} variant="sidebar" />
            <NewsletterCard
              variant="compact"
              source="blog_post_sidebar"
              id="newsletter-sidebar"
            />
          </div>
        </aside>
      </article>

      <ContextualPostCTA post={post} variant="band" />

      <RelatedPosts
        posts={related}
        variant="grid"
        className="lg:hidden mt-12"
      />

      <NewsletterCard
        variant="band"
        source="blog_post_band"
        id="newsletter-band"
        className="lg:hidden"
      />
    </main>
  );
}
