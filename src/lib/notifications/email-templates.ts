// Plantillas de correo para notification_jobs (channel = 'email').
// Renderiza HTML + texto plano según el `kind` del job.
//
// Diseño:
//   - HTML mínimo con estilos inline (clientes de correo no soportan <style>).
//   - Contenedor centrado de 600px (ancho estándar para correo).
//   - Footer con marca y enlace para administrar preferencias.
//   - Para kinds desconocidos: subject genérico + payload serializado en <pre>.
//
// Importante: no asumimos shape estricto del payload — usamos coalesce defensivo.

import { APP_URL } from "@/lib/db/env";

export type EmailKind =
  | "event_rescheduled"
  | "tournament_rescheduled"
  | "plan_expiring_soon"
  | "reservation_created"
  | (string & {});

export type EmailRender = {
  subject: string;
  html: string;
  text: string;
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const absUrl = (path: string): string => {
  if (!path) return APP_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
};

type Payload = Record<string, unknown>;

const pickStr = (p: Payload, key: string): string | null => {
  const v = p[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
};

const layout = (opts: {
  preheader?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string => {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<p style="margin:24px 0 0 0;">
           <a href="${escapeHtml(opts.ctaUrl)}"
              style="display:inline-block;background:#0a7d3a;color:#ffffff;
                     padding:12px 20px;border-radius:6px;text-decoration:none;
                     font-weight:600;font-family:Arial,sans-serif;font-size:14px;">
             ${escapeHtml(opts.ctaLabel)}
           </a>
         </p>`
      : "";

  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
         ${escapeHtml(opts.preheader)}
       </div>`
    : "";

  const profileUrl = absUrl("/dashboard/user/perfil");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    ${preheader}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
           style="background:#f4f5f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
                 style="max-width:600px;background:#ffffff;border-radius:8px;
                        box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <div style="font-size:18px;font-weight:700;color:#0a7d3a;">MATCHPOINT</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;font-size:15px;line-height:1.55;color:#1a1a1a;">
                <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;">
                  ${escapeHtml(opts.title)}
                </h1>
                ${opts.bodyHtml}
                ${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #e5e7eb;
                         font-size:12px;color:#6b7280;line-height:1.5;">
                MATCHPOINT Ecuador · matchpoint.top<br />
                Para administrar tus notificaciones o darte de baja, visita
                <a href="${escapeHtml(profileUrl)}" style="color:#0a7d3a;">tu perfil</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const renderEventRescheduled = (payload: Payload): EmailRender => {
  const name = pickStr(payload, "event_name") ?? "tu evento";
  const newDate =
    pickStr(payload, "new_starts_at") ??
    pickStr(payload, "starts_at") ??
    pickStr(payload, "new_date") ??
    null;
  const eventId = pickStr(payload, "event_id");
  const link = eventId ? absUrl(`/eventos/${eventId}`) : absUrl("/eventos");
  const subject = `Cambio de fecha · ${name}`;
  const dateLine = newDate
    ? `<p style="margin:0 0 12px 0;">Nueva fecha: <strong>${escapeHtml(newDate)}</strong>.</p>`
    : "";
  const bodyHtml = `
    <p style="margin:0 0 12px 0;">
      El evento <strong>${escapeHtml(name)}</strong> fue reprogramado.
    </p>
    ${dateLine}
    <p style="margin:0 0 12px 0;">Revisa los detalles actualizados en tu panel.</p>`;
  const text = `${subject}\n\nEl evento "${name}" fue reprogramado.${
    newDate ? ` Nueva fecha: ${newDate}.` : ""
  }\n\nDetalles: ${link}\n\n— MATCHPOINT`;
  return {
    subject,
    html: layout({
      preheader: `Cambio de fecha de ${name}`,
      title: subject,
      bodyHtml,
      ctaLabel: "Ver evento",
      ctaUrl: link,
    }),
    text,
  };
};

const renderTournamentRescheduled = (payload: Payload): EmailRender => {
  const name =
    pickStr(payload, "tournament_name") ??
    pickStr(payload, "event_name") ??
    "tu torneo";
  const newDate =
    pickStr(payload, "new_starts_at") ??
    pickStr(payload, "starts_at") ??
    pickStr(payload, "new_date") ??
    null;
  const tournamentId =
    pickStr(payload, "tournament_id") ?? pickStr(payload, "event_id");
  const link = tournamentId
    ? absUrl(`/eventos/${tournamentId}`)
    : absUrl("/eventos");
  const subject = `Cambio de fecha · ${name}`;
  const dateLine = newDate
    ? `<p style="margin:0 0 12px 0;">Nueva fecha: <strong>${escapeHtml(newDate)}</strong>.</p>`
    : "";
  const bodyHtml = `
    <p style="margin:0 0 12px 0;">
      El torneo <strong>${escapeHtml(name)}</strong> fue reprogramado.
    </p>
    ${dateLine}
    <p style="margin:0 0 12px 0;">Revisa los detalles actualizados del cuadro y horarios.</p>`;
  const text = `${subject}\n\nEl torneo "${name}" fue reprogramado.${
    newDate ? ` Nueva fecha: ${newDate}.` : ""
  }\n\nDetalles: ${link}\n\n— MATCHPOINT`;
  return {
    subject,
    html: layout({
      preheader: `Cambio de fecha de ${name}`,
      title: subject,
      bodyHtml,
      ctaLabel: "Ver torneo",
      ctaUrl: link,
    }),
    text,
  };
};

const renderPlanExpiringSoon = (payload: Payload): EmailRender => {
  const daysRaw = pickStr(payload, "days_remaining") ?? "pocos";
  const subject = `Tu Premium expira en ${daysRaw} días`;
  const renewUrl = absUrl("/dashboard/user/mi-plan");
  const bodyHtml = `
    <p style="margin:0 0 12px 0;">
      Tu plan <strong>Premium</strong> está por vencer en
      <strong>${escapeHtml(daysRaw)}</strong> días.
    </p>
    <p style="margin:0 0 12px 0;">
      Renuévalo ahora para no perder beneficios como inscripción anticipada a eventos,
      ranking ponderado y acceso a torneos exclusivos.
    </p>`;
  const text = `${subject}\n\nTu plan Premium está por vencer en ${daysRaw} días.\nRenuévalo en: ${renewUrl}\n\n— MATCHPOINT`;
  return {
    subject,
    html: layout({
      preheader: `Renueva tu Premium antes de que expire`,
      title: subject,
      bodyHtml,
      ctaLabel: "Renovar",
      ctaUrl: renewUrl,
    }),
    text,
  };
};

const renderReservationCreated = (payload: Payload): EmailRender => {
  const club = pickStr(payload, "club_name") ?? "el club";
  const court = pickStr(payload, "court_name");
  const startsAt = pickStr(payload, "starts_at");
  const reservationId = pickStr(payload, "reservation_id");
  const subject = `Reserva confirmada en ${club}`;
  const link = reservationId
    ? absUrl(`/dashboard/user/reservas/${reservationId}`)
    : absUrl("/dashboard/user/reservas");
  const details = [court ? `Cancha: <strong>${escapeHtml(court)}</strong>` : null,
                   startsAt ? `Inicio: <strong>${escapeHtml(startsAt)}</strong>` : null]
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 6px 0;">${line}</p>`)
    .join("");
  const bodyHtml = `
    <p style="margin:0 0 12px 0;">
      Tu reserva en <strong>${escapeHtml(club)}</strong> está confirmada.
    </p>
    ${details}
    <p style="margin:12px 0 0 0;">¡Nos vemos en la cancha!</p>`;
  const textParts = [
    `Tu reserva en "${club}" está confirmada.`,
    court ? `Cancha: ${court}` : null,
    startsAt ? `Inicio: ${startsAt}` : null,
    `Detalles: ${link}`,
  ].filter(Boolean);
  const text = `${subject}\n\n${textParts.join("\n")}\n\n— MATCHPOINT`;
  return {
    subject,
    html: layout({
      preheader: `Reserva confirmada en ${club}`,
      title: subject,
      bodyHtml,
      ctaLabel: "Ver mi reserva",
      ctaUrl: link,
    }),
    text,
  };
};

const renderFallback = (kind: string, payload: Payload): EmailRender => {
  const subject = "Notificación de MATCHPOINT";
  const serialized = JSON.stringify(payload, null, 2);
  const bodyHtml = `
    <p style="margin:0 0 12px 0;">
      Tienes una nueva notificación (<code>${escapeHtml(kind)}</code>).
    </p>
    <pre style="background:#f4f5f7;padding:12px;border-radius:6px;
                font-size:12px;line-height:1.4;overflow:auto;
                white-space:pre-wrap;word-break:break-word;">${escapeHtml(serialized)}</pre>`;
  const text = `${subject}\n\nKind: ${kind}\n\n${serialized}\n\n— MATCHPOINT`;
  return {
    subject,
    html: layout({ title: subject, bodyHtml }),
    text,
  };
};

export function renderEmail(kind: EmailKind, payload: Payload | null | undefined): EmailRender {
  const p: Payload = payload ?? {};
  switch (kind) {
    case "event_rescheduled":
      return renderEventRescheduled(p);
    case "tournament_rescheduled":
      return renderTournamentRescheduled(p);
    case "plan_expiring_soon":
      return renderPlanExpiringSoon(p);
    case "reservation_created":
      return renderReservationCreated(p);
    default:
      return renderFallback(String(kind), p);
  }
}
