// Wrapper sobre Resend Audiences API para el newsletter.
//
// Convención (matchea src/app/api/cron/dispatch-email/route.ts):
//   - fetch() directo a https://api.resend.com — sin SDK extra en deps.
//   - RESEND_API_KEY: required para escribir.
//   - RESEND_NEWSLETTER_AUDIENCE_ID: id del audience `matchpoint-newsletter`.
//     Si falta, el endpoint sigue grabando telemetría (skipped: true).
//   - Idempotencia: la API de Resend devuelve 200 si el contacto ya existía
//     (siempre y cuando audience_id sea válido). En la práctica, también
//     puede devolver 422 con un código que indica duplicado. Tratamos
//     ambos como `alreadySubscribed`.
import "server-only";

const RESEND_BASE = "https://api.resend.com";

export type ContactResult =
  | { ok: true; status: "created" | "already_subscribed"; contactId: string | null }
  | { ok: false; status: "skipped"; reason: "missing_api_key" | "missing_audience_id" }
  | { ok: false; status: "failed"; error: string };

export type ContactInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  unsubscribed?: boolean;
};

export function getAudienceId(): string | null {
  return process.env.RESEND_NEWSLETTER_AUDIENCE_ID ?? null;
}

export function getApiKey(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}

// Crea (o reutiliza) un contacto en el audience del newsletter.
// Si Resend devuelve un error indicando que el contacto ya existe, lo
// resolvemos como `already_subscribed` y reintentamos un GET para devolver
// el contactId real.
export async function addNewsletterContact(input: ContactInput): Promise<ContactResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, status: "skipped", reason: "missing_api_key" };

  const audienceId = getAudienceId();
  if (!audienceId) return { ok: false, status: "skipped", reason: "missing_audience_id" };

  const url = `${RESEND_BASE}/audiences/${encodeURIComponent(audienceId)}/contacts`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        unsubscribed: input.unsubscribed ?? false,
      }),
    });

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, status: "created", contactId: json.id ?? null };
    }

    const errText = await res.text().catch(() => "");
    const lower = errText.toLowerCase();
    const isDuplicate =
      lower.includes("already exists") ||
      lower.includes("duplicate") ||
      lower.includes("contact_already") ||
      res.status === 409;

    if (isDuplicate) {
      const existing = await findContactByEmail(audienceId, input.email, apiKey);
      return { ok: true, status: "already_subscribed", contactId: existing };
    }

    return {
      ok: false,
      status: "failed",
      error: `Resend ${res.status}: ${errText.slice(0, 500)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: "failed", error: `Resend fetch error: ${msg}` };
  }
}

// Resend no expone un endpoint "get contact by email" — hay que listar y
// filtrar. Es best-effort: si el listing falla o el contacto no aparece,
// devolvemos null y el caller persiste la telemetría igual.
async function findContactByEmail(
  audienceId: string,
  email: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const url = `${RESEND_BASE}/audiences/${encodeURIComponent(audienceId)}/contacts`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id?: string; email?: string }>;
    };
    const needle = email.toLowerCase();
    const hit = (json.data ?? []).find((c) => (c.email ?? "").toLowerCase() === needle);
    return hit?.id ?? null;
  } catch {
    return null;
  }
}
