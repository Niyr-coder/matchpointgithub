import type { MechanicKind } from "./types";

export type MechanicCatalogEntry = {
  kind: MechanicKind;
  label: string;
  icon: string;
  base: number;
  autoVerify: boolean;
  hint: string;
};

export const MECHANIC_CATALOG: MechanicCatalogEntry[] = [
  {
    kind: "follow",
    label: "Seguir al club",
    icon: "heart",
    base: 1,
    autoVerify: true,
    hint: "Auto-verificado",
  },
  {
    kind: "reserve",
    label: "Reservar una hora",
    icon: "calendar-check-2",
    base: 2,
    autoVerify: true,
    hint: "Solo cuenta si la reserva se completa",
  },
  {
    kind: "play",
    label: "Jugar un torneo o quedada",
    icon: "gamepad-2",
    base: 2,
    autoVerify: true,
    hint: "Cualquier evento del club este mes",
  },
  {
    kind: "share",
    label: "Compartir en stories",
    icon: "share-2",
    base: 1,
    autoVerify: false,
    hint: "Validación manual con captura",
  },
  {
    kind: "invite",
    label: "Invitar amigos",
    icon: "user-plus",
    base: 2,
    autoVerify: true,
    hint: "Por cada amigo nuevo · max 3",
  },
  {
    kind: "buy",
    label: "Comprar en pro-shop",
    icon: "shopping-bag",
    base: 3,
    autoVerify: true,
    hint: "Compras > $20 cuentan",
  },
  {
    kind: "pay",
    label: "Pagar ticket extra",
    icon: "ticket",
    base: 1,
    autoVerify: true,
    hint: "$1 por entrada · max 10",
  },
];

export function getMechanicCatalogEntry(kind: MechanicKind): MechanicCatalogEntry | undefined {
  return MECHANIC_CATALOG.find((c) => c.kind === kind);
}
