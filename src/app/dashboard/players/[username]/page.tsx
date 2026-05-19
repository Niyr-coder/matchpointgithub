// Vista del perfil de un jugador. Routing por rol del viewer:
// - user (default, social) → ProfileScreenView con viewerMode="public"
//   (la "VISTA PÚBLICA" que se previewa en Mi Perfil).
// - admin / owner / manager / partner / coach / employee →
//   OperationalPlayerProfile (data-dense, sin badge social, acciones
//   específicas del rol).
// - is_system (MATCHPOINT) → OfficialAccountView compacta (no es jugador).
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import type { RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { ProfileScreenView } from "@/components/dashboard/user/ProfileScreenView";
import { loadProfileFor } from "@/components/dashboard/user/ProfileScreen";
import { OperationalPlayerProfile } from "@/components/dashboard/players/OperationalPlayerProfile";

export default async function PublicPlayerProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const supabase = await getServerClient();
  const { data: meta } = await supabase
    .from("profiles")
    .select("id,display_name,username,bio,is_system" as never)
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

  const data = await loadProfileFor(profile.id);

  // Active role del viewer decide la vista. user = social, otros = operacional.
  // Si no hay activeRole (guest o cookie ausente), tratar como user.
  const activeRole: RoleKey =
    (session.authenticated && session.session.activeRole) || "user";
  if (activeRole === "user") {
    return <ProfileScreenView data={data} viewerMode="public" />;
  }
  return <OperationalPlayerProfile data={data} viewerRole={activeRole} />;
}

function OfficialAccountView({
  profile,
}: {
  profile: {
    display_name?: string | null;
    username?: string | null;
    bio?: string | null;
  };
}) {
  const name = profile.display_name ?? "Cuenta oficial";
  const handle = profile.username ?? "matchpoint";
  const bio =
    profile.bio ??
    "Cuenta oficial de MatchPoint EC. Te enviamos novedades, recordatorios y respuestas de soporte por aquí. Si tienes dudas, escríbenos por chat — un humano del equipo te responde.";

  return (
    <>
      <div className="label-mp">Cuenta oficial · MatchPoint EC</div>

      <div
        className="card"
        style={{
          padding: 28,
          background: "linear-gradient(135deg, #064e3b 0%, #0a0a0a 60%, #000 100%)",
          color: "#fff",
          border: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.28), transparent 55%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          {/* Símbolo oficial del logo: dot verde sobre fondo negro
              (misma marca que Nav.tsx / DashboardSidebar.tsx). */}
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "#0a0a0a",
              border: "3px solid rgba(255,255,255,0.12)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              className="dot"
              style={{ fontSize: 42, lineHeight: 1 }}
              aria-label="Logo MatchPoint"
            >
              ●
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="font-heading"
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {name}
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
                }}
              >
                <Icon name="check" size={13} color="#fff" />
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.65)",
                marginTop: 6,
              }}
            >
              @{handle} · Cuenta oficial
            </div>
          </div>
          <Link
            href="/dashboard/user/chat"
            className="btn"
            style={{
              background: "var(--primary)",
              color: "#fff",
              padding: "10px 18px",
              border: 0,
            }}
          >
            <Icon name="message-circle" size={13} />
            Ir al chat
          </Link>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="label-mp">Acerca de</div>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--fg)",
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {bio}
        </p>
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 10,
            background: "var(--muted)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            fontSize: 12,
            color: "var(--muted-fg)",
          }}
        >
          <Icon name="info" size={13} color="var(--muted-fg)" />
          Este perfil solo envía notificaciones oficiales. No puedes responder
          ni jugar contra él — pero podés escribir al equipo desde el chat.
        </div>
      </div>
    </>
  );
}
