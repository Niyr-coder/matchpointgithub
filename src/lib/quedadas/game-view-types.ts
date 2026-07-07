/** Tipos compartidos del motor de juego (gestión + vista jugador). */
export type GameViewCategory = {
  id: string;
  name: string;
  level_label: string | null;
  starts_at: string | null;
  court_label?: string | null;
  max_slots?: number | null;
  target_points: number | null;
  sort_order: number;
};

export type GameViewPair = {
  id: string;
  category_id: string;
  slot_no: number;
  player_a_id: string;
  player_b_id: string | null;
};

export type GameViewParticipant = {
  user_id: string;
  status?: string;
  final_rank?: number | null;
  profiles: { display_name: string | null; username: string | null } | null;
};

/** Walk-in (guest sin cuenta): UUID propio, puede ocupar cupos y jugar games. */
export type GameViewGuest = {
  id: string;
  display_name: string;
  paid?: boolean;
  checked_in_at?: string | null;
};

export type GameViewRound = {
  id: string;
  category_id: string;
  round_no: number;
  status: string;
};

export type GameViewGame = {
  id: string;
  category_id: string;
  round_id: string | null;
  round_no: number | null;
  court_no: number | null;
  court_match_no?: number | null;
  side_a_p1: string;
  side_a_p2: string | null;
  side_b_p1: string;
  side_b_p2: string | null;
  points_a: number | null;
  points_b: number | null;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type QuedadaPlayerQuedada = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  format: string;
  match_mode: "singles" | "doubles";
  visibility: "open" | "private";
  status: string;
  starts_at: string;
  location_text: string | null;
  fee_cents: number;
  perks_text: string | null;
  prizes: unknown;
  rules: unknown;
  target_points: number | null;
  engine_mode?: string | null;
  live_at?: string | null;
};

export type QuedadaPlayerViewData = {
  quedada: QuedadaPlayerQuedada;
  meUserId: string;
  isMember: boolean;
  categories: GameViewCategory[];
  pairs: GameViewPair[];
  participants: GameViewParticipant[];
  guests: GameViewGuest[];
  rounds: GameViewRound[];
  games: GameViewGame[];
};
