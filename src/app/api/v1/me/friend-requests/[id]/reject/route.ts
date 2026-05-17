import { rejectFriendRequest } from "@/server/actions/friends";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await rejectFriendRequest({ requestId: id });
  if (!r.ok) return httpFail(400, r.error.code, r.error.message);
  return httpOk(r.data);
}
