import { PublicChrome } from "@/components/landing/PublicChrome";
import { BlogIndexView } from "@/components/landing/blog/BlogIndexView";
import { BLOG_POSTS } from "@/lib/blog/posts";

export default function BlogPage() {
  return (
    <PublicChrome>
      <BlogIndexView posts={BLOG_POSTS} />
    </PublicChrome>
  );
}
