import { getRanking } from "@/server/actions/ranking";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await getRanking(Object.fromEntries(url.searchParams.entries()));
  if (!r.ok) return httpFail(r.error.code === "VALIDATION.FAILED" ? 400 : 500, r.error.code, r.error.message);
  return httpOk(r.data);
}
