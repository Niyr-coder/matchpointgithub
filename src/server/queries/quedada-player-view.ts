import { getServerClient } from "@/lib/db/client.server";
import { requireUserId } from "@/lib/auth/session";
import { MpError } from "@/lib/api/errors";
import type { QuedadaPlayerViewData } from "@/lib/quedadas/game-view-types";

type ParticipantRow = {
  user_id: string;
  status: string;
  final_rank: number | null;
  profiles: { display_name: string | null; username: string | null } | null;
};

function participantIsMember(
  userId: string,
  creatorId: string,
  rows: ParticipantRow[],
): boolean {
  if (creatorId === userId) return true;
  return rows.some(
    (p) =>
      p.user_id === userId &&
      (p.status === "joined" || p.status === "invited"),
  );
}

/** Carga read-only para QuedadaDetailView (sin invite_code, banco, co-hosts). */
export async function loadQuedadaPlayerView(quedadaId: string): Promise<QuedadaPlayerViewData> {
  const userId = await requireUserId();
  const supabase = await getServerClient();

  const { data: q, error: qErr } = await supabase
    .from("quedadas")
    .select(
      "id,creator_id,title,description,format,match_mode,visibility,status,starts_at,live_at,location_text,fee_cents,perks_text,prizes,rules,target_points,engine_mode",
    )
    .eq("id", quedadaId)
    .maybeSingle();
  if (qErr) throw new MpError("QUEDADAS.READ_FAILED", qErr.message, 500);
  if (!q) throw new MpError("QUEDADAS.NOT_FOUND", "Quedada no encontrada", 404);

  const creatorId = q.creator_id as string;

  const [cats, pairs, partsRaw, rounds, games, guests] = await Promise.all([
    supabase
      .from("quedada_categories")
      .select("id,name,level_label,starts_at,court_label,max_slots,target_points,sort_order")
      .eq("quedada_id", quedadaId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("quedada_pairs")
      .select("id,category_id,slot_no,player_a_id,player_b_id")
      .eq("quedada_id", quedadaId)
      .order("slot_no", { ascending: true }),
    supabase
      .from("quedada_participants")
      .select("user_id,status,final_rank,profiles!quedada_participants_user_id_fkey(display_name,username)")
      .eq("quedada_id", quedadaId),
    supabase
      .from("quedada_rounds")
      .select("id,category_id,round_no,status")
      .eq("quedada_id", quedadaId)
      .order("round_no", { ascending: true }),
    supabase
      .from("quedada_games")
      .select(
        "id,category_id,round_id,round_no,court_no,court_match_no,side_a_p1,side_a_p2,side_b_p1,side_b_p2,points_a,points_b,status,created_at,updated_at",
      )
      .eq("quedada_id", quedadaId)
      .order("created_at", { ascending: true }),
    supabase
      .from("quedada_guests")
      .select("id,display_name,paid,checked_in_at")
      .eq("quedada_id", quedadaId)
      .order("created_at", { ascending: true }),
  ]);

  const participantsAll = (partsRaw.data ?? []) as ParticipantRow[];
  const isMember = participantIsMember(userId, creatorId, participantsAll);

  if (q.visibility === "private" && !isMember) {
    throw new MpError("QUEDADAS.FORBIDDEN", "Esta quedada es privada y no tienes acceso", 403);
  }

  const participants = participantsAll.filter((p) => p.status === "joined");

  return {
    quedada: {
      id: q.id as string,
      creator_id: creatorId,
      title: q.title as string,
      description: (q.description as string | null) ?? null,
      format: q.format as string,
      match_mode: q.match_mode as "singles" | "doubles",
      visibility: q.visibility as "open" | "private",
      status: q.status as string,
      starts_at: q.starts_at as string,
      location_text: (q.location_text as string | null) ?? null,
      fee_cents: (q.fee_cents as number) ?? 0,
      perks_text: (q.perks_text as string | null) ?? null,
      prizes: q.prizes,
      rules: q.rules,
      target_points: (q.target_points as number | null) ?? null,
      engine_mode: (q.engine_mode as string | null) ?? null,
      live_at: (q.live_at as string | null) ?? null,
    },
    meUserId: userId,
    isMember,
    categories: (cats.data ?? []) as QuedadaPlayerViewData["categories"],
    pairs: (pairs.data ?? []) as QuedadaPlayerViewData["pairs"],
    participants,
    guests: (guests.data ?? []) as QuedadaPlayerViewData["guests"],
    rounds: (rounds.data ?? []) as QuedadaPlayerViewData["rounds"],
    games: (games.data ?? []) as QuedadaPlayerViewData["games"],
  };
}
