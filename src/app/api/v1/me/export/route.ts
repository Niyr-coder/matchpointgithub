import { exportMyData } from "@/server/actions/account-privacy";
import { httpFail, httpOk } from "@/lib/api/response";

/** GET /api/v1/me/export — portabilidad / acceso LOPDP (JSON). */
export async function GET() {
  const r = await exportMyData();
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  const filename = `matchpoint-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(r.data.export, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
