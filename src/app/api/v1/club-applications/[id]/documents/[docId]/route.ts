// DELETE /api/v1/club-applications/:id/documents/:docId
import { removeApplicationDocument } from "@/server/actions/clubApplicationUploads";
import { httpFail, httpOk } from "@/lib/api/response";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { docId } = await params;
  const r = await removeApplicationDocument({ documentId: docId });
  if (!r.ok) return httpFail(400, r.error.code, r.error.message);
  return httpOk(r.data);
}
