import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/db/client.admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HealthPayload = {
  ok: boolean;
  db: "ok" | "error";
  timestamp: string;
};

function authorizeHealth(req: NextRequest): boolean {
  const secret = process.env.HEALTH_SECRET;
  if (!secret) {
    // Sin secret: solo permitir en desarrollo local.
    return process.env.NODE_ENV !== "production";
  }
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  const token = req.nextUrl.searchParams.get("token");
  return Boolean(token && token === secret);
}

export async function GET(req: NextRequest): Promise<NextResponse<HealthPayload>> {
  if (!authorizeHealth(req)) {
    return NextResponse.json(
      { ok: false, db: "error", timestamp: new Date().toISOString() },
      { status: 401 },
    );
  }

  let db: HealthPayload["db"] = "error";

  try {
    const admin = getAdminClient();
    const { error } = await admin.from("profiles").select("id").limit(1);
    db = error ? "error" : "ok";
  } catch {
    db = "error";
  }

  const payload: HealthPayload = {
    ok: db === "ok",
    db,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
