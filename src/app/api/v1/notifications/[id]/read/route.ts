import { markNotificationRead } from "@/server/actions/notifications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await markNotificationRead({ id });
  if (!r.ok) {
    const status = r.error.code === "NOTIFICATIONS.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
