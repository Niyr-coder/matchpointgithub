// Cron: despacha broadcasts con status=scheduled y scheduled_for <= now().
// Auth: Authorization: Bearer ${CRON_SECRET} o ?token=...

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  executeBroadcastDispatch,
  getBroadcastCreatedBy,
  listDueScheduledBroadcastIds,
} from "@/server/marketing/dispatch-broadcast-core";
import { authorizeCron } from "@/lib/api/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PER_RUN = 5;

async function handle(): Promise<NextResponse> {
  const dueIds = await listDueScheduledBroadcastIds(MAX_PER_RUN);
  const sent: string[] = [];
  const skipped: { id: string; reason?: string }[] = [];
  const errors: { id: string; message: string }[] = [];

  for (const id of dueIds) {
    try {
      const actor = (await getBroadcastCreatedBy(id)) ?? id;
      const res = await executeBroadcastDispatch(id, actor);
      if (res.skipped) {
        skipped.push({ id, reason: res.reason });
      } else {
        sent.push(id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id, message });
    }
  }

  return NextResponse.json({
    ok: true,
    data: { processed: dueIds.length, sent, skipped, errors },
  });
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
