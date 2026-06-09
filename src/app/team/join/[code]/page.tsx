import { getSession } from "@/lib/auth/session";
import { Icon } from "@/components/Icon";
import { JoinTeamByCodeClient, TeamAuthGate } from "./JoinTeamByCodeClient";

export default async function TeamJoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getSession();

  if (session.authenticated) {
    return <JoinTeamByCodeClient code={code} />;
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg, #f7f7f5)",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 32,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 200%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="users" size={22} color="#fff" />
        </div>

        <div className="label-mp" style={{ color: "var(--muted-fg)" }}>
          ● MATCHPOINT
        </div>

        <h1
          className="font-heading"
          style={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Te invitaron a un team
        </h1>

        <p style={{ fontSize: 14, color: "var(--muted-fg)", margin: 0 }}>
          Crea tu cuenta o inicia sesión para unirte. Es gratis y te toma menos de un minuto.
        </p>
      </div>

      <TeamAuthGate code={code} />
    </main>
  );
}
