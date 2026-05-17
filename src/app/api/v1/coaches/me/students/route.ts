import { listMyStudents } from "@/server/actions/students";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await listMyStudents();
  if (!r.ok) {
    const status =
      r.error.code === "AUTH.UNAUTHENTICATED" ? 401
      : r.error.code === "AUTH.ROLE_REQUIRED" ? 403
      : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
