// POST /api/v1/club-applications/:id/photos (multipart)
import { uploadApplicationPhoto } from "@/server/actions/clubApplicationUploads";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_FORM", "Multipart form expected");
  }
  const file = form.get("file");
  const caption = form.get("caption");
  const ordinalRaw = form.get("ordinal");
  if (!(file instanceof Blob)) return httpFail(400, "VALIDATION.MISSING_FILE", "file field required");

  const r = await uploadApplicationPhoto({
    applicationId: id,
    filename: (file as File).name ?? "photo",
    mimeType: file.type || "image/jpeg",
    sizeBytes: file.size,
    caption: typeof caption === "string" ? caption : undefined,
    ordinal: typeof ordinalRaw === "string" ? Number(ordinalRaw) : undefined,
    file,
  });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "CLUB_APP.PHOTO_INVALID" || code === "CLUB_APP.PHOTO_LIMIT" || code === "VALIDATION.FAILED"
        ? 422
        : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
