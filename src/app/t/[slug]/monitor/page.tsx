import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMonitorContext } from "@/server/actions/tournament-monitors";
import { MonitorAppClient } from "@/components/tournaments/MonitorAppClient";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function MonitorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getSession();
  if (!session.authenticated) {
    redirect(`/login?next=/t/${slug}/monitor`);
  }

  const res = await getMonitorContext({ slug });

  if (!res.ok) {
    const code = res.error.code ?? "";
    const msgByCode: Record<string, string> = {
      "MONITORS.DISABLED": "Esta función no está disponible en este torneo.",
      "TOURNAMENTS.NOT_FOUND": "Torneo no encontrado.",
      "AUTH.ROLE_REQUIRED": res.error.message,
    };
    const msg = msgByCode[code] ?? res.error.message ?? "No tienes acceso a esta pantalla.";
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, textAlign: "center", maxWidth: 320 }}>
          {msg}
        </p>
      </div>
    );
  }

  return <MonitorAppClient context={res.data} slug={slug} />;
}
