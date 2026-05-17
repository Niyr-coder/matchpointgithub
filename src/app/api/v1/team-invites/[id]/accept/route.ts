import { acceptTeamInvite } from "@/server/actions/teams";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await acceptTeamInvite({ inviteId: id });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "TEAMS.INVITE_NOT_FOUND" ? 404
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "TEAMS.INVITE_NOT_PENDING" ? 409
      : 400;
    return httpFail(status, c, r.error.message);
  }
  return httpOk(r.data);
}
