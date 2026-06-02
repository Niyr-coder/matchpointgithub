"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getSession } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { UuidSchema } from "@/lib/schemas/common";
import {
  HELP_CATEGORIES,
  getHelpCategory,
  type HelpArticleDetail,
  type HelpArticleSummary,
  type HelpBlock,
  type HelpHomeData,
  type HelpContentKind,
} from "@/lib/help-cms";

const HELP_USER_PATHS = ["/dashboard/user/ayuda", "/dashboard/user/ayuda-guias"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = Awaited<ReturnType<typeof getServerClient>> & { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdminClient = ReturnType<typeof getAdminClient> & { from: (table: string) => any };

type HelpArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category_key: string;
  category_label: string;
  icon: string | null;
  content_kind: HelpContentKind;
  content?: HelpBlock[];
  tags: string[];
  reading_minutes: number;
  video_url: string | null;
  video_duration_label: string | null;
  glossary_term: string | null;
  is_featured: boolean;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  published_at: string | null;
  updated_at: string;
};

const SUMMARY_SELECT =
  "id,slug,title,excerpt,category_key,category_label,icon,content_kind,tags,reading_minutes,video_url,video_duration_label,glossary_term,is_featured,view_count,helpful_count,not_helpful_count,published_at,updated_at";

const DETAIL_SELECT = `${SUMMARY_SELECT},content`;

function serverClient(): Promise<LooseClient> {
  return getServerClient() as Promise<LooseClient>;
}

function adminClient(): LooseAdminClient {
  return getAdminClient() as LooseAdminClient;
}

function mapSummary(row: HelpArticleRow): HelpArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    icon: row.icon,
    contentKind: row.content_kind,
    tags: row.tags ?? [],
    readingMinutes: row.reading_minutes,
    videoUrl: row.video_url,
    videoDurationLabel: row.video_duration_label,
    glossaryTerm: row.glossary_term,
    isFeatured: row.is_featured,
    viewCount: row.view_count,
    helpfulCount: row.helpful_count,
    notHelpfulCount: row.not_helpful_count,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function emptyHomeData(): HelpHomeData {
  return {
    categories: HELP_CATEGORIES.map((category) => ({ ...category, count: 0 })),
    popular: [],
    videos: [],
    glossary: [],
    featured: null,
  };
}

async function listPublishedArticles(limit = 200): Promise<HelpArticleSummary[]> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("help_articles")
    .select(SUMMARY_SELECT)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[help] listPublishedArticles failed", error);
    return [];
  }
  return ((data ?? []) as HelpArticleRow[]).map(mapSummary);
}

export async function getHelpHomeData(): Promise<HelpHomeData> {
  const articles = await listPublishedArticles();
  if (articles.length === 0) return emptyHomeData();

  const counts = new Map<string, number>();
  for (const article of articles) counts.set(article.categoryKey, (counts.get(article.categoryKey) ?? 0) + 1);

  const categories = HELP_CATEGORIES.map((category) => ({ ...category, count: counts.get(category.key) ?? 0 }));
  const popular = [...articles]
    .filter((article) => article.contentKind === "article")
    .sort((a, b) => b.viewCount - a.viewCount || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 6);

  return {
    categories,
    popular,
    videos: articles.filter((article) => article.contentKind === "video").slice(0, 4),
    glossary: articles.filter((article) => article.contentKind === "glossary").slice(0, 24),
    featured: articles.find((article) => article.isFeatured && article.contentKind === "article") ?? popular[0] ?? null,
  };
}

export async function getHelpCategoryData(categoryKey: string): Promise<{ category: (typeof HELP_CATEGORIES)[number]; articles: HelpArticleSummary[] }> {
  const category = getHelpCategory(categoryKey);
  const articles = (await listPublishedArticles()).filter((article) => article.categoryKey === category.key);
  return { category, articles };
}

export async function getHelpArticleBySlug(slug: string): Promise<HelpArticleDetail | null> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("help_articles")
    .select(DETAIL_SELECT)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[help] getHelpArticleBySlug failed", error);
    return null;
  }
  if (!data) return null;

  const row = data as HelpArticleRow;
  const summary = mapSummary(row);
  const { data: relatedRows } = await supabase
    .from("help_articles")
    .select(SUMMARY_SELECT)
    .eq("status", "published")
    .eq("category_key", row.category_key)
    .neq("id", row.id)
    .order("view_count", { ascending: false })
    .limit(3);

  return {
    ...summary,
    content: row.content ?? [],
    related: ((relatedRows ?? []) as HelpArticleRow[]).map(mapSummary),
  };
}

const SearchSchema = z.object({
  query: z.string().trim().min(2).max(160),
  categoryKey: z.string().trim().max(40).nullable().optional(),
});

const FeedbackSchema = z.object({
  articleId: UuidSchema,
  helpful: z.boolean(),
  comment: z.string().trim().max(1000).nullable().optional(),
});

const ViewSchema = z.object({ articleId: UuidSchema });

export async function searchHelp(input: unknown): Promise<ActionResult<{ articles: HelpArticleSummary[]; categories: HelpHomeData["categories"]; total: number }>> {
  return runAction(SearchSchema, input, async ({ query, categoryKey }) => {
    const supabase = await serverClient();
    let request = supabase
      .from("help_articles")
      .select(SUMMARY_SELECT)
      .eq("status", "published")
      .textSearch("search_vector", query, { type: "websearch", config: "spanish" })
      .order("view_count", { ascending: false })
      .limit(20);

    if (categoryKey) request = request.eq("category_key", categoryKey);

    let { data, error } = await request;
    if (error) {
      const like = `%${query.replace(/[%_,]/g, " ").trim()}%`;
      let fallback = supabase
        .from("help_articles")
        .select(SUMMARY_SELECT)
        .eq("status", "published")
        .or(`title.ilike.${like},excerpt.ilike.${like},category_label.ilike.${like}`)
        .order("view_count", { ascending: false })
        .limit(20);
      if (categoryKey) fallback = fallback.eq("category_key", categoryKey);
      const fallbackRes = await fallback;
      data = fallbackRes.data;
      error = fallbackRes.error;
    }
    if (error) throw new MpError("HELP.SEARCH_FAILED", error.message, 500);

    const articles = ((data ?? []) as HelpArticleRow[]).map(mapSummary);
    const counts = new Map<string, number>();
    for (const article of articles) counts.set(article.categoryKey, (counts.get(article.categoryKey) ?? 0) + 1);
    const categories = HELP_CATEGORIES.map((category) => ({ ...category, count: counts.get(category.key) ?? 0 }));

    const session = await getSession();
    if (session.authenticated) {
      const { error: logError } = await supabase.from("help_search_logs").insert({
        user_id: session.session.userId,
        query,
        category_key: categoryKey ?? null,
        results_count: articles.length,
      });
      if (logError) console.error("[help] search log failed", logError);
    }

    return { articles, categories, total: articles.length };
  });
}

export async function recordHelpArticleView(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ViewSchema, input, async ({ articleId }) => {
    const supabase = await serverClient();
    const { error } = await supabase.rpc("help_record_article_view", { p_article_id: articleId });
    if (error) throw new MpError("HELP.VIEW_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

export async function submitHelpFeedback(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(FeedbackSchema, input, async ({ articleId, helpful, comment }) => {
    const session = await getSession();
    if (!session.authenticated) throw new MpError("AUTH.UNAUTHENTICATED", "Inicia sesión", 401);
    const supabase = await serverClient();

    const { error } = await supabase.from("help_feedback").upsert(
      {
        article_id: articleId,
        user_id: session.session.userId,
        helpful,
        comment: comment?.trim() ? comment.trim() : null,
      },
      { onConflict: "article_id,user_id" },
    );
    if (error) throw new MpError("HELP.FEEDBACK_FAILED", error.message, 500);

    const admin = adminClient();
    await setAuditActor(admin as ReturnType<typeof getAdminClient>, session.session.userId, "user");
    const { data: rows, error: countError } = await admin.from("help_feedback").select("helpful").eq("article_id", articleId);
    if (!countError) {
      const feedbackRows = (rows ?? []) as Array<{ helpful: boolean }>;
      const helpfulCount = feedbackRows.filter((row) => row.helpful).length;
      const notHelpfulCount = feedbackRows.length - helpfulCount;
      await admin.from("help_articles").update({ helpful_count: helpfulCount, not_helpful_count: notHelpfulCount }).eq("id", articleId);
    }

    for (const path of HELP_USER_PATHS) revalidatePath(path);
    return { ok: true as const };
  });
}
