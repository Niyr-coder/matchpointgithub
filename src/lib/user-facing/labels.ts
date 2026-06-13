/** Labels legibles para enums/campos del backend (client-safe). */

import type { RoleKey } from "@/lib/roles";
import { MP_ROLES } from "@/lib/roles";

export const SPORT_LABELS_ES: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
  multi: "Multi",
};

export const ROLE_LABELS_ES: Record<string, string> = {
  user: "Jugador",
  admin: "Administrador",
  owner: "Dueño de club",
  manager: "Manager",
  partner: "Partner",
  coach: "Coach",
  employee: "Empleado",
};

export function roleLabel(role: string): string {
  const fromConfig = MP_ROLES[role as RoleKey]?.l;
  if (fromConfig && role !== "user") return fromConfig;
  return ROLE_LABELS_ES[role] ?? humanizeSnakeCase(role);
}

export const CLUB_APPLICATION_STATUS_ES: Record<string, string> = {
  draft: "borrador",
  submitted: "enviada",
  docs_review: "revisión documental",
  field_verification: "verificación en sitio",
  final_review: "revisión final",
  approved: "aprobada",
  rejected: "rechazada",
  withdrawn: "retirada",
};

export const FIELD_LABELS_ES: Record<string, string> = {
  name: "Nombre del club",
  orgType: "Tipo de organización",
  sports: "Deportes",
  shortDescription: "Descripción",
  description: "Descripción",
  legalName: "Razón social",
  taxId: "RUC / Tax ID",
  foundedYear: "Año de fundación",
  contactPerson: "Persona de contacto",
  contactEmail: "Email de contacto",
  contactPhone: "Celular de contacto",
  websiteOrSocial: "Web o redes",
  address: "Dirección",
  district: "Ciudad / distrito",
  province: "Provincia",
  country: "País",
  referenceNote: "Referencia",
  parking: "Estacionamiento",
  geoLat: "Latitud",
  geoLng: "Longitud",
  locationCity: "Ciudad",
  sector: "Parroquia / sector",
  cancellationPolicy: "Política de cancelación",
  weeklyHours: "Horario semanal",
  currency: "Moneda",
  clubId: "Club",
  courtId: "Cancha",
  startsAt: "Fecha y hora",
  title: "Título",
  email: "Email",
  phone: "Teléfono",
  termsAccepted: "Términos y condiciones",
  applicationId: "Solicitud",
  role: "Rol",
  userId: "Usuario",
  tournamentId: "Torneo",
  quedadaId: "Quedada",
  maxPlayers: "Cupos",
  visibility: "Visibilidad",
  locationText: "Ubicación",
  perks: "Beneficios",
  level: "Nivel",
  sport: "Deporte",
  price: "Precio",
  basePriceCents: "Precio base",
  proposedCode: "Nombre de cancha",
  indoor: "Tipo de cancha",
  surface: "Superficie",
  lights: "Iluminación",
};

export function fieldLabel(path: string): string {
  const leaf = path.split(".").pop() ?? path;
  return FIELD_LABELS_ES[path] ?? FIELD_LABELS_ES[leaf] ?? humanizeSnakeCase(leaf);
}

export function humanizeSnakeCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Sustituye tokens snake_case conocidos dentro de un texto ya renderizado. */
export function polishUserFacingText(text: string): string {
  let out = text;
  for (const [key, label] of Object.entries(CLUB_APPLICATION_STATUS_ES)) {
    out = out.replace(new RegExp(`\\b${key}\\b`, "g"), label);
  }
  for (const [key, label] of Object.entries(SPORT_LABELS_ES)) {
    out = out.replace(new RegExp(`\\b${key}\\b`, "gi"), label);
  }
  for (const [key, label] of Object.entries(ROLE_LABELS_ES)) {
    out = out.replace(new RegExp(`\\b${key}\\b`, "g"), label);
  }
  return out;
}

export function looksLikeBackendToken(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (/^[A-Z][A-Z0-9_.]+$/.test(t)) return true;
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(t)) return true;
  return false;
}
