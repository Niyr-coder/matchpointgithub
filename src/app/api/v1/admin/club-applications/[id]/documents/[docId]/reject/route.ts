import { rejectApplicationDocument } from "@/server/actions/clubApplicationsAdmin";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { docId } = await params;
  let body: { reason?: string } = {};
  try {
    body = (await req.json()) as { reason?: string };
  } catch {
    /* */
  }
  const r = await rejectApplicationDocument({ documentId: docId, reason: body.reason });
  if (!r.ok) {
    const status =
      r.error.code === "VALIDATION.FAILED"
        ? 400
        : r.error.code === "CLUB_APP.DOC_NOT_FOUND"
          ? 404
          : 400;
    return httpFail(status, r.error.code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data);
}
