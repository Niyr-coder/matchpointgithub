export type GiveawayOwner = "club" | "partner" | "matchpoint";

export type FeedPostBadge =
  | "GIVEAWAY"
  | "TORNEO"
  | "RESULTADO"
  | "FOTO"
  | "AVISO"
  | "SPOTLIGHT";

export type MechanicKind =
  | "follow"
  | "reserve"
  | "play"
  | "share"
  | "invite"
  | "buy"
  | "pay";

export type MechanicItem = {
  kind: MechanicKind;
  label: string;
  done: boolean;
  weight: number;
};

export type GiveawayMiniCardState = "open" | "closing" | "ended" | "draft";

export type FeedCommentPreview = {
  author: string;
  body: string;
};

export const DEFAULT_WIZARD_STEPS = [
  "Premio",
  "Mecánica",
  "Reglas y fechas",
  "Publicar",
] as const;
