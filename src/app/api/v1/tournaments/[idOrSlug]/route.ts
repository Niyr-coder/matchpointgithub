import { getTournament } from "@/server/actions/tournaments";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(_req: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  const r = await getTournament({ idOrSlug });
  if (!r.ok) {
    const status = r.error.code === "TOURNAMENTS.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
