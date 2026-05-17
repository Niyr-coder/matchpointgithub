import { acceptFriendRequest } from "@/server/actions/friends";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await acceptFriendRequest({ requestId: id });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "FRIENDS.NOT_FOUND" ? 404
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "FRIENDS.NOT_PENDING" ? 409
      : 400;
    return httpFail(status, c, r.error.message);
  }
  return httpOk(r.data);
}
