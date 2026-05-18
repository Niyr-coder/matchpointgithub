"use server";

// File uploads for the club-applications wizard: KYC docs + gallery photos.
// Both write to private buckets and store the path in the corresponding row.
// Photos move to `club-covers` (public) when the application is materialized
// into a club (handled by fn_materialize_club_from_application).
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import {
  ClubApplicationDocumentSchema,
  ClubApplicationPhotoSchema,
  ClubDocKindSchema,
  type ClubApplicationDocument,
  type ClubApplicationPhoto,
} from "@/lib/schemas/clubApplications";
import { STORAGE_BUCKETS, assertUpload } from "@/lib/storage/buckets";

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

// ── document upload (one per kind, upsert) ──────────────────────────────
const UploadDocSchema = z.object({
  applicationId: UuidSchema,
  kind: ClubDocKindSchema,
  filename: z.string().min(1).max(200),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  file: z.unknown(), // Blob — runtime check below; can't easily Zod this.
});

export async function uploadApplicationDocument(
  input: unknown,
): Promise<ActionResult<ClubApplicationDocument>> {
  return runAction(UploadDocSchema, input, async ({ applicationId, kind, filename, mimeType, sizeBytes, file }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    try {
      assertUpload(STORAGE_BUCKETS.KYC_DOCS, mimeType, sizeBytes);
    } catch (e) {
      throw new MpError("CLUB_APP.DOC_INVALID", (e as Error).message, 422);
    }
    if (!(file instanceof Blob)) {
      throw new MpError("CLUB_APP.DOC_INVALID", "File must be a Blob", 400);
    }

    const path = `${userId}/${applicationId}/${kind}-${Date.now()}-${filename}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKETS.KYC_DOCS)
      .upload(path, file, { contentType: mimeType, upsert: true });
    if (upErr) throw new MpError("CLUB_APP.DOC_UPLOAD_FAILED", upErr.message, 500);

    const { data, error } = await supabase
      .from("club_application_documents")
      .upsert(
        {
          application_id: applicationId,
          kind,
          status: "uploaded",
          storage_path: path,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          filename,
          uploaded_at: new Date().toISOString(),
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
        },
        { onConflict: "application_id,kind" },
      )
      .select()
      .single();
    if (error) throw new MpError("CLUB_APP.DOC_PERSIST_FAILED", error.message, 500);

    return ClubApplicationDocumentSchema.parse({
      id: data.id,
      applicationId: data.application_id,
      kind: data.kind,
      status: data.status,
      storagePath: data.storage_path,
      mimeType: data.mime_type,
      sizeBytes: data.size_bytes,
      filename: data.filename,
      uploadedAt: data.uploaded_at,
      reviewedBy: data.reviewed_by ?? null,
      reviewedAt: data.reviewed_at ?? null,
      rejectionReason: data.rejection_reason ?? null,
    });
  });
}

// ── delete document ─────────────────────────────────────────────────────
const RemoveDocSchema = z.object({ documentId: UuidSchema });

export async function removeApplicationDocument(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RemoveDocSchema, input, async ({ documentId }) => {
    await requireUserId();
    const supabase = await getServerClient();

    const { data: doc } = await supabase
      .from("club_application_documents")
      .select("storage_path")
      .eq("id", documentId)
      .single();

    if (doc?.storage_path) {
      await supabase.storage.from(STORAGE_BUCKETS.KYC_DOCS).remove([doc.storage_path]);
    }

    const { error } = await supabase.from("club_application_documents").delete().eq("id", documentId);
    if (error) throw new MpError("CLUB_APP.DOC_DELETE_FAILED", error.message, 400);
    return { ok: true as const };
  });
}

// ── photo upload (4..6 enforced by table CHECK + count check here) ──────
const UploadPhotoSchema = z.object({
  applicationId: UuidSchema,
  filename: z.string().min(1).max(200),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  caption: z.string().max(120).optional(),
  ordinal: z.number().int().min(0).max(5).optional(),
  file: z.unknown(),
});

export async function uploadApplicationPhoto(
  input: unknown,
): Promise<ActionResult<ClubApplicationPhoto>> {
  return runAction(
    UploadPhotoSchema,
    input,
    async ({ applicationId, filename, mimeType, sizeBytes, caption, ordinal, file }) => {
      const userId = await requireUserId();
      const supabase = await getServerClient();

      try {
        assertUpload(STORAGE_BUCKETS.CLUB_COVERS, mimeType, sizeBytes);
      } catch (e) {
        throw new MpError("CLUB_APP.PHOTO_INVALID", (e as Error).message, 422);
      }
      if (!(file instanceof Blob)) {
        throw new MpError("CLUB_APP.PHOTO_INVALID", "File must be a Blob", 400);
      }

      const { count } = await supabase
        .from("club_application_photos")
        .select("*", { count: "exact", head: true })
        .eq("application_id", applicationId);
      if ((count ?? 0) >= 6) {
        throw new MpError("CLUB_APP.PHOTO_LIMIT", "Maximum 6 photos per application", 422);
      }

      const resolvedOrdinal = ordinal ?? count ?? 0;
      const path = `${userId}/${applicationId}/photo-${Date.now()}-${filename}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKETS.CLUB_COVERS)
        .upload(path, file, { contentType: mimeType });
      if (upErr) throw new MpError("CLUB_APP.PHOTO_UPLOAD_FAILED", upErr.message, 500);

      const { data, error } = await supabase
        .from("club_application_photos")
        .insert({
          application_id: applicationId,
          storage_path: path,
          caption: caption ?? null,
          ordinal: resolvedOrdinal,
        })
        .select()
        .single();
      if (error) throw new MpError("CLUB_APP.PHOTO_PERSIST_FAILED", error.message, 500);

      // Signed URL para preview inmediato en el wizard. 1h TTL.
      const { data: signed } = await supabase.storage
        .from(STORAGE_BUCKETS.CLUB_COVERS)
        .createSignedUrl(path, 60 * 60);

      return ClubApplicationPhotoSchema.parse({
        id: data.id,
        applicationId: data.application_id,
        storagePath: data.storage_path,
        caption: data.caption ?? null,
        ordinal: data.ordinal,
        createdAt: data.created_at,
        previewUrl: signed?.signedUrl ?? null,
      });
    },
  );
}

const RemovePhotoSchema = z.object({ photoId: UuidSchema });

export async function removeApplicationPhoto(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RemovePhotoSchema, input, async ({ photoId }) => {
    const supabase = await getServerClient();

    const { data: ph } = await supabase
      .from("club_application_photos")
      .select("storage_path")
      .eq("id", photoId)
      .single();
    if (ph?.storage_path) {
      await supabase.storage.from(STORAGE_BUCKETS.CLUB_COVERS).remove([ph.storage_path]);
    }

    const { error } = await supabase.from("club_application_photos").delete().eq("id", photoId);
    if (error) throw new MpError("CLUB_APP.PHOTO_DELETE_FAILED", error.message, 400);
    return { ok: true as const };
  });
}
