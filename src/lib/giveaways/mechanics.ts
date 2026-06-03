// Catálogo de mecánicas de entrada — fuente compartida server/client.
export type MechanicKind = "follow" | "reserve" | "play" | "share" | "invite" | "buy" | "pay";

export type MechanicDefinition = {
  kind: MechanicKind;
  label: string;
  icon: string;
  baseWeight: number;
  autoVerify: boolean;
  hint: string;
};

export const MECHANIC_CATALOG: MechanicDefinition[] = [
  {
    kind: "follow",
    label: "Seguir al club",
    icon: "heart",
    baseWeight: 1,
    autoVerify: true,
    hint: "Auto-verificado",
  },
  {
    kind: "reserve",
    label: "Reservar una hora",
    icon: "calendar-check-2",
    baseWeight: 2,
    autoVerify: true,
    hint: "Solo cuenta si la reserva se completa",
  },
  {
    kind: "play",
    label: "Jugar un torneo o quedada",
    icon: "gamepad-2",
    baseWeight: 2,
    autoVerify: true,
    hint: "Cualquier evento del club este mes",
  },
  {
    kind: "share",
    label: "Compartir en stories",
    icon: "share-2",
    baseWeight: 1,
    autoVerify: false,
    hint: "Validación manual con captura",
  },
  {
    kind: "invite",
    label: "Invitar amigos",
    icon: "user-plus",
    baseWeight: 2,
    autoVerify: true,
    hint: "Por cada amigo nuevo · máx. 3",
  },
  {
    kind: "buy",
    label: "Comprar en pro-shop",
    icon: "shopping-bag",
    baseWeight: 3,
    autoVerify: true,
    hint: "Compras > $20 cuentan",
  },
  {
    kind: "pay",
    label: "Pagar ticket extra",
    icon: "ticket",
    baseWeight: 1,
    autoVerify: true,
    hint: "$1 por entrada · máx. 10",
  },
];

export type GiveawayMechanicConfig = {
  kind: MechanicKind;
  enabled: boolean;
  weight: number;
};

export function mechanicByKind(kind: MechanicKind): MechanicDefinition | undefined {
  return MECHANIC_CATALOG.find((m) => m.kind === kind);
}

export function maxEntriesFromMechanics(mechanics: GiveawayMechanicConfig[]): number {
  return mechanics.filter((m) => m.enabled).reduce((sum, m) => sum + Math.max(1, m.weight), 0);
}

export function parseMechanics(raw: unknown): GiveawayMechanicConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: GiveawayMechanicConfig[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const kind = (row as { kind?: string }).kind;
    if (!kind || !MECHANIC_CATALOG.some((m) => m.kind === kind)) continue;
    out.push({
      kind: kind as MechanicKind,
      enabled: Boolean((row as { enabled?: boolean }).enabled),
      weight: Math.max(1, Number((row as { weight?: number }).weight) || 1),
    });
  }
  return out;
}
