/** Responsable del tratamiento y datos registrales (LOPDP). Configura en producción vía env. */

export type LegalEntity = {
  tradeName: string;
  legalName: string;
  ruc: string | null;
  address: string;
  representative: string | null;
  privacyEmail: string;
  legalEmail: string;
  supportEmail: string;
  jurisdictionCity: string;
};

export function getLegalEntity(): LegalEntity {
  return {
    tradeName: "MATCHPOINT",
    legalName: process.env.MP_LEGAL_NAME?.trim() || "MATCHPOINT Ecuador",
    ruc: process.env.MP_LEGAL_RUC?.trim() || null,
    address: process.env.MP_LEGAL_ADDRESS?.trim() || "Quito, Pichincha, Ecuador",
    representative: process.env.MP_LEGAL_REPRESENTATIVE?.trim() || null,
    privacyEmail: "privacidad@matchpoint.top",
    legalEmail: "hola@matchpoint.top",
    supportEmail: "soporte@matchpoint.top",
    jurisdictionCity: "Quito",
  };
}

/** Texto publicable del RUC cuando no está configurado en env. */
export function formatLegalRucPublic(): string {
  const { ruc, privacyEmail } = getLegalEntity();
  if (ruc) return ruc;
  return `Solicítalo a ${privacyEmail}`;
}

/** Período de gracia antes del borrado definitivo (días). */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** Plazo máximo de respuesta a derechos ARCO (días hábiles, LOPDP). */
export const ARCO_RESPONSE_BUSINESS_DAYS = 15;
