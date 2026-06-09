import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/db/client.admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HealthPayload = {
  ok: boolean;
  db: "ok" | "error";
  env: {
    cronSecret: boolean;
    resend: boolean;
    appUrl: boolean;
    supabase: boolean;
  };
  timestamp: string;
};

export async function GET(): Promise<NextResponse<HealthPayload>> {
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
    env: {
      cronSecret: Boolean(process.env.CRON_SECRET),
      resend: Boolean(process.env.RESEND_API_KEY),
      appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      supabase: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
