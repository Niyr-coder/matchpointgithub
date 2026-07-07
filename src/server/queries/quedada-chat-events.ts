import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { getAdminClient } from "@/lib/db/client.admin";
import { postQuedadaChannelMessage } from "@/lib/messages/quedada-channel";

type Db = SupabaseClient<Database>;

async function nameMap(supabase: Db, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  // Un id puede ser un profile o un walk-in (quedada_guests) — resolver ambos.
  const [{ data }, { data: guests }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,username").in("id", ids),
    supabase.from("quedada_guests").select("id,display_name").in("id", ids),
  ]);
  for (const p of data ?? []) {
    const label =
      ((p.display_name as string | null) ?? (p.username as string | null) ?? "Jugador").trim();
    map.set(p.id as string, label);
  }
  for (const g of (guests ?? []) as unknown as Array<{ id: string; display_name: string }>) {
    map.set(g.id, g.display_name);
  }
  return map;
}

function label(map: Map<string, string>, id: string | null | undefined): string {
  if (!id) return "—";
  return map.get(id) ?? "Jugador";
}

function sideLabel(map: Map<string, string>, ids: (string | null)[]): string {
  return ids.filter(Boolean).map((id) => label(map, id)).join(" + ") || "—";
}

function formatMatchLine(
  map: Map<string, string>,
  courtNo: number | null,
  sideA: (string | null)[],
  sideB: (string | null)[],
): string {
  const court = courtNo != null ? `Cancha ${courtNo}` : "Partido";
  return `· ${court}: ${sideLabel(map, sideA)} vs ${sideLabel(map, sideB)}`;
}

type GameRow = {
  court_no: number | null;
  side_a_p1: string;
  side_a_p2: string | null;
  side_b_p1: string;
  side_b_p2: string | null;
};

/** Anuncia una ronda recién publicada con partidos por cancha. */
export async function announceQuedadaRoundPublished(
  supabase: Db,
  quedadaId: string,
  roundNo: number,
  roundId: string,
  byes: number,
  byePlayerIds: string[] = [],
): Promise<void> {
  const { data: games } = await supabase
    .from("quedada_games")
    .select("court_no,side_a_p1,side_a_p2,side_b_p1,side_b_p2")
    .eq("round_id", roundId)
    .order("court_no", { ascending: true });

  const rows = (games ?? []) as GameRow[];
  const allIds = rows.flatMap((g) => [g.side_a_p1, g.side_a_p2, g.side_b_p1, g.side_b_p2, ...byePlayerIds]).filter((id): id is string => Boolean(id));
  const map = await nameMap(supabase, allIds);

  const lines = [`Ronda ${roundNo} publicada`, ...rows.map((g) => formatMatchLine(map, g.court_no, [g.side_a_p1, g.side_a_p2], [g.side_b_p1, g.side_b_p2]))];

  if (byes > 0 && byePlayerIds.length > 0) {
    lines.push(`Descansan: ${byePlayerIds.map((id) => label(map, id)).join(", ")}`);
  } else if (byes > 0) {
    lines.push(`Descansan ${byes} jugador${byes === 1 ? "" : "es"}`);
  }

  await postQuedadaChannelMessage(quedadaId, lines.join("\n"), {
    event: "round_published",
    round_no: roundNo,
  });
}

/** Si todos los partidos de la ronda ya tienen resultado, avisa en el chat. */
export async function announceQuedadaRoundCompletedIfReady(
  supabase: Db,
  quedadaId: string,
  categoryId: string,
  roundNo: number | null,
): Promise<void> {
  if (roundNo == null) return;

  const { data: roundGames } = await supabase
    .from("quedada_games")
    .select("status,points_a,points_b,court_no,side_a_p1,side_a_p2,side_b_p1,side_b_p2")
    .eq("quedada_id", quedadaId)
    .eq("category_id", categoryId)
    .eq("round_no", roundNo);

  const games = roundGames ?? [];
  if (games.length === 0) return;
  if (games.some((g) => (g.status as string) !== "played")) return;

  const admin = getAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("kind" as never, "quedada" as never)
    .eq("quedada_id" as never, quedadaId as never)
    .maybeSingle();
  if (conv?.id) {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.id as string)
      .eq("kind", "system")
      .filter("payload->>event", "eq", "round_completed")
      .filter("payload->>round_no", "eq", String(roundNo));
    if ((count ?? 0) > 0) return;
  }

  const map = await nameMap(
    supabase,
    games.flatMap((g) => [g.side_a_p1, g.side_a_p2, g.side_b_p1, g.side_b_p2].filter((id): id is string => Boolean(id))),
  );

  const resultLines = games.map((g) => {
    const court = g.court_no != null ? `Cancha ${g.court_no as number}` : "Partido";
    const score = `${g.points_a ?? 0}–${g.points_b ?? 0}`;
    const a = sideLabel(map, [g.side_a_p1 as string, g.side_a_p2 as string | null]);
    const b = sideLabel(map, [g.side_b_p1 as string, g.side_b_p2 as string | null]);
    return `· ${court}: ${a} ${score} ${b}`;
  });

  await postQuedadaChannelMessage(
    quedadaId,
    [`Ronda ${roundNo} completada`, ...resultLines].join("\n"),
    { event: "round_completed", round_no: roundNo },
  );
}

export async function announceQuedadaStatus(
  quedadaId: string,
  event: "registration_closed" | "live" | "finished" | "cancelled" | "rescheduled",
  detail?: string,
): Promise<void> {
  const copy: Record<typeof event, string> = {
    registration_closed: "Inscripciones cerradas. Desde aquí coordinamos logística, pagos y horarios.",
    live: "¡La quedada empezó! Revisa tu calendario de partidos en la app.",
    finished: "Quedada finalizada. Gracias por jugar — el podio ya está publicado.",
    cancelled: "Esta quedada fue cancelada por el organizador.",
    rescheduled: detail ?? "La quedada cambió de fecha u horario.",
  };
  await postQuedadaChannelMessage(quedadaId, copy[event], { event });
}

export async function announceQuedadaCategoryFinished(
  supabase: Db,
  quedadaId: string,
  categoryName: string,
  nextCategoryName: string | null,
  quedadaFinished: boolean,
): Promise<void> {
  if (quedadaFinished) {
    await announceQuedadaStatus(quedadaId, "finished");
    return;
  }
  const body = nextCategoryName
    ? `Categoría «${categoryName}» finalizada. Sigue «${nextCategoryName}».`
    : `Categoría «${categoryName}» finalizada.`;
  await postQuedadaChannelMessage(quedadaId, body, {
    event: "category_finished",
    category_name: categoryName,
    next_category_name: nextCategoryName,
  });
}
