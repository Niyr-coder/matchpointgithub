// Promoción FIFO desde la lista de espera de un torneo.
//
// Se invoca cuando se libera un cupo (jugador cancela, partner rechaza/retira,
// admin remueve, refund cancela la inscripción). Promueve UNA inscripción por
// llamada — cada liberación abre exactamente un cupo.
//
// Semántica (docs/product/01-tournaments.md):
//   - Solo promueve mientras el torneo sigue en fase de inscripciones
//     (published / registration_open / registration_closed) — nunca en
//     live/finished/cancelled.
//   - Misma categoría que el cupo liberado (o sin categoría si el torneo no
//     usa categorías). No cruza categorías.
//   - Revalida cupos (global y de categoría, semántica pending+accepted)
//     antes de promover, por si el organizador redujo caps.
//   - El promovido pasa a 'pending' SIN transacción de pago: coordina el pago
//     con el organizador (prepay → comprobante; onsite → en el club).
//
// Best-effort: nunca lanza — la mutación que liberó el cupo no debe fallar
// por esto.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { notify } from "@/server/notifications/dispatch";

type AdminClient = ReturnType<typeof getAdminClient>;

const PROMOTABLE_STATUSES = new Set(["published", "registration_open", "registration_closed"]);

export async function promoteFromWaitlist(
  admin: AdminClient,
  opts: { tournamentId: string; categoryId: string | null },
): Promise<string | null> {
  try {
    const { data: t } = await admin
      .from("tournaments")
      .select("id, name, slug, status, max_participants")
      .eq("id", opts.tournamentId)
      .maybeSingle();
    if (!t || !PROMOTABLE_STATUSES.has(t.status as string)) return null;

    // Candidato FIFO en la misma categoría (o sin categoría).
    let candQ = admin
      .from("registrations")
      .select("id, player_ids, category_id")
      .eq("tournament_id", opts.tournamentId)
      .eq("status", "waitlist")
      .order("created_at", { ascending: true })
      .limit(1);
    candQ = opts.categoryId ? candQ.eq("category_id", opts.categoryId) : candQ.is("category_id", null);
    const { data: candRows } = await candQ;
    const cand = ((candRows ?? []) as Array<{ id: string; player_ids: string[] | null; category_id: string | null }>)[0];
    if (!cand) return null;

    // Revalidar cupo global (pending+accepted, por equipo).
    const maxParticipants = (t.max_participants as number | null) ?? null;
    if (maxParticipants != null && maxParticipants > 0) {
      const { count: totalCount } = await admin
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("tournament_id", opts.tournamentId)
        .in("status", ["pending", "accepted"]);
      if ((totalCount ?? 0) >= maxParticipants) return null;
    }

    // Revalidar cupo de la categoría del candidato.
    if (cand.category_id) {
      const { data: cat } = await admin
        .from("tournament_categories")
        .select("max_teams")
        .eq("id", cand.category_id)
        .maybeSingle();
      const maxTeams = (cat?.max_teams as number | null) ?? null;
      if (maxTeams != null && maxTeams > 0) {
        const { count: catCount } = await admin
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("tournament_id", opts.tournamentId)
          .eq("category_id", cand.category_id)
          .in("status", ["pending", "accepted"]);
        if ((catCount ?? 0) >= maxTeams) return null;
      }
    }

    // Promover — guard de carrera: solo si sigue en waitlist.
    const { data: promoted } = await admin
      .from("registrations")
      .update({ status: "pending" } as never)
      .eq("id", cand.id)
      .eq("status", "waitlist")
      .select("id");
    if (!promoted || promoted.length === 0) return null;

    for (const pid of cand.player_ids ?? []) {
      if (!pid) continue;
      void notify({
        userId: pid,
        role: "user",
        kind: "waitlist_promoted",
        title: "¡Se liberó un cupo!",
        body: `Tu inscripción a ${t.name as string} pasó de lista de espera a pendiente. Si el torneo tiene cuota, coordina el pago con el organizador.`,
        payload: {
          tournament_id: opts.tournamentId,
          tournament_slug: t.slug,
          tournament_name: t.name,
          registration_id: cand.id,
        },
      });
    }

    return cand.id;
  } catch (err) {
    console.error("[waitlist] promoteFromWaitlist falló:", err);
    return null;
  }
}
