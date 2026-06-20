/** Errores de API/actions → copy legible para la UI pública. */

import { FIELD_LABELS_ES, fieldLabel, humanizeSnakeCase, looksLikeBackendToken } from "./labels";

export type UserFacingErrorInput = {
  code?: string;
  message: string;
  fields?: Record<string, string[]>;
};

const ERROR_CODE_MESSAGES_ES: Record<string, string> = {
  "VALIDATION.FAILED": "Revisa los datos ingresados",
  "INTERNAL.UNEXPECTED": "Algo salió mal. Intenta de nuevo.",
  "AUTH.UNAUTHENTICATED": "Inicia sesión para continuar",
  "AUTH.ROLE_REQUIRED": "No tienes permiso para esta acción",
  "AUTH.SCOPE_REQUIRED": "Tu sesión no coincide con este club",
  "AUTH.SUSPENDED": "Tu cuenta está suspendida",
  "RATE_LIMIT.EXCEEDED": "Demasiados intentos. Espera un momento.",
  "CLUB_APP.NOT_FOUND": "No encontramos la solicitud de club",
  "CLUB_APP.UPDATE_FAILED": "No se pudo actualizar la solicitud",
  "CLUB_APP.SUBMIT_FAILED": "No se pudo enviar la solicitud",
  "CLUB_APP.COURT_NOT_FOUND": "No encontramos esa cancha",
  "CLUBS.NOT_FOUND": "No encontramos el club",
  "CLUBS.UPDATE_FAILED": "No se pudo actualizar el club",
  "ROLES.NOT_FOUND": "No encontramos esa asignación",
  "ROLES.REQUEST_NOT_FOUND": "No encontramos la solicitud de rol",
  "ROLES.REQUEST_PENDING": "Ya tienes una solicitud pendiente para este rol",
  "ROLES.CLUB_REQUIRED": "Este rol requiere un club",
  "ROLES.TERMS_REQUIRED": "Debes aceptar los términos vigentes",
  "MATCH_SEEK.LIST_FAILED": "No se pudieron cargar las búsquedas",
  "MATCH_SEEK.MATCH_CREATE_FAILED": "No se pudo crear el partido",
  "RESERVATIONS.CONFLICT": "Ese horario ya está ocupado",
  "RESERVATIONS.NOT_FOUND": "No encontramos la reserva",
  "EVENTS.NOT_FOUND": "No encontramos el evento",
  "TOURNAMENTS.NOT_FOUND": "No encontramos el torneo",
  "REGISTRATION.NOT_FOUND": "No encontramos la inscripción",
  "PROFILE.NOT_FOUND": "No encontramos el perfil",
  "ACCOUNT.USERNAME_MISMATCH": "El usuario de confirmación no coincide",
  "ACCOUNT.OWNER_CLUBS_BLOCK": "Transfiere tus clubes antes de cerrar la cuenta",
  "ACCOUNT.CLOSE_FAILED": "No se pudo programar el cierre de cuenta",
  "ACCOUNT.CANCEL_CLOSE_FAILED": "No se pudo cancelar el cierre",
  "PROSHOP.NOT_FOUND": "No encontramos el producto",
  "PROSHOP.OUT_OF_STOCK": "No hay stock suficiente",
  "PROSHOP.DUPLICATE_SKU": "Ese SKU ya existe en el club",
  "REPORTS.NOT_FOUND": "No encontramos el reporte",
  "PLAN.SUB_NOT_FOUND": "No encontramos la suscripción",
  "PLAN.USER_NOT_FOUND": "No encontramos el usuario",
};

const ENGLISH_MESSAGE_ES: Record<string, string> = {
  "Invalid input": "Revisa los datos ingresados",
  "Something went wrong": "Algo salió mal. Intenta de nuevo.",
  "Sign in required": "Inicia sesión para continuar",
  "Application not found": "No encontramos la solicitud",
  "Club not found": "No encontramos el club",
  "Court not found": "No encontramos la cancha",
  "Product not found": "No encontramos el producto",
  "Report not found": "No encontramos el reporte",
  "Request not found": "No encontramos la solicitud",
  "Registración no encontrada": "No encontramos la inscripción",
};

export function translateZodMessage(msg: string, fieldPath?: string): string {
  const trimmed = msg.trim();
  if (/at least.*element|array.*min\(1\)/i.test(trimmed)) {
    return fieldPath === "sports" ? "selecciona al menos un deporte" : "selecciona al menos una opción";
  }
  if (/email/i.test(trimmed)) return "formato inválido";
  if (/too small|min/i.test(trimmed)) return "muy corto";
  if (/too big|max/i.test(trimmed)) return "muy largo";
  if (/required/i.test(trimmed)) return "requerido";
  if (/invalid/i.test(trimmed)) return "inválido";
  if (/expected/i.test(trimmed)) return "formato inválido";
  if (looksLikeBackendToken(trimmed)) return humanizeSnakeCase(trimmed).toLowerCase();
  return trimmed;
}

export function formatFieldErrors(fields: Record<string, string[]>): string | null {
  const parts = Object.entries(fields)
    .map(([path, msgs]) => {
      const label = fieldLabel(path);
      const msg = translateZodMessage(msgs[0] ?? "inválido", path);
      return `${label}: ${msg}`;
    })
    .slice(0, 3);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function translateErrorMessage(input: UserFacingErrorInput): string {
  const { code, message, fields } = input;
  const fieldSummary = fields ? formatFieldErrors(fields) : null;
  if (fieldSummary) return fieldSummary;

  if (code && ERROR_CODE_MESSAGES_ES[code]) return ERROR_CODE_MESSAGES_ES[code];
  if (ENGLISH_MESSAGE_ES[message]) return ENGLISH_MESSAGE_ES[message];

  if (looksLikeBackendToken(message)) {
    if (code && ERROR_CODE_MESSAGES_ES[code]) return ERROR_CODE_MESSAGES_ES[code];
    return humanizeSnakeCase(message.replace(/\./g, " "));
  }

  if (/^[A-Z][A-Z0-9_.]+$/.test(message.trim()) && code) {
    return ERROR_CODE_MESSAGES_ES[code] ?? "No se pudo completar la acción";
  }

  return message;
}

/** Alias usado en formularios/toasts del cliente. */
export function formatActionError(err: UserFacingErrorInput): string {
  return translateErrorMessage(err);
}

export { FIELD_LABELS_ES };
