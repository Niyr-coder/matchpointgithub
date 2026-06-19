import { getServerClient } from "@/lib/db/client.server";
import type { TournamentScheduleBlockView } from "@/lib/tournaments/schedule-display";

type BlockRow = {
  id: string;
  starts_at: string;
  label: string;
  category_id: string | null;
  notes: string | null;
};

export async function loadTournamentScheduleBlocks(
  tournamentId: string,
): Promise<TournamentScheduleBlockView[]> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("tournament_schedule_blocks")
    .select("id,starts_at,label,category_id,notes")
    .eq("tournament_id", tournamentId)
    .order("starts_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as BlockRow[]).map((b) => ({
    id: b.id,
    startsAt: b.starts_at,
    label: b.label,
    categoryId: b.category_id ?? null,
    notes: b.notes ?? null,
  }));
}
