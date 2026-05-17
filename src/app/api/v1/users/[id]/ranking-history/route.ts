import { getUserRankingHistory } from "@/server/actions/ranking";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const r = await getUserRankingHistory({
    userId: id,
    sport: url.searchParams.get("sport"),
    fromDate: url.searchParams.get("fromDate") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!r.ok) return httpFail(r.error.code === "VALIDATION.FAILED" ? 400 : 500, r.error.code, r.error.message);
  return httpOk(r.data);
}
