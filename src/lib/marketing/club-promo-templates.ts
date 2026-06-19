// Catálogo de campañas promocionales predefinidas para clubs.
// El owner elige una plantilla al crear; se persiste en broadcasts.payload.

export type ClubPromoTemplateKey = "welcome15" | "bring1" | "combo20";

export type ClubPromoTemplate = {
  key: ClubPromoTemplateKey;
  title: string;
  body: string;
  kind: string;
  code: string;
  defaultMax: number;
  defaultDays: number;
  bg: string;
  accent: string;
  description: string;
};

export const CLUB_PROMO_TEMPLATES: ClubPromoTemplate[] = [
  {
    key: "welcome15",
    title: "15% off socios nuevos",
    body: "Usa el código WELCOME15 en tu primera reserva. Válido para socios nuevos del club.",
    kind: "Descuento",
    code: "WELCOME15",
    defaultMax: 100,
    defaultDays: 30,
    bg: "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
    accent: "var(--primary)",
    description: "Descuento de bienvenida para quienes reservan por primera vez.",
  },
  {
    key: "bring1",
    title: "Trae un amigo · 2x1",
    body: "Comparte BRING1 con un amigo: la segunda reserva del día va al 50%.",
    kind: "Referral",
    code: "BRING1",
    defaultMax: 50,
    defaultDays: 45,
    bg: "linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)",
    accent: "#ea580c",
    description: "Incentivo referral para traer jugadores nuevos al club.",
  },
  {
    key: "combo20",
    title: "Combo paddle + cancha",
    body: "Reserva cancha + alquiler de paddle con COMBO20 y ahorra en tu sesión.",
    kind: "Bundle",
    code: "COMBO20",
    defaultMax: 100,
    defaultDays: 60,
    bg: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    accent: "var(--muted-fg)",
    description: "Bundle de cancha + equipo para upsell en proshop.",
  },
];

export function getClubPromoTemplate(key: string): ClubPromoTemplate | undefined {
  return CLUB_PROMO_TEMPLATES.find((t) => t.key === key);
}

export function fmtPromoEndDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const dow = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  return `${dow[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}
