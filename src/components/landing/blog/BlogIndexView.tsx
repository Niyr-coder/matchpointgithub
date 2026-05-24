"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MarketingShell } from "../MarketingShell";
import { CategoryFilterBar } from "./CategoryFilterBar";
import { FeaturedPostCard } from "./FeaturedPostCard";
import { PostCard } from "./PostCard";
import { BlogEmpty } from "./BlogEmpty";
import { NewsletterCard } from "./NewsletterCard";
import type { BlogPost } from "@/lib/blog/posts";

const ALL = "Todos";

function slugifyCategory(cat: string): string {
  return cat
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-");
}

export function BlogIndexView({ posts }: { posts: BlogPost[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const categories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => set.add(p.category));
    return [ALL, ...Array.from(set)];
  }, [posts]);

  const active = useMemo(() => {
    const raw = searchParams?.get("cat");
    if (!raw) return ALL;
    const match = categories.find(
      (c) => slugifyCategory(c) === raw.toLowerCase(),
    );
    return match ?? ALL;
  }, [searchParams, categories]);

  const onChange = useCallback(
    (cat: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (cat === ALL) params.delete("cat");
      else params.set("cat", slugifyCategory(cat));
      const qs = params.toString();
      router.replace(qs ? `/blog?${qs}` : "/blog", { scroll: false });
    },
    [router, searchParams],
  );

  const filtered = useMemo(
    () => (active === ALL ? posts : posts.filter((p) => p.category === active)),
    [posts, active],
  );

  const [featured, ...rest] = filtered;

  return (
    <MarketingShell
      eyebrow="Blog MATCHPOINT"
      title={
        <>
          Historias, guías y novedades del deporte del Ecuador
          <span style={{ color: "var(--primary)" }}>.</span>
        </>
      }
      lead="Lo que estamos aprendiendo construyendo la plataforma y conversando con la comunidad: clubes, coaches y jugadores."
    >
      <CategoryFilterBar
        categories={categories}
        active={active}
        onChange={onChange}
      />

      {filtered.length === 0 ? (
        <BlogEmpty
          reason="no_results"
          categoryLabel={active}
          onReset={() => onChange(ALL)}
        />
      ) : (
        <>
          {featured && <FeaturedPostCard post={featured} />}
          {rest.length > 0 && (
            <section
              aria-label="Posts"
              aria-live="polite"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10"
            >
              {rest.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </section>
          )}
        </>
      )}

      <NewsletterCard variant="default" source="blog_index" />
    </MarketingShell>
  );
}
