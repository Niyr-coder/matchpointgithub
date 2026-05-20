// Vista pública del perfil de un jugador.
// Ruta canónica: /dashboard/[role]/players/[username]. Los links apuntan
// a /dashboard/user/players/<x> (URL user-centric); el [role] dinámico
// permite que el page herede el chrome (sidebar + topbar) del
// [role]/layout.tsx. Sin esto, un path static (ej. /dashboard/user/...)
// salta el layout dinámico y se renderiza sin sidebar.
//
// Todos los viewers ven la misma vista pública social —
// ProfileScreenView con viewerMode="public", la interfaz "VISTA PÚBLICA".
// Cuentas oficiales (is_system) tienen OfficialAccountView dedicada.
//
// Match history cap por plan del VIEWER (regla MP+):
//   - self (viewer === target)  → unlimited
//   - viewer.premium activo     → unlimited (beneficio MP+)
//   - viewer.free               → últimos 10 partidos
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import { Icon } from "@/components/Icon";
import { ProfileScreenView } from "@/components/dashboard/user/ProfileScreenView";
import { loadProfileFor } from "@/components/dashboard/user/ProfileScreen";

export default async function PublicPlayerProfilePage({
  params,
}: {
  params: Promise<{ role: string; username: string }>;
}) {
  const { username } = await params;

  const supabase = await getServerClient();
  const { data: meta } = await supabase
    .from("profiles")
    .select("id,display_name,username,bio,is_system")
    .ilike("username", username)
    .maybeSingle();
  const profile = meta as {
    id?: string;
    display_name?: string | null;
    username?: string | null;
    bio?: string | null;
    is_system?: boolean;
  } | null;
  if (!profile?.id) notFound();

  // Si el viewer es el dueño del perfil, lo mandamos a la versión editable.
  const session = await getSession();
  if (session.authenticated && session.session.userId === profile.id) {
    redirect("/dashboard/user/perfil");
  }

  // Cuenta oficial: vista compacta. No reusa ProfileScreenView porque MATCHPOINT
  // no es un jugador (sin stats, sin clubes, sin ranking).
  if (profile.is_system) {
    return <OfficialAccountView profile={profile} />;
  }

  // Cap del match history según plan del viewer. Free: últimos 10.
  // Premium: ilimitado. Guest sin sesión: cap conservador de 10.
  let viewerIsPremium = false;
  let initialFriendship: "none" | "pending" | "friends" = "none";
  if (session.authenticated) {
    const viewerSummary = await getProfileSummary(session.session.userId);
    viewerIsPremium = isPlanActive(viewerSummary).tier === "premium";

    // Estado inicial de amistad viewer ↔ target, leído del server para
    // que la UI arranque con el CTA correcto (no flash optimista).
    const viewerId = session.session.userId;
    const [a, b] = viewerId < profile.id ? [viewerId, profile.id] : [profile.id, viewerId];
    const { data: friendship } = await supabase
      .from("friendships")
      .select("user_a")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (friendship) {
      initialFriendship = "friends";
    } else {
      const { data: pending } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("from_user_id", viewerId)
        .eq("to_user_id", profile.id)
        .eq("status", "pending")
        .maybeSingle();
      if (pending) initialFriendship = "pending";
    }
  }
  const matchHistoryCap = viewerIsPremium ? null : 10;

  const data = await loadProfileFor(profile.id, { matchHistoryCap });

  return (
    <ProfileScreenView
      data={data}
      viewerMode="public"
      viewerIsPremium={viewerIsPremium}
      initialFriendship={initialFriendship}
    />
  );
}

// OfficialAccountView usa el MISMO shell del JSX de ProfileScreen
// (banner 140px + avatar 112x112 con margin -52 + name + meta + bio + CTA)
// para mantener consistencia visual. La sustancia es la mínima de un bot:
// sin stats, sin tabs (no es jugador).
function OfficialAccountView({
  profile,
}: {
  profile: {
    display_name?: string | null;
    username?: string | null;
    bio?: string | null;
  };
}) {
  const name = profile.display_name ?? "MATCHPOINT";
  const handle = profile.username ?? "matchpoint";
  const bio =
    profile.bio ??
    "Cuenta oficial de MatchPoint EC. Te enviamos novedades, recordatorios y respuestas de soporte por aquí. Si tienes dudas, escríbenos por chat — un humano del equipo te responde.";

  return (
    <>
      {/* Hero card — mismo shell que ProfileScreenView (140px banner +
          avatar 112×112 con margin negativo). Avatar usa el símbolo
          oficial (dot verde en círculo negro) en vez de iniciales.
          Verified badge inline en lugar del chip-green "Nivel X". */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            height: 140,
            background:
              "linear-gradient(135deg, #064e3b 0%, #0a0a0a 50%, #000 100%)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 75% 30%, rgba(16,185,129,0.3), transparent 60%)",
            }}
          />
        </div>
        <div
          style={{
            padding: "0 28px 24px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
            <div style={{ position: "relative", marginTop: -52 }}>
              <div
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: "50%",
                  background: "#0a0a0a",
                  border: "5px solid #fff",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className="dot"
                  style={{ fontSize: 52, lineHeight: 1 }}
                  aria-label="Logo MatchPoint"
                >
                  ●
                </span>
              </div>
            </div>
            <div style={{ paddingBottom: 8, paddingTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div
                  className="font-heading"
                  style={{
                    fontWeight: 900,
                    fontSize: 32,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  {name}
                  <span className="dot">.</span>
                </div>
                <span
                  title="Cuenta oficial de la app"
                  aria-label="Cuenta oficial de la app"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--primary)",
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="check" size={13} color="#fff" />
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--muted-fg)",
                  marginTop: 6,
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="at-sign" size={12} />
                  {handle}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="shield-check" size={12} />
                  Cuenta oficial
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="building-2" size={12} />
                  MatchPoint EC
                </span>
              </div>
              <p
                style={{
                  marginTop: 12,
                  fontSize: 13.5,
                  color: "#404040",
                  maxWidth: 540,
                  lineHeight: 1.5,
                }}
              >
                {bio}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 8 }}>
            <Link href="/dashboard/user/chat" className="btn btn-primary">
              <Icon name="message-square" size={12} />
              Ir al chat
            </Link>
          </div>
        </div>
      </div>

      {/* Hint informativo. No stats strip ni tabs porque MATCHPOINT no
          es jugador (sin partidos, sin insignias, sin clubes propios). */}
      <div
        className="card"
        style={{
          padding: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Icon name="info" size={14} color="var(--muted-fg)" />
        <div style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Este perfil solo envía notificaciones oficiales. No puedes responder
          ni jugar contra él — pero puedes escribir al equipo desde el chat.
        </div>
      </div>
    </>
  );
}
