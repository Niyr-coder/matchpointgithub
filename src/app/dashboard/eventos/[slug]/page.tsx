import { notFound } from "next/navigation";
import { getTournament, listFeaturedTournaments } from "@/server/actions/tournaments";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import {
  TournamentDetailView,
  type MyRegistration,
  type TournamentInscrito,
} from "@/components/dashboard/eventos/TournamentDetailView";

export default async function DashboardTournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [detailRes, summaryRes] = await Promise.all([
    getTournament({ idOrSlug: slug }),
    listFeaturedTournaments({ limit: 24 }),
  ]);

  if (!detailRes.ok) notFound();
  const summary = summaryRes.ok ? summaryRes.data.find((t) => t.slug === slug) : undefined;

  // Detectar registration activa del user actual sobre este torneo.
  const sess = await getSession();
  const supabase = await getServerClient();
  let myRegistration: MyRegistration | null = null;
  if (sess.authenticated) {
    const { data: regRow } = await supabase
      .from("registrations")
      .select("id,status")
      .eq("tournament_id", detailRes.data.tournament.id)
      .contains("player_ids", [sess.session.userId])
      .not("status", "in", "(withdrawn,rejected,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (regRow) {
      myRegistration = {
        id: regRow.id as string,
        status: regRow.status as string,
      };
    }
  }

  // Lista de inscritos con perfiles resueltos en batch.
  const { data: regsRaw } = await supabase
    .from("registrations")
    .select("id,player_ids,created_at")
    .eq("tournament_id", detailRes.data.tournament.id)
    .not("status", "in", "(withdrawn,rejected,cancelled)")
    .order("created_at", { ascending: true })
    .limit(64);
  const allIds = new Set<string>();
  for (const r of regsRaw ?? []) {
    for (const p of (r.player_ids as string[] | null) ?? []) allIds.add(p);
  }
  const profById = new Map<string, { displayName: string; avatarUrl: string | null; city: string | null }>();
  if (allIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,city")
      .in("id", Array.from(allIds));
    for (const p of profs ?? []) {
      profById.set(p.id as string, {
        displayName: (p.display_name as string | null) ?? "Sin nombre",
        avatarUrl: (p.avatar_url as string | null) ?? null,
        city: (p.city as string | null) ?? null,
      });
    }
  }
  const inscritos: TournamentInscrito[] = (regsRaw ?? []).flatMap((r) =>
    ((r.player_ids as string[] | null) ?? []).map((pid) => {
      const p = profById.get(pid);
      return {
        userId: pid,
        displayName: p?.displayName ?? "Sin nombre",
        avatarUrl: p?.avatarUrl ?? null,
        city: p?.city ?? null,
        registeredAt: r.created_at as string,
      };
    }),
  );

  return (
    <TournamentDetailView
      detail={detailRes.data}
      clubName={summary?.clubName ?? null}
      clubCity={summary?.clubCity ?? null}
      myRegistration={myRegistration}
      inscritos={inscritos}
      meUserId={sess.authenticated ? sess.session.userId : null}
    />
  );
}
