import { listFriendRequests, sendFriendRequest } from "@/server/actions/friends";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listFriendRequests({
    direction: url.searchParams.get("direction") ?? "incoming",
  });
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await sendFriendRequest(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "FRIENDS.SELF" ? 422
      : c === "FRIENDS.ALREADY_REQUESTED" ? 409
      : 400;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
