// Cron: ejecuta borrados definitivos de cuentas con scheduled_deletion_at vencido.
// Auth: Authorization: Bearer ${CRON_SECRET} o ?token=...

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { processScheduledAccountDeletions } from "@/server/account/account-deletion-worker";
import { authorizeCron } from "@/lib/api/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(): Promise<NextResponse> {
  const result = await processScheduledAccountDeletions(25);
  return NextResponse.json({ ok: true, data: result });
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "AUTH.UNAUTHORIZED", message: "Token inválido o ausente." } },
      { status: 401 },
    );
  }
  return handle();
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "AUTH.UNAUTHORIZED", message: "Token inválido o ausente." } },
      { status: 401 },
    );
  }
  return handle();
}
