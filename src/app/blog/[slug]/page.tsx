import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { BlogPostView } from "@/components/landing/blog/BlogPostView";
import {
  BLOG_POSTS,
  findPostBySlug,
  findRelatedPosts,
} from "@/lib/blog/posts";

const SITE_URL = "https://matchpoint.top";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = findPostBySlug(slug);
  if (!post) return {};
  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = post.coverImage
    ? `${SITE_URL}${post.coverImage}`
    : `${SITE_URL}/og/blog-default.jpg`;
  return {
    title: `${post.title} · MATCHPOINT`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      url,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: post.coverAlt ?? post.title,
        },
      ],
      publishedTime: post.publishedAt,
      authors: [post.author.name],
      tags: [post.category],
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: url },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = findPostBySlug(slug);
  if (!post) notFound();

  const related = findRelatedPosts(post, 3);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = post.coverImage
    ? `${SITE_URL}${post.coverImage}`
    : `${SITE_URL}/og/blog-default.jpg`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: [image],
    datePublished: post.publishedAt,
    author: { "@type": "Person", name: post.author.name },
    publisher: {
      "@type": "Organization",
      name: "MATCHPOINT",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category,
  };

  return (
    <PublicChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogPostView post={post} related={related} />
    </PublicChrome>
  );
}
