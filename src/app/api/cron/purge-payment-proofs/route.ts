// Cron diario: purga archivos de comprobantes de pago con más de 24h.
// Solo borra el archivo en Storage y limpia proof_url en la tabla.
// La fila de transactions NUNCA se elimina (compliance financiera).
//
// Auth: Authorization: Bearer ${CRON_SECRET} o ?token=...

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { getAdminClient } from "@/lib/db/client.admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH = 100;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

async function handle(): Promise<NextResponse> {
  const admin = getAdminClient();
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();

  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, proof_url")
    .not("proof_url", "is", null)
    .lt("proof_submitted_at", cutoff)
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, purged: 0 });
  }

  const paths = (rows as { id: string; proof_url: string }[]).map((r) => r.proof_url);
  const ids = (rows as { id: string }[]).map((r) => r.id);

  // Eliminar archivos del bucket. Best-effort: si algún path ya no existe
  // Supabase lo ignora; no abortamos la operación.
  await admin.storage.from("payment_proofs").remove(paths);

  const { error: updateErr } = await admin
    .from("transactions")
    .update({ proof_url: null } as never)
    .in("id", ids);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purged: rows.length });
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
