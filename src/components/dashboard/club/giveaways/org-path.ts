export type OrgGiveawayRole = "owner" | "manager";

export function orgGiveawayPath(role: OrgGiveawayRole, giveawayId: string, subview?: "publicado" | "sortear" | "ganador") {
  const base = `/dashboard/${role}/club-sorteos/${giveawayId}`;
  return subview ? `${base}/${subview}` : base;
}
