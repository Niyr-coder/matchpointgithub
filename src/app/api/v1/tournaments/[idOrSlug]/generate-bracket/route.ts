// POST /api/v1/tournaments/:idOrSlug/generate-bracket (partner-admin)
import { generateBracket, getTournament } from "@/server/actions/tournaments";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  let tournamentId = idOrSlug;
  if (!/^[0-9a-f-]{36}$/i.test(idOrSlug)) {
    const lookup = await getTournament({ idOrSlug });
    if (!lookup.ok) return httpFail(404, lookup.error.code, lookup.error.message);
    tournamentId = lookup.data.tournament.id;
  }
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* opcional */ }
  const r = await generateBracket({ tournamentId, ...body });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "TOURNAMENTS.NOT_FOUND" ? 404
      : c === "BRACKETS.NOT_ENOUGH" ? 422
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
