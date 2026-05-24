// POST /api/newsletter/subscribe
//
// Suscribe al newsletter del blog: empuja el contacto a Resend Audiences
// (si está configurado) y persiste telemetría en `newsletter_signups`.
//
// Idempotencia: dedupe por (email_lc, source). Si la combinación ya existía,
// devolvemos `alreadySubscribed: true` y no volvemos a llamar a Resend.
//
// Si RESEND_API_KEY o RESEND_NEWSLETTER_AUDIENCE_ID faltan, la API sigue
// devolviendo 200 con `pendingResendSync: true` — la telemetría queda
// guardada y un backfill posterior puede syncear con Resend.
import { z } from "zod";
import type { NextRequest } from "next/server";
import { httpFail, httpOk } from "@/lib/api/response";
import { getAdminClient } from "@/lib/db/client.admin";
import { addNewsletterContact } from "@/lib/resend/audiences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = ["blog", "footer", "popup", "embed", "other"] as const;

const Body = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  source: z.enum(SOURCES).default("blog"),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON");
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fields[key] ??= []).push(issue.message);
    }
    return httpFail(400, "VALIDATION.FAILED", "Datos inválidos", { fields });
  }

  const { email, source } = parsed.data;
  const admin = getAdminClient();

  // 1. Check si ya existe — evita re-llamar a Resend en duplicados.
  const { data: existing, error: selErr } = await admin
    .from("newsletter_signups")
    .select("id")
    .eq("email_lc", email)
    .eq("source", source)
    .maybeSingle();

  if (selErr) {
    return httpFail(500, "NEWSLETTER.LOOKUP_FAILED", selErr.message);
  }

  if (existing) {
    return httpOk({
      alreadySubscribed: true,
      pendingResendSync: false,
      resendStatus: "already_subscribed" as const,
    });
  }

  // 2. Resend audiences (puede skippearse si falta config).
  const contact = await addNewsletterContact({ email });

  const ip = readClientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const status =
    contact.ok
      ? contact.status === "already_subscribed"
        ? "already_subscribed"
        : "subscribed"
      : contact.status === "skipped"
        ? "subscribed"
        : "failed";

  const metadata = contact.ok
    ? { resend_status: contact.status }
    : contact.status === "skipped"
      ? { resend_status: "skipped", reason: contact.reason }
      : { resend_status: "failed", error: contact.error };

  // 3. Insert telemetría. Si carrera concurrente disparó unique violation,
  //    devolvemos alreadySubscribed.
  const { error: insertErr } = await admin
    .from("newsletter_signups")
    .insert({
      email,
      source,
      resend_contact_id: contact.ok ? contact.contactId : null,
      status,
      ip,
      user_agent: userAgent,
      metadata,
    });

  if (insertErr) {
    // 23505 = unique_violation → carrera concurrente.
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      return httpOk({
        alreadySubscribed: true,
        pendingResendSync: false,
        resendStatus: "already_subscribed" as const,
      });
    }
    return httpFail(500, "NEWSLETTER.PERSIST_FAILED", insertErr.message);
  }

  return httpOk({
    alreadySubscribed: false,
    pendingResendSync: !contact.ok && contact.status === "skipped",
    resendStatus: contact.ok ? contact.status : contact.status,
  });
}

function readClientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}
