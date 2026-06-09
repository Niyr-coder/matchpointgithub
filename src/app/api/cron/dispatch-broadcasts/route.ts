// Cron: despacha broadcasts con status=scheduled y scheduled_for <= now().
// Auth: Authorization: Bearer ${CRON_SECRET} o ?token=...

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  executeBroadcastDispatch,
  getBroadcastCreatedBy,
  listDueScheduledBroadcastIds,
} from "@/server/marketing/dispatch-broadcast-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PER_RUN = 5;

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  const token = req.nextUrl.searchParams.get("token");
  return Boolean(token && token === expected);
}

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
  if (!authorize(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "AUTH.UNAUTHORIZED", message: "Token inválido o ausente." } },
      { status: 401 },
    );
  }
  return handle();
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "AUTH.UNAUTHORIZED", message: "Token inválido o ausente." } },
      { status: 401 },
    );
  }
  return handle();
}
