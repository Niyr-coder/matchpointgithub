// DELETE /api/v1/club-applications/:id/photos/:photoId
import { removeApplicationPhoto } from "@/server/actions/clubApplicationUploads";
import { httpFail, httpOk } from "@/lib/api/response";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { photoId } = await params;
  const r = await removeApplicationPhoto({ photoId });
  if (!r.ok) return httpFail(400, r.error.code, r.error.message);
  return httpOk(r.data);
}
