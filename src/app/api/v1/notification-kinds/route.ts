import { listNotificationKinds } from "@/server/actions/notifications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await listNotificationKinds();
  if (!r.ok) return httpFail(500, r.error.code, r.error.message);
  return httpOk(r.data);
}
