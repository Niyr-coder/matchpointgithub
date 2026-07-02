// Notificaciones de torneo compartidas entre server actions.
//
// - `notifyMatchReady`: "te toca jugar" cuando un partido queda con ambos
//   lados definidos (generación de llave o avance de ganador). Killswitch:
//   flag `tournament_match_ready_notifs`.
// - `notifyGroupsDrawn`: una notif por jugador al sortear grupos (no una por
//   partido — un round robin de 5 generaría 4 de golpe).
// - `notifyTournamentFinishedCore`: aviso de cierre a todos los inscritos.
//   Compartida para que TODOS los paths que finalizan un torneo notifiquen
//   (botón Finalizar, confirmación de monitor y reporte directo de la final).
//
// Todas son best-effort: nunca lanzan; el flujo principal sigue si fallan.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { notify } from "@/server/notifications/dispatch";

type AdminClient = ReturnType<typeof getAdminClient>;

async function isMatchReadyNotifsEnabled(admin: AdminClient): Promise<boolean> {
  const { data } = await admin
    .from("feature_flags")
    .select("enabled_default")
    .eq("key", "tournament_match_ready_notifs")
    .maybeSingle();
  return Boolean(data?.enabled_default);
}

async function playerIdsOfRegistrations(
  admin: AdminClient,
  registrationIds: string[],
): Promise<string[]> {
  if (registrationIds.length === 0) return [];
  const { data } = await admin
    .from("registrations")
    .select("player_ids")
    .in("id", registrationIds);
  const userIds = new Set<string>();
  for (const r of data ?? []) {
    for (const pid of (r.player_ids as string[] | null) ?? []) {
      if (pid) userIds.add(pid);
    }
  }
  return Array.from(userIds);
}

/**
 * "Te toca jugar": notifica a los jugadores de las inscripciones dadas que su
 * partido quedó listo. Los walk-ins sin cuenta no reciben (no tienen perfil).
 */
export async function notifyMatchReady(
  admin: AdminClient,
  opts: {
    tournamentId: string;
    registrationIds: Array<string | null | undefined>;
    matchType: "bracket" | "group";
    matchId: string;
  },
): Promise<void> {
  try {
    if (!(await isMatchReadyNotifsEnabled(admin))) return;
    const regIds = opts.registrationIds.filter((id): id is string => Boolean(id));
    if (regIds.length === 0) return;

    const [{ data: t }, userIds] = await Promise.all([
      admin.from("tournaments").select("id,name,slug").eq("id", opts.tournamentId).maybeSingle(),
      playerIdsOfRegistrations(admin, regIds),
    ]);
    if (!t || userIds.length === 0) return;

    await Promise.all(
      userIds.map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "tournament_match_ready",
          title: "Te toca jugar",
          body: `Tu partido de ${t.name as string} está listo. Revisa tu llave y mantente atento a tu cancha.`,
          payload: {
            tournament_id: opts.tournamentId,
            tournament_slug: t.slug,
            tournament_name: t.name,
            match_type: opts.matchType,
            match_id: opts.matchId,
          },
        }),
      ),
    );
  } catch (err) {
    console.error("[notifyMatchReady] enqueue failed:", err);
  }
}

/** Una notif por jugador al sortear los grupos (o calendario de liga) de una categoría. */
export async function notifyGroupsDrawn(
  admin: AdminClient,
  opts: {
    tournamentId: string;
    categoryId: string;
    /** Copy alternativo (ej. liga round-robin). Defaults: sorteo de grupos. */
    title?: string;
    bodyTemplate?: (tournamentName: string) => string;
  },
): Promise<void> {
  try {
    if (!(await isMatchReadyNotifsEnabled(admin))) return;

    const [{ data: t }, { data: regs }] = await Promise.all([
      admin.from("tournaments").select("id,name,slug").eq("id", opts.tournamentId).maybeSingle(),
      admin
        .from("registrations")
        .select("player_ids")
        .eq("tournament_id", opts.tournamentId)
        .eq("category_id", opts.categoryId)
        .eq("status", "accepted"),
    ]);
    if (!t) return;

    const userIds = new Set<string>();
    for (const r of regs ?? []) {
      for (const pid of (r.player_ids as string[] | null) ?? []) {
        if (pid) userIds.add(pid);
      }
    }
    if (userIds.size === 0) return;

    await Promise.all(
      Array.from(userIds).map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "tournament_match_ready",
          title: opts.title ?? "Tus partidos de grupo están listos",
          body: opts.bodyTemplate
            ? opts.bodyTemplate(t.name as string)
            : `El sorteo de grupos de ${t.name as string} está listo. Revisa tu grupo y tus partidos.`,
          payload: {
            tournament_id: opts.tournamentId,
            tournament_slug: t.slug,
            tournament_name: t.name,
            match_type: "group",
          },
        }),
      ),
    );
  } catch (err) {
    console.error("[notifyGroupsDrawn] enqueue failed:", err);
  }
}

/**
 * "Tu categoría terminó": notifica a los inscritos (pending + accepted) de UNA
 * categoría cuando su final queda definida, aunque el torneo global siga live
 * con otras categorías en juego. Incluye el campeón si se puede resolver.
 */
export async function notifyCategoryFinished(
  admin: AdminClient,
  opts: {
    tournamentId: string;
    categoryId: string;
    /** Registration ganadora de la final; el helper resuelve el label. */
    championRegistrationId?: string | null;
  },
): Promise<void> {
  try {
    const [{ data: t }, { data: cat }, { data: regs }] = await Promise.all([
      admin.from("tournaments").select("id,name,slug").eq("id", opts.tournamentId).maybeSingle(),
      admin.from("tournament_categories").select("name").eq("id", opts.categoryId).maybeSingle(),
      admin
        .from("registrations")
        .select("id,player_ids,status")
        .eq("tournament_id", opts.tournamentId)
        .eq("category_id", opts.categoryId)
        .in("status", ["pending", "accepted"]),
    ]);
    if (!t) return;

    let championLabel: string | null = null;
    if (opts.championRegistrationId) {
      const champReg = (regs ?? []).find((r) => (r.id as string) === opts.championRegistrationId);
      const pids = (champReg?.player_ids as string[] | null) ?? [];
      if (pids.length > 0) {
        const { data: profs } = await admin
          .from("profiles")
          .select("id,display_name,username")
          .in("id", pids);
        const names = pids
          .map((pid) => {
            const p = (profs ?? []).find((x) => (x.id as string) === pid);
            return (p?.display_name as string | null) ?? (p?.username as string | null);
          })
          .filter((n): n is string => Boolean(n));
        if (names.length > 0) championLabel = names.join(" / ");
      }
    }

    const userIds = new Set<string>();
    for (const r of regs ?? []) {
      for (const pid of (r.player_ids as string[] | null) ?? []) {
        if (pid) userIds.add(pid);
      }
    }
    if (userIds.size === 0) return;

    const catName = (cat?.name as string | null) ?? "tu categoría";
    await Promise.all(
      Array.from(userIds).map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "tournament_category_finished",
          title: `Tu categoría terminó — ${catName}`,
          body: championLabel
            ? `La categoría ${catName} de ${t.name as string} terminó. Campeón: ${championLabel}. Revisa tu resumen del torneo.`
            : `La categoría ${catName} de ${t.name as string} terminó. Revisa tu resumen del torneo.`,
          payload: {
            tournament_id: opts.tournamentId,
            tournament_slug: t.slug,
            tournament_name: t.name,
            category_id: opts.categoryId,
            category_name: catName,
            champion_label: championLabel,
          },
        }),
      ),
    );
  } catch (err) {
    console.error("[notifyCategoryFinished] enqueue failed:", err);
  }
}

/** Notifica el cierre del torneo a todos los inscritos (pending + accepted). */
export async function notifyTournamentFinishedCore(
  admin: AdminClient,
  tournamentId: string,
): Promise<void> {
  try {
    const [{ data: t }, { data: regs }] = await Promise.all([
      admin.from("tournaments").select("id,name,slug").eq("id", tournamentId).maybeSingle(),
      admin
        .from("registrations")
        .select("player_ids,status")
        .eq("tournament_id", tournamentId)
        .in("status", ["pending", "accepted"]),
    ]);
    if (!t) return;
    const userIds = new Set<string>();
    for (const r of regs ?? []) {
      for (const pid of (r.player_ids as string[] | null) ?? []) {
        if (pid) userIds.add(pid);
      }
    }
    await Promise.all(
      Array.from(userIds).map((uid) =>
        notify({
          userId: uid,
          role: "user",
          kind: "tournament_finished",
          title: "Torneo finalizado",
          body: `${t.name as string} terminó. Revisa resultados y ranking.`,
          payload: {
            tournament_id: tournamentId,
            tournament_slug: t.slug,
            tournament_name: t.name,
          },
        }),
      ),
    );
  } catch (err) {
    console.error("[notifyTournamentFinishedCore] enqueue failed:", err);
  }
}
