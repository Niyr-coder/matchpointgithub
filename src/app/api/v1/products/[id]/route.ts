// GET /api/v1/products/:id — public
import { getProduct } from "@/server/actions/proshop";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getProduct({ id });
  if (!r.ok) {
    const status = r.error.code === "PROSHOP.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
