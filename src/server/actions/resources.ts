"use server";

// Coach resources library. Reads are RLS-filtered (own + granted + public).
// Writes restricted to the coach. File uploads come later via Storage signed URLs.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  ResourceCreateSchema,
  ResourceListParamsSchema,
  ResourceSchema,
  type Resource,
} from "@/lib/schemas/resources";
import { UuidSchema } from "@/lib/schemas/common";

function mapResource(row: Record<string, unknown>): Resource {
  return ResourceSchema.parse({
    id: row.id,
    coachId: row.coach_id,
    clubId: (row.club_id as string | null) ?? null,
    title: row.title,
    description: row.description ?? null,
    kind: row.kind,
    coverUrl: row.cover_url ?? null,
    durationSeconds: row.duration_seconds ?? null,
    level: row.level ?? null,
    tags: (row.tags as string[]) ?? [],
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function requireCoach(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data: coach } = await supabase
    .from("coach_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!coach) throw new AuthError("AUTH.ROLE_REQUIRED", "Coach profile required");
  return user.id;
}

export async function listResources(input: unknown): Promise<ActionResult<Resource[]>> {
  return runAction(ResourceListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;
    let q = supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (params.coachId) q = q.eq("coach_id", params.coachId);
    if (params.kind) q = q.eq("kind", params.kind);
    if (params.tag) q = q.contains("tags", [params.tag]);
    if (params.q) q = q.ilike("title", `%${params.q}%`);
    const { data, error } = await q;
    if (error) throw new MpError("RESOURCES.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapResource);
  });
}

export async function getResource(input: unknown): Promise<ActionResult<Resource>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) throw new MpError("RESOURCES.NOT_FOUND", "Resource not found", 404);
    return mapResource(data);
  });
}

export async function createResource(input: unknown): Promise<ActionResult<Resource>> {
  return runAction(ResourceCreateSchema, input, async (data) => {
    const coachId = await requireCoach();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("resources")
      .insert({
        coach_id: coachId,
        club_id: data.clubId ?? null,
        title: data.title,
        description: data.description ?? null,
        kind: data.kind,
        cover_url: data.coverUrl ?? null,
        duration_seconds: data.durationSeconds ?? null,
        level: data.level ?? null,
        tags: data.tags,
        visibility: data.visibility,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("RESOURCES.CREATE_FAILED", error.message, 500);
    return mapResource(row);
  });
}
