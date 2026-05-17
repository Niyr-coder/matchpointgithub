import { getCoach } from "@/server/actions/coaches";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getCoach({ id });
  if (!r.ok) {
    const status = r.error.code === "COACHES.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
