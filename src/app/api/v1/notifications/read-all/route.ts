import { markAllNotificationsRead } from "@/server/actions/notifications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: { role?: string } = {};
  try { body = (await req.json()) as { role?: string }; } catch { /* ok */ }
  const r = await markAllNotificationsRead(body);
  if (!r.ok) return httpFail(400, r.error.code, r.error.message);
  return httpOk(r.data);
}
