import { approveApplicationDocument } from "@/server/actions/clubApplicationsAdmin";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { docId } = await params;
  const r = await approveApplicationDocument({ documentId: docId });
  if (!r.ok) {
    const status = r.error.code === "CLUB_APP.DOC_NOT_FOUND" ? 404 : 400;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
