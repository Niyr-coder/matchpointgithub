// POST /api/v1/auth/sign-out
import { signOut } from "@/server/actions/auth";
import { httpOk } from "@/lib/api/response";

export async function POST() {
  await signOut();
  return httpOk({ ok: true });
}
