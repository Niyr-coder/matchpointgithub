"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import {
  HELP_CATEGORIES,
  blocksToPlainText,
  getHelpCategory,
  plainTextToBlocks,
  slugifyHelp,
  type HelpArticleStatus,
  type HelpBlock,
  type HelpContentKind,
} from "@/lib/help-cms";

const ADMIN_HELP_PATH = "/dashboard/admin/admin-ayuda-guias";

type TypedAdminClient = ReturnType<typeof getAdminClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdminClient = Omit<TypedAdminClient, "from" | "rpc"> & {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

type HelpArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category_key: string;
  category_label: string;
  icon: string | null;
  status: HelpArticleStatus;
  content_kind: HelpContentKind;
  content: HelpBlock[];
  tags: string[];
  reading_minutes: number;
  video_url: string | null;
  video_duration_label: string | null;
  glossary_term: string | null;
  is_featured: boolean;
  sort_order: number;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  archived_by: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type HelpFeedbackRow = {
  id: string;
  article_id: string;
  user_id: string;
  helpful: boolean;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

type HelpSearchLogRow = {
  id: number;
  user_id: string | null;
  query: string;
  category_key: string | null;
  results_count: number;
  created_at: string;
};

export type AdminHelpArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  categoryKey: string;
  categoryLabel: string;
  icon: string | null;
  status: HelpArticleStatus;
  contentKind: HelpContentKind;
  tags: string[];
  readingMinutes: number;
  videoUrl: string | null;
  videoDurationLabel: string | null;
  glossaryTerm: string | null;
  isFeatured: boolean;
  sortOrder: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  bodyText: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminHelpFeedback = {
  id: string;
  articleId: string;
  articleTitle: string;
  helpful: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminHelpSearchMiss = {
  query: string;
  count: number;
  lastSeenAt: string;
  categoryKey: string | null;
};

export type AdminHelpOverview = {
  articles: AdminHelpArticle[];
  feedback: AdminHelpFeedback[];
  searchMisses: AdminHelpSearchMiss[];
  categories: Array<(typeof HELP_CATEGORIES)[number]>;
  totals: {
    articles: number;
    published: number;
    drafts: number;
    archived: number;
    views: number;
    helpful: number;
    notHelpful: number;
    searchMisses: number;
  };
};

function adminClient(): LooseAdminClient {
  return getAdminClient() as LooseAdminClient;
}

async function setAdminAuditActor(admin: LooseAdminClient, adminId: string): Promise<void> {
  await setAuditActor(admin as unknown as TypedAdminClient, adminId, "admin");
}

function requireNoError<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data as T;
}

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanTags(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function mapArticle(row: HelpArticleRow): AdminHelpArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    icon: row.icon,
    status: row.status,
    contentKind: row.content_kind,
    tags: row.tags ?? [],
    readingMinutes: row.reading_minutes,
    videoUrl: row.video_url,
    videoDurationLabel: row.video_duration_label,
    glossaryTerm: row.glossary_term,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
    viewCount: row.view_count,
    helpfulCount: row.helpful_count,
    notHelpfulCount: row.not_helpful_count,
    bodyText: blocksToPlainText(row.content ?? []),
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function writeRevision(admin: LooseAdminClient, articleId: string, adminId: string): Promise<void> {
  const articleRes = await admin.from("help_articles").select("*").eq("id", articleId).single();
  const article = requireNoError<HelpArticleRow>("help_articles.revision_source", articleRes);
  const latestRes = await admin
    .from("help_article_revisions")
    .select("revision_no")
    .eq("article_id", articleId)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latest = latestRes.data as { revision_no: number } | null;
  const revisionNo = (latest?.revision_no ?? 0) + 1;
  const { error } = await admin.from("help_article_revisions").insert({
    article_id: articleId,
    revision_no: revisionNo,
    status: article.status,
    title: article.title,
    excerpt: article.excerpt,
    content_kind: article.content_kind,
    content: article.content,
    snapshot: article,
    created_by: adminId,
  });
  if (error) throw new MpError("HELP.REVISION_FAILED", error.message, 500);
}

const HelpContentKindSchema = z.enum(["article", "video", "glossary"]);
const NullableUrl = z.string().trim().url().max(1000).nullable().optional();

const ArticleDraftSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).optional(),
  categoryKey: z.string().trim().min(2).max(40).default("reservas"),
  contentKind: HelpContentKindSchema.default("article"),
  excerpt: z.string().trim().max(500).nullable().optional(),
  bodyText: z.string().trim().max(20000).optional(),
});

const ArticlePatchSchema = z.object({
  articleId: UuidSchema,
  patch: z
    .object({
      title: z.string().trim().min(3).max(180).optional(),
      slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).optional(),
      categoryKey: z.string().trim().min(2).max(40).optional(),
      contentKind: HelpContentKindSchema.optional(),
      excerpt: z.string().trim().max(500).nullable().optional(),
      bodyText: z.string().trim().max(20000).optional(),
      tags: z.union([z.string(), z.array(z.string())]).nullable().optional(),
      readingMinutes: z.coerce.number().int().min(1).max(120).optional(),
      videoUrl: NullableUrl,
      videoDurationLabel: z.string().trim().max(40).nullable().optional(),
      glossaryTerm: z.string().trim().max(120).nullable().optional(),
      icon: z.string().trim().max(60).nullable().optional(),
      isFeatured: z.boolean().optional(),
      sortOrder: z.coerce.number().int().min(-10000).max(10000).optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, { message: "No hay cambios para guardar" }),
});

const ArticleIdSchema = z.object({ articleId: UuidSchema });

function articleCreatePayload(data: z.infer<typeof ArticleDraftSchema>, adminId: string) {
  const category = getHelpCategory(data.categoryKey);
  const content = plainTextToBlocks(data.bodyText ?? "");
  return {
    title: data.title,
    slug: data.slug ?? slugifyHelp(data.title),
    excerpt: cleanNullable(data.excerpt),
    category_key: category.key,
    category_label: category.label,
    icon: category.icon,
    status: "draft" as const,
    content_kind: data.contentKind,
    content,
    created_by: adminId,
    updated_by: adminId,
  };
}

function articlePatchPayload(patch: z.infer<typeof ArticlePatchSchema>["patch"], adminId: string) {
  const payload: Record<string, unknown> = { updated_by: adminId };
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.slug !== undefined) payload.slug = patch.slug;
  if (patch.categoryKey !== undefined) {
    const category = getHelpCategory(patch.categoryKey);
    payload.category_key = category.key;
    payload.category_label = category.label;
    payload.icon = category.icon;
  }
  if (patch.contentKind !== undefined) payload.content_kind = patch.contentKind;
  if (patch.excerpt !== undefined) payload.excerpt = cleanNullable(patch.excerpt);
  if (patch.bodyText !== undefined) payload.content = plainTextToBlocks(patch.bodyText);
  if (patch.tags !== undefined) payload.tags = cleanTags(patch.tags);
  if (patch.readingMinutes !== undefined) payload.reading_minutes = patch.readingMinutes;
  if (patch.videoUrl !== undefined) payload.video_url = cleanNullable(patch.videoUrl);
  if (patch.videoDurationLabel !== undefined) payload.video_duration_label = cleanNullable(patch.videoDurationLabel);
  if (patch.glossaryTerm !== undefined) payload.glossary_term = cleanNullable(patch.glossaryTerm);
  if (patch.icon !== undefined) payload.icon = cleanNullable(patch.icon);
  if (patch.isFeatured !== undefined) payload.is_featured = patch.isFeatured;
  if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
  return payload;
}

export async function listAdminHelpOverview(): Promise<AdminHelpOverview> {
  await requireAdminUserId();
  const admin = adminClient();

  const [articlesRes, feedbackRes, logsRes] = await Promise.all([
    admin.from("help_articles").select("*").order("updated_at", { ascending: false }).limit(500),
    admin.from("help_feedback").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("help_search_logs").select("*").order("created_at", { ascending: false }).limit(500),
  ]);

  const articleRows = requireNoError<HelpArticleRow[]>("help_articles", articlesRes);
  const feedbackRows = requireNoError<HelpFeedbackRow[]>("help_feedback", feedbackRes);
  const logRows = requireNoError<HelpSearchLogRow[]>("help_search_logs", logsRes);
  const articles = articleRows.map(mapArticle);
  const articleTitleById = new Map(articles.map((article) => [article.id, article.title]));

  const feedback: AdminHelpFeedback[] = feedbackRows.map((row) => ({
    id: row.id,
    articleId: row.article_id,
    articleTitle: articleTitleById.get(row.article_id) ?? "Artículo eliminado",
    helpful: row.helpful,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const missMap = new Map<string, AdminHelpSearchMiss>();
  for (const log of logRows) {
    if (log.results_count !== 0) continue;
    const key = `${log.category_key ?? ""}::${log.query.toLowerCase()}`;
    const current = missMap.get(key);
    if (!current) {
      missMap.set(key, { query: log.query, count: 1, lastSeenAt: log.created_at, categoryKey: log.category_key });
    } else {
      current.count += 1;
      if (log.created_at > current.lastSeenAt) current.lastSeenAt = log.created_at;
    }
  }

  const totals = {
    articles: articles.length,
    published: articles.filter((article) => article.status === "published").length,
    drafts: articles.filter((article) => article.status === "draft").length,
    archived: articles.filter((article) => article.status === "archived").length,
    views: articles.reduce((sum, article) => sum + article.viewCount, 0),
    helpful: articles.reduce((sum, article) => sum + article.helpfulCount, 0),
    notHelpful: articles.reduce((sum, article) => sum + article.notHelpfulCount, 0),
    searchMisses: logRows.filter((log) => log.results_count === 0).length,
  };

  return {
    articles,
    feedback,
    searchMisses: Array.from(missMap.values()).sort((a, b) => b.count - a.count).slice(0, 20),
    categories: [...HELP_CATEGORIES],
    totals,
  };
}

export async function createHelpArticleDraft(input: unknown): Promise<ActionResult<{ articleId: string }>> {
  return runAction(ArticleDraftSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const payload = articleCreatePayload(data, adminId);
    if (!payload.slug) throw new MpError("HELP.INVALID_SLUG", "No se pudo generar un slug válido.", 400);

    const { data: inserted, error } = await admin.from("help_articles").insert(payload).select("id").single();
    if (error) {
      if (error.code === "23505") throw new MpError("HELP.SLUG_EXISTS", "Ese slug ya está usado.", 409);
      throw new MpError("HELP.CREATE_FAILED", error.message, 500);
    }
    await writeRevision(admin, inserted.id as string, adminId);

    revalidatePath(ADMIN_HELP_PATH);
    revalidatePath("/dashboard/user/ayuda");
    revalidatePath("/dashboard/user/ayuda-guias");
    return { articleId: inserted.id as string };
  });
}

export async function updateHelpArticle(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ArticlePatchSchema, input, async ({ articleId, patch }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { error } = await admin.from("help_articles").update(articlePatchPayload(patch, adminId)).eq("id", articleId);
    if (error) {
      if (error.code === "23505") throw new MpError("HELP.SLUG_EXISTS", "Ese slug ya está usado.", 409);
      throw new MpError("HELP.UPDATE_FAILED", error.message, 500);
    }
    await writeRevision(admin, articleId, adminId);

    revalidatePath(ADMIN_HELP_PATH);
    revalidatePath("/dashboard/user/ayuda");
    revalidatePath("/dashboard/user/ayuda-guias");
    return { ok: true as const };
  });
}

export async function publishHelpArticle(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ArticleIdSchema, input, async ({ articleId }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { error } = await admin
      .from("help_articles")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: adminId,
        archived_at: null,
        archived_by: null,
        updated_by: adminId,
      })
      .eq("id", articleId);
    if (error) throw new MpError("HELP.PUBLISH_FAILED", error.message, 500);
    await writeRevision(admin, articleId, adminId);

    revalidatePath(ADMIN_HELP_PATH);
    revalidatePath("/dashboard/user/ayuda");
    revalidatePath("/dashboard/user/ayuda-guias");
    return { ok: true as const };
  });
}

export async function archiveHelpArticle(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ArticleIdSchema, input, async ({ articleId }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { error } = await admin
      .from("help_articles")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
        archived_by: adminId,
        updated_by: adminId,
      })
      .eq("id", articleId);
    if (error) throw new MpError("HELP.ARCHIVE_FAILED", error.message, 500);
    await writeRevision(admin, articleId, adminId);

    revalidatePath(ADMIN_HELP_PATH);
    revalidatePath("/dashboard/user/ayuda");
    revalidatePath("/dashboard/user/ayuda-guias");
    return { ok: true as const };
  });
}
