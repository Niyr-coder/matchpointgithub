// Helpers de llave eliminatoria compartidos entre generadores y paths de
// reporte (partner y monitor).
//
// - `advanceFirstRoundByes`: un cuadro se redondea al power-of-2 y los seeds
//   altos reciben bye. Sin esto, el partido "A vs TBD" quedaba 'scheduled'
//   para siempre (la UI exige ambos lados para reportar) y el bracket se
//   atascaba. El bye se marca walkover 'bye' (sin ELO: winner_side queda
//   null, el trigger nunca corre) y el ganador se pre-coloca en la ronda
//   siguiente.
// - `feedBronzeMatchLoser`: alimenta el partido por el 3er puesto con los
//   perdedores de semifinales. No-op si el bracket no tiene bronce.
import "server-only";

import type { getAdminClient } from "@/lib/db/client.admin";
import { notifyMatchReady } from "@/lib/notifications/tournament";

type AdminClient = ReturnType<typeof getAdminClient>;

export type InsertedBracketMatch = {
  id: string;
  round: number;
  position: number;
  side_a_registration_id: string | null;
  side_b_registration_id: string | null;
};

export async function advanceFirstRoundByes(
  admin: AdminClient,
  tournamentId: string,
  bracketId: string,
  inserted: InsertedBracketMatch[],
): Promise<void> {
  const maxRound = inserted.reduce((m, x) => Math.max(m, x.round), 0);
  if (maxRound < 2) return; // cuadro de 2: no hay byes posibles

  const byes = inserted.filter((m) => {
    if (m.round !== 1) return false;
    const sides = (m.side_a_registration_id ? 1 : 0) + (m.side_b_registration_id ? 1 : 0);
    return sides === 1;
  });
  if (byes.length === 0) return;

  // Cerrar los partidos-bye (walkover 'bye'; winner_side null → sin ELO).
  await admin
    .from("bracket_matches")
    .update({ status: "cancelled", walkover_reason: "bye" } as never)
    .in("id", byes.map((b) => b.id));

  // Pre-colocar cada ganador de bye en su slot de ronda 2. Dos byes pueden
  // apuntar al mismo cruce (cuadro de 8 con 5 inscritos): se agrupan en un
  // solo patch.
  const patchByPos = new Map<number, Record<string, string>>();
  for (const b of byes) {
    const winner = (b.side_a_registration_id ?? b.side_b_registration_id)!;
    const nextPos = Math.floor(b.position / 2);
    const sideKey = b.position % 2 === 0 ? "side_a_registration_id" : "side_b_registration_id";
    const patch = patchByPos.get(nextPos) ?? {};
    patch[sideKey] = winner;
    patchByPos.set(nextPos, patch);
  }

  for (const [pos, patch] of patchByPos) {
    await admin
      .from("bracket_matches")
      .update(patch as never)
      .eq("bracket_id", bracketId)
      .eq("round", 2)
      .eq("position", pos);
  }

  // Si algún cruce de ronda 2 quedó completo, avisar a ambos lados.
  const { data: nextRows } = await admin
    .from("bracket_matches")
    .select("id,side_a_registration_id,side_b_registration_id")
    .eq("bracket_id", bracketId)
    .eq("round", 2)
    .in("position", Array.from(patchByPos.keys()));
  for (const m of nextRows ?? []) {
    if (m.side_a_registration_id && m.side_b_registration_id) {
      void notifyMatchReady(admin, {
        tournamentId,
        registrationIds: [m.side_a_registration_id as string, m.side_b_registration_id as string],
        matchType: "bracket",
        matchId: m.id as string,
      });
    }
  }
}

export async function feedBronzeMatchLoser(
  admin: AdminClient,
  tournamentId: string,
  bracketId: string,
  loserRegId: string,
): Promise<void> {
  const { data: bronze } = await admin
    .from("bracket_matches")
    .select("id,side_a_registration_id,side_b_registration_id")
    .eq("bracket_id", bracketId)
    .eq("is_bronze" as never, true)
    .maybeSingle();
  if (!bronze) return;
  const patch: Record<string, unknown> = {};
  if (!bronze.side_a_registration_id) patch.side_a_registration_id = loserRegId;
  else if (!bronze.side_b_registration_id) patch.side_b_registration_id = loserRegId;
  else return;
  await admin.from("bracket_matches").update(patch as never).eq("id", bronze.id as string);

  // Si este perdedor completa el partido de bronce, avisar a ambos lados.
  const otherSlot = (patch.side_a_registration_id
    ? bronze.side_b_registration_id
    : bronze.side_a_registration_id) as string | null;
  if (otherSlot) {
    void notifyMatchReady(admin, {
      tournamentId,
      registrationIds: [loserRegId, otherSlot],
      matchType: "bracket",
      matchId: bronze.id as string,
    });
  }
}
