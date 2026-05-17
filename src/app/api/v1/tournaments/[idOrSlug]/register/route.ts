import { getTournament, registerToTournament } from "@/server/actions/tournaments";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  let tournamentId = idOrSlug;
  if (!/^[0-9a-f-]{36}$/i.test(idOrSlug)) {
    const lookup = await getTournament({ idOrSlug });
    if (!lookup.ok) return httpFail(404, lookup.error.code, lookup.error.message);
    tournamentId = lookup.data.tournament.id;
  }
  let rawBody: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") rawBody = parsed as Record<string, unknown>;
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON");
  }
  // paymentMode viaja al top-level del action (no dentro de body),
  // pero el cliente lo manda en el mismo JSON; lo extraemos aqui.
  const { paymentMode, ...body } = rawBody;
  const r = await registerToTournament({ tournamentId, body, paymentMode });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "TOURNAMENTS.NOT_FOUND" ? 404
      : c === "TOURNAMENT.REGISTRATION_CLOSED" ? 422
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
