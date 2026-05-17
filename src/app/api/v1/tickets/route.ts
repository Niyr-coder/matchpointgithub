import { createTicket, listMyTickets } from "@/server/actions/support";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listMyTickets(Object.fromEntries(url.searchParams.entries()));
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await createTicket(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
