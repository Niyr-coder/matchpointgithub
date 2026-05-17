import { notFound } from "next/navigation";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { BlogPostView } from "@/components/landing/blog/BlogPostView";
import { findPostBySlug, BLOG_POSTS } from "@/lib/blog/posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = findPostBySlug(slug);
  if (!post) notFound();
  return (
    <PublicChrome>
      <BlogPostView post={post} />
    </PublicChrome>
  );
}
