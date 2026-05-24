// POST /api/v1/contact/sales
//
// Endpoint público (sin auth) que reemplaza el `mailto:ventas@matchpoint.top`
// de los CTAs "Hablar con ventas" del landing. Recibe el form, persiste el
// lead en `sales_leads` y dispara un email a ventas@ con el contexto
// estructurado vía Resend.
//
// Si RESEND_API_KEY no está seteada, el lead se guarda igual y el envío de
// email se omite (no falla la request — el equipo lo procesa desde el panel
// admin / consulta SQL hasta que exista UI dedicada).

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAdminClient } from "@/lib/db/client.admin";
import { httpFail, httpOk } from "@/lib/api/response";
import {
  SALES_LEAD_TYPE_LABELS,
  SalesLeadCreateSchema,
  type SalesLeadCreate,
} from "@/lib/schemas/sales-leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "MATCHPOINT <notif@matchpoint.top>";
const DEFAULT_TO = "ventas@matchpoint.top";
const MAX_BODY_BYTES = 16 * 1024;

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLeadEmail(input: SalesLeadCreate & { sourceUrl?: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const typeLabel = SALES_LEAD_TYPE_LABELS[input.leadType];
  const subject = `[Lead ventas] ${typeLabel} — ${input.name}`;
  const lines = [
    `Tipo: ${typeLabel}`,
    `Nombre: ${input.name}`,
    `Email: ${input.email}`,
    input.phone ? `Teléfono: ${input.phone}` : null,
    input.businessName ? `Negocio: ${input.businessName}` : null,
    input.message ? `\nMensaje:\n${input.message}` : null,
    input.sourceUrl ? `\nPágina: ${input.sourceUrl}` : null,
  ].filter((l): l is string => Boolean(l));
  const text = lines.join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0a0a0a;line-height:1.5">
    <h2 style="margin:0 0 12px">Nuevo lead de ventas</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
      <tr><td><b>Tipo</b></td><td>${escapeHtml(typeLabel)}</td></tr>
      <tr><td><b>Nombre</b></td><td>${escapeHtml(input.name)}</td></tr>
      <tr><td><b>Email</b></td><td><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></td></tr>
      ${input.phone ? `<tr><td><b>Teléfono</b></td><td>${escapeHtml(input.phone)}</td></tr>` : ""}
      ${input.businessName ? `<tr><td><b>Negocio</b></td><td>${escapeHtml(input.businessName)}</td></tr>` : ""}
      ${input.sourceUrl ? `<tr><td><b>Página</b></td><td>${escapeHtml(input.sourceUrl)}</td></tr>` : ""}
    </table>
    ${input.message ? `<p style="margin-top:14px"><b>Mensaje</b></p><p style="white-space:pre-wrap;background:#fafafa;padding:12px;border-radius:6px;border:1px solid #eee">${escapeHtml(input.message)}</p>` : ""}
  </body></html>`;
  return { subject, html, text };
}

async function sendLeadEmail(opts: {
  to: string;
  from: string;
  apiKey: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
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
        reply_to: opts.replyTo,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[contact-sales] Resend %s: %s", res.status, errText.slice(0, 500));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[contact-sales] Resend fetch error:", msg);
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return httpFail(413, "VALIDATION.BODY_TOO_LARGE", "El cuerpo es muy grande.");
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "El cuerpo debe ser JSON válido.");
  }

  let input: SalesLeadCreate;
  try {
    input = SalesLeadCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const path = issue.path.join(".") || "_";
        (fields[path] ??= []).push(issue.message);
      }
      // El honeypot dispara un fail "spam" en el campo `website`. Devolvemos
      // 400 silencioso (sin pista de honeypot) para no ayudar a bots.
      return httpFail(400, "VALIDATION.FAILED", "Datos inválidos.", { fields });
    }
    return httpFail(400, "VALIDATION.FAILED", "Datos inválidos.");
  }

  const admin = getAdminClient();
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { data: inserted, error: insErr } = await admin
    .from("sales_leads")
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      lead_type: input.leadType,
      business_name: input.businessName ?? null,
      message: input.message ?? null,
      source_url: input.sourceUrl ?? null,
      ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[contact-sales] insert failed", insErr);
    return httpFail(500, "DB.INSERT_FAILED", "No pudimos registrar tu mensaje. Intenta de nuevo.");
  }

  // Email best-effort (no bloquea el ack al usuario).
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const fromAddr = process.env.EMAIL_FROM ?? DEFAULT_FROM;
    const toAddr = process.env.SALES_EMAIL_TO ?? DEFAULT_TO;
    const rendered = renderLeadEmail(input);
    await sendLeadEmail({
      to: toAddr,
      from: fromAddr,
      apiKey,
      replyTo: input.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  } else {
    console.warn("[contact-sales] RESEND_API_KEY missing — lead saved, email skipped (id=%s)", inserted.id);
  }

  return httpOk({ id: inserted.id }, { status: 201 });
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } },
    { status: 405 },
  );
}
