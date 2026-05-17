// GET /api/v1/admin/flags/assignments?flag_key=...
// POST /api/v1/admin/flags/assignments  (upsert)
// DELETE /api/v1/admin/flags/assignments (delete; body: { flag_key, scope, scope_id })
import {
  listFlagAssignments,
  upsertFlagAssignment,
  deleteFlagAssignment,
} from "@/server/actions/featureFlags";
import { httpFail, httpOk } from "@/lib/api/response";

function statusFor(code: string): number {
  return code === "AUTH.UNAUTHENTICATED" ? 401
    : code === "AUTH.ROLE_REQUIRED" ? 403
    : code === "VALIDATION.FAILED" ? 400
    : 500;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listFlagAssignments({
    flagKey: url.searchParams.get("flagKey") ?? url.searchParams.get("flag_key") ?? "",
  });
  if (!r.ok) return httpFail(statusFor(r.error.code), r.error.code, r.error.message, { fields: r.error.fields });
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await upsertFlagAssignment(body);
  if (!r.ok) return httpFail(statusFor(r.error.code), r.error.code, r.error.message, { fields: r.error.fields });
  return httpOk(r.data);
}

export async function DELETE(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await deleteFlagAssignment(body);
  if (!r.ok) return httpFail(statusFor(r.error.code), r.error.code, r.error.message, { fields: r.error.fields });
  return httpOk(r.data);
}
