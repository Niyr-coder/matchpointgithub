// POST /api/v1/club-applications/:id/documents (multipart)
import { uploadApplicationDocument } from "@/server/actions/clubApplicationUploads";
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
  const kind = form.get("kind");
  if (!(file instanceof Blob)) return httpFail(400, "VALIDATION.MISSING_FILE", "file field required");

  const r = await uploadApplicationDocument({
    applicationId: id,
    kind,
    filename: (file as File).name ?? "doc",
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    file,
  });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "VALIDATION.FAILED" || code === "CLUB_APP.DOC_INVALID"
        ? 422
        : code === "AUTH.UNAUTHENTICATED"
          ? 401
          : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
