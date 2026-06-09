// Cron endpoint: despacha notification_jobs con channel='email' vía Resend.
//
// Convención:
//   - GET y POST hacen lo mismo (Vercel Cron usa GET).
//   - Auth por header Authorization: Bearer ${CRON_SECRET} o ?token=...
//   - Procesa hasta 50 jobs pending por invocación.
//   - Si RESEND_API_KEY no está seteada: marca todos los jobs como 'skipped'
//     con last_error="RESEND_API_KEY missing" y responde 200 (no falla).
//
// El job se resuelve así:
//   1. select email from auth.users where id = job.user_id (admin client).
//   2. Si hay plantilla, renderEmail(kind, payload) → { subject, html, text }.
//   3. POST https://api.resend.com/emails.
//   4. status='sent' + sent_at=now() | status='failed/skipped' + last_error.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/db/client.admin";
import { authorizeCron } from "@/lib/api/cron-auth";
import { hasEmailTemplate, renderEmail } from "@/lib/notifications/email-templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_JOBS_PER_RUN = 50;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "MATCHPOINT <notif@matchpoint.top>";

type DispatchSummary = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
};

type JobRow = {
  id: string;
  user_id: string;
  role: string;
  kind: string;
  channel: string;
  payload: Record<string, unknown> | null;
  attempts: number;
};

async function markJob(
  jobId: string,
  patch: { status: "sent" | "failed" | "skipped"; last_error?: string; attempts: number },
): Promise<void> {
  const admin = getAdminClient();
  const update: {
    status: "sent" | "failed" | "skipped";
    attempts: number;
    sent_at?: string;
    last_error?: string;
  } = {
    status: patch.status,
    attempts: patch.attempts,
  };
  if (patch.status === "sent") {
    update.sent_at = new Date().toISOString();
  }
  if (patch.last_error !== undefined) {
    update.last_error = patch.last_error;
  }
  await admin.from("notification_jobs").update(update).eq("id", jobId);
}

async function notificationPreferenceEnabled(
  job: Pick<JobRow, "user_id" | "role" | "kind" | "channel">,
): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string }> {
  const admin = getAdminClient();
  const { data: kind, error: kindError } = await admin
    .from("notification_kinds")
    .select("default_channels")
    .eq("kind", job.kind)
    .maybeSingle();

  if (kindError) {
    return { ok: false, error: kindError.message };
  }
  if (!((kind?.default_channels ?? []) as string[]).includes(job.channel)) {
    return { ok: true, enabled: false };
  }

  const { data, error } = await admin
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", job.user_id)
    .eq("role", job.role as never)
    .eq("kind", job.kind)
    .eq("channel", job.channel as never)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, enabled: data?.enabled !== false };
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  apiKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend ${res.status}: ${errText.slice(0, 500)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Resend fetch error: ${msg}` };
  }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "AUTH.UNAUTHORIZED", message: "Token inválido o ausente." } },
      { status: 401 },
    );
  }

  const admin = getAdminClient();
  const summary: DispatchSummary = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  // 1. Reclamar hasta MAX_JOBS_PER_RUN jobs pending de channel='email'.
  const { data: jobs, error: selErr } = await admin
    .from("notification_jobs")
    .select("id, user_id, role, kind, channel, payload, attempts")
    .eq("status", "pending")
    .eq("channel", "email")
    .order("scheduled_for", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);

  if (selErr) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "DB.SELECT_FAILED", message: selErr.message },
      },
      { status: 500 },
    );
  }

  const pending = (jobs ?? []) as JobRow[];
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, data: summary });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM ?? DEFAULT_FROM;

  // 2. Short-circuit: sin API key, marca todos como skipped.
  if (!apiKey) {
    console.warn(
      "[dispatch-email] RESEND_API_KEY missing — marking %d job(s) as skipped.",
      pending.length,
    );
    for (const job of pending) {
      summary.processed += 1;
      const preference = await notificationPreferenceEnabled(job);
      if (!preference.ok) {
        summary.failed += 1;
        await markJob(job.id, {
          status: "failed",
          last_error: `consulta de preferencias falló: ${preference.error}`,
          attempts: job.attempts + 1,
        });
        continue;
      }
      if (!preference.enabled) {
        summary.skipped += 1;
        await markJob(job.id, {
          status: "skipped",
          last_error: "preferencia de notificación desactivada",
          attempts: job.attempts + 1,
        });
        continue;
      }
      summary.skipped += 1;
      await markJob(job.id, {
        status: "skipped",
        last_error: "RESEND_API_KEY missing",
        attempts: job.attempts + 1,
      });
    }
    return NextResponse.json({ ok: true, data: summary });
  }

  // 3. Procesar cada job.
  for (const job of pending) {
    summary.processed += 1;

    const preference = await notificationPreferenceEnabled(job);
    if (!preference.ok) {
      summary.failed += 1;
      await markJob(job.id, {
        status: "failed",
        last_error: `consulta de preferencias falló: ${preference.error}`,
        attempts: job.attempts + 1,
      });
      continue;
    }
    if (!preference.enabled) {
      summary.skipped += 1;
      await markJob(job.id, {
        status: "skipped",
        last_error: "preferencia de notificación desactivada",
        attempts: job.attempts + 1,
      });
      continue;
    }

    // 3a. Resolver email desde auth.users.
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(job.user_id);
    if (userErr || !userRes?.user?.email) {
      summary.failed += 1;
      await markJob(job.id, {
        status: "failed",
        last_error: userErr?.message ?? "user has no email",
        attempts: job.attempts + 1,
      });
      continue;
    }
    const toEmail = userRes.user.email;

    // 3b. Renderizar plantilla. Si no existe, se salta: enviar payload crudo por
    // email sería ruidoso y puede exponer datos internos.
    if (!hasEmailTemplate(job.kind)) {
      summary.skipped += 1;
      await markJob(job.id, {
        status: "skipped",
        last_error: `sin plantilla de email para ${job.kind}`,
        attempts: job.attempts + 1,
      });
      continue;
    }

    let rendered;
    try {
      rendered = renderEmail(job.kind, job.payload ?? {});
    } catch (err) {
      summary.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await markJob(job.id, {
        status: "failed",
        last_error: `template error: ${msg}`,
        attempts: job.attempts + 1,
      });
      continue;
    }

    // 3c. Enviar.
    const result = await sendViaResend({
      to: toEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from: fromAddr,
      apiKey,
    });

    if (result.ok) {
      summary.sent += 1;
      await markJob(job.id, { status: "sent", attempts: job.attempts + 1 });
    } else {
      summary.failed += 1;
      await markJob(job.id, {
        status: "failed",
        last_error: result.error,
        attempts: job.attempts + 1,
      });
    }
  }

  return NextResponse.json({ ok: true, data: summary });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
