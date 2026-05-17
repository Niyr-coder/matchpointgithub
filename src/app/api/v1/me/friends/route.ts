import { listMyFriends, removeFriend } from "@/server/actions/friends";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await listMyFriends();
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function DELETE(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await removeFriend(body);
  if (!r.ok) return httpFail(400, r.error.code, r.error.message);
  return httpOk(r.data);
}
