import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import {
  computeQuedadaProfileStats,
  type QuedadaGameRow,
  type QuedadaParticipantRow,
  type QuedadaProfileStats,
} from "@/lib/quedadas/profile-stats";

type DbClient = ReturnType<typeof getServerClient>;

/**
 * Stats agregadas de quedadas para perfil (podios, rachas, partidos).
 * En perfil ajeno usa admin client: solo agregados de quedadas finalizadas,
 * sin datos de pago ni gestión.
 */
export async function loadQuedadaProfileStats(
  userId: string,
  opts?: { useAdmin?: boolean },
): Promise<QuedadaProfileStats | null> {
  const db: DbClient = opts?.useAdmin ? (getAdminClient() as DbClient) : await getServerClient();

  const { data: partsRaw, error: pErr } = await db
    .from("quedada_participants")
    .select(
      "quedada_id,final_rank,joined_at,quedadas(id,title,format,status,updated_at,starts_at)",
    )
    .eq("user_id", userId)
    .eq("status", "joined");

  if (pErr) {
    console.error("[loadQuedadaProfileStats] participants", pErr.message);
    return null;
  }

  const participants = (partsRaw ?? []) as unknown as QuedadaParticipantRow[];
  if (participants.length === 0) {
    return computeQuedadaProfileStats([], [], userId);
  }

  const finishedIds = participants
    .filter((p) => p.quedadas?.status === "finished")
    .map((p) => p.quedada_id);

  let games: QuedadaGameRow[] = [];
  if (finishedIds.length > 0) {
    const { data: gamesRaw, error: gErr } = await db
      .from("quedada_games")
      .select(
        "quedada_id,side_a_p1,side_a_p2,side_b_p1,side_b_p2,points_a,points_b,status,updated_at",
      )
      .in("quedada_id", finishedIds)
      .eq("status", "played");
    if (gErr) {
      console.error("[loadQuedadaProfileStats] games", gErr.message);
    } else {
      games = (gamesRaw ?? []) as unknown as QuedadaGameRow[];
    }
  }

  return computeQuedadaProfileStats(participants, games, userId);
}
