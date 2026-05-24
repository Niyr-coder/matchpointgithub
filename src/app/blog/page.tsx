import type { Metadata } from "next";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { BlogIndexView } from "@/components/landing/blog/BlogIndexView";
import { BLOG_POSTS } from "@/lib/blog/posts";

const SITE_URL = "https://matchpoint.top";

export const metadata: Metadata = {
  title: "Blog · MATCHPOINT",
  description: "Historias, guías y novedades del pickleball en Ecuador.",
  openGraph: {
    title: "Blog · MATCHPOINT",
    description: "Historias, guías y novedades del pickleball en Ecuador.",
    type: "website",
    url: `${SITE_URL}/blog`,
    images: [{ url: "/og/blog-index.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: `${SITE_URL}/blog` },
};

export default function BlogPage() {
  return (
    <PublicChrome>
      <BlogIndexView posts={BLOG_POSTS} />
    </PublicChrome>
  );
}
