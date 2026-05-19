// Vista pública lean del perfil de un jugador.
// Linkable desde /ranking, /amigos descubrir, search, etc.
//
// No editable — solo lectura. Si el viewer es el mismo user, lo redirige
// a /dashboard/user/perfil (que es la versión editable propia).
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { Icon } from "@/components/Icon";

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  city: string | null;
  avatar_url: string | null;
  preferred_sport: string | null;
  is_system: boolean | null;
};

type StatsRow = {
  sport: string;
  mode: string;
  current_rating: number;
  peak_rating: number;
  matches_total: number;
  wins: number;
};

type BadgeRow = {
  badge_kind: string;
  badges: { label: string; icon: string; description: string | null } | null;
};

export default async function PublicPlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (session.authenticated && session.session.userId === id) {
    redirect("/dashboard/user/perfil");
  }

  const supabase = await getServerClient();

  const [{ data: profileRaw }, { data: statsRaw }, { data: badgesRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,display_name,username,city,avatar_url,preferred_sport,is_system" as never)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("player_stats")
      .select("sport,mode,current_rating,peak_rating,matches_total,wins")
      .eq("user_id", id),
    supabase
      .from("player_badges" as never)
      .select("badge_kind,badges(label,icon,description)" as never)
      .eq("user_id" as never, id as never),
  ]);

  const profile = profileRaw as unknown as ProfileRow | null;
  if (!profile) notFound();
  if (profile.is_system) {
    // El perfil oficial MATCHPOINT no tiene página pública (no es jugador).
    notFound();
  }

  const stats = (statsRaw ?? []) as unknown as StatsRow[];
  const badges = (badgesRaw ?? []) as unknown as BadgeRow[];

  const displayName = profile.display_name ?? "Jugador";
  const sport = profile.preferred_sport ?? "pickleball";
  const mainStats = stats.filter((s) => s.sport === sport);
  const totalMatches = stats.reduce((acc, s) => acc + s.matches_total, 0);
  const totalWins = stats.reduce((acc, s) => acc + s.wins, 0);

  return (
    <>
      <div className="label-mp">Perfil público</div>
      <div
        className="card"
        style={{
          padding: 24,
          background: "#0a0a0a",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          border: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 85% 20%, rgba(16,185,129,0.22), transparent 55%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            gap: 18,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, #10b981, #047857)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 28,
              flexShrink: 0,
            }}
          >
            {initials(displayName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              className="font-heading"
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              {displayName}
              <span className="dot">.</span>
            </h1>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.6)",
                marginTop: 8,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {profile.username && (
                <span style={{ fontWeight: 700 }}>@{profile.username}</span>
              )}
              {profile.city && (
                <span>
                  <Icon name="map-pin" size={11} /> {profile.city}
                </span>
              )}
              <span>
                <Icon name="trophy" size={11} /> {SPORT_LABEL[sport] ?? sport}
              </span>
            </div>
          </div>
          <Link
            href="/dashboard/user/ranking"
            className="btn"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              padding: "8px 14px",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <Icon name="arrow-left" size={12} />
            Volver al ranking
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <StatCard
          label={`MP Rating · ${SPORT_LABEL[sport] ?? sport}`}
          value={
            mainStats.find((s) => s.mode === "singles")
              ? (mainStats.find((s) => s.mode === "singles")!.current_rating / 1000).toFixed(2)
              : "—"
          }
          hint="Singles"
        />
        <StatCard
          label="Partidos totales"
          value={String(totalMatches)}
          hint={`${totalWins} victorias`}
        />
        <StatCard
          label="Insignias"
          value={String(badges.length)}
          hint={badges.length === 1 ? "logro desbloqueado" : "logros desbloqueados"}
        />
      </div>

      {badges.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Insignias</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            {badges.map((b) => {
              const def = b.badges;
              if (!def) return null;
              return (
                <div
                  key={b.badge_kind}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "#f0fdf4",
                    color: "var(--primary)",
                    border: "1px solid rgba(16,185,129,0.3)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    textAlign: "center",
                  }}
                  title={def.description ?? def.label}
                >
                  <Icon name={def.icon} size={20} />
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {def.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-mp">{label}</div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginTop: 8,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}
