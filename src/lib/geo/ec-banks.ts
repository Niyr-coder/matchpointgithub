// Catálogo estático de bancos y cooperativas de Ecuador para el dropdown de
// datos del organizador en Quedadas. No es parámetro de negocio (no va a
// platform_config); es una lista de referencia. "Otro" permite texto libre.
//
// Orden: bancos privados grandes primero, luego el resto y cooperativas.

export const EC_BANKS: readonly string[] = [
  "Banco Pichincha",
  "Banco Guayaquil",
  "Banco del Pacífico",
  "Produbanco",
  "Banco Bolivariano",
  "Banco Internacional",
  "Banco del Austro",
  "Banco de Loja",
  "Banco de Machala",
  "Banco ProCredit",
  "Banco General Rumiñahui",
  "Banco Solidario",
  "BanEcuador",
  "Banco del Barrio",
  "Diners Club",
  "Cooperativa JEP",
  "Cooperativa 29 de Octubre",
  "Cooperativa Policía Nacional",
  "Cooperativa Andalucía",
  "Cooperativa Cooprogreso",
  "Cooperativa Alianza del Valle",
  "Otro",
] as const;

export type AccountType = "ahorros" | "corriente";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ahorros: "Ahorros",
  corriente: "Corriente",
};
