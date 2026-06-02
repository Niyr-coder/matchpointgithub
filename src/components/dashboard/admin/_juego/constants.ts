import type { ChipMeta } from "./components";

export type QuedadaStatus =
  | "draft"
  | "published"
  | "registration_open"
  | "registration_closed"
  | "live"
  | "finished"
  | "cancelled"
  | "full";
export type QuedadaFormat = "americano" | "mexicano" | "round_robin" | "kotc" | "canguil" | "libre";
export type Severity = "high" | "medium" | "low";
export type MatchStatus = "scheduled" | "live" | "reported" | "confirmed" | "disputed" | "walkover" | "cancelled";
export type MatchKind = "ranked" | "friendly" | "tournament" | "league";
export type ReservaStatus =
  | "booked"
  | "confirmed"
  | "checked_in"
  | "cancelled"
  | "no_show"
  | "completed"
  | "refunded";
export type PaymentMethod = "cash" | "card" | "transfer" | "wallet" | "free";

export const QUEDADA_STATUS_META: Record<QuedadaStatus, ChipMeta> = {
  draft: { label: "Borrador", bg: "#f1f5f9", fg: "#475569" },
  published: { label: "Publicada", bg: "#f1f5f9", fg: "#475569" },
  registration_open: { label: "Abierta", bg: "#dcfce7", fg: "#15803d" },
  registration_closed: { label: "Cerrada", bg: "#fef9c3", fg: "#a16207" },
  live: { label: "En curso", bg: "#dbeafe", fg: "#1d4ed8" },
  finished: { label: "Finalizada", bg: "#ede9fe", fg: "#6d28d9" },
  cancelled: { label: "Cancelada", bg: "#fee2e2", fg: "#dc2626" },
  full: { label: "Llena", bg: "#fef9c3", fg: "#a16207" },
};

export const QUEDADA_FORMAT_LABEL: Record<QuedadaFormat, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  round_robin: "Round Robin",
  kotc: "Rey de Cancha",
  canguil: "Canguil",
  libre: "Libre",
};

export const SEVERITY_META: Record<Severity, ChipMeta> = {
  high: { label: "● Alta", bg: "rgba(220,38,38,0.12)", fg: "#dc2626" },
  medium: { label: "● Media", bg: "rgba(245,158,11,0.14)", fg: "#b45309" },
  low: { label: "● Baja", bg: "rgba(115,115,115,0.12)", fg: "#525252" },
};

export const MATCH_STATUS_META: Record<MatchStatus, ChipMeta> = {
  scheduled: { label: "Agendado", bg: "#dbeafe", fg: "#1d4ed8" },
  live: { label: "En vivo", bg: "#ede9fe", fg: "#6d28d9" },
  reported: { label: "Reportado", bg: "#fef9c3", fg: "#a16207" },
  disputed: { label: "En disputa", bg: "#fee2e2", fg: "#dc2626" },
  confirmed: { label: "Confirmado", bg: "#dcfce7", fg: "#15803d" },
  walkover: { label: "Walkover", bg: "#fef3c7", fg: "#b45309" },
  cancelled: { label: "Cancelado", bg: "#f1f5f9", fg: "#475569" },
};

export const MATCH_KIND_META: Record<MatchKind, ChipMeta> = {
  ranked: { label: "Ranked", bg: "rgba(16,185,129,0.12)", fg: "#15803d" },
  friendly: { label: "Amistoso", bg: "rgba(115,115,115,0.12)", fg: "#525252" },
  tournament: { label: "Torneo", bg: "rgba(124,58,237,0.12)", fg: "#6d28d9" },
  league: { label: "Liga", bg: "rgba(14,165,233,0.12)", fg: "#0369a1" },
};

export const RESERVA_STATUS_META: Record<ReservaStatus, ChipMeta> = {
  booked: { label: "Reservada", bg: "#dbeafe", fg: "#1d4ed8" },
  confirmed: { label: "Confirmada", bg: "#dcfce7", fg: "#15803d" },
  checked_in: { label: "Check-in", bg: "#ede9fe", fg: "#6d28d9" },
  cancelled: { label: "Cancelada", bg: "#fee2e2", fg: "#dc2626" },
  no_show: { label: "No-show", bg: "#fef3c7", fg: "#b45309" },
  refunded: { label: "Reembolsada", bg: "#dbeafe", fg: "#1d4ed8" },
  completed: { label: "Jugada", bg: "#f1f5f9", fg: "#475569" },
};

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; icon: string }> = {
  cash: { label: "Efectivo", icon: "banknote" },
  card: { label: "Tarjeta", icon: "credit-card" },
  transfer: { label: "Transferencia", icon: "landmark" },
  wallet: { label: "Wallet", icon: "wallet" },
  free: { label: "Gratis", icon: "ticket" },
};

export const QUEDADAS_HERO_BG =
  "radial-gradient(115% 130% at 98% 112%, rgba(124,58,237,0.3) 0%, rgba(124,58,237,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)";

export const MATCHES_HERO_BG =
  "radial-gradient(115% 130% at 98% 112%, rgba(220,38,38,0.32) 0%, rgba(220,38,38,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #1f0e0e 58%, #450a0a 100%)";

export const RESERVAS_HERO_BG =
  "radial-gradient(115% 130% at 98% 112%, rgba(14,165,233,0.32) 0%, rgba(14,165,233,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #0c1a2e 58%, #0e2a4d 100%)";
