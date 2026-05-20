// Página pública del link de inscripción de una Quedada.
// Reemplaza el "texto de WhatsApp": alguien abre /q/<invite_code> →
//   - si tiene sesión: ejecuta joinByInviteCode y redirige según el resultado
//     (cuota → /pagos/<txId> para subir comprobante; sin cuota →
//      /dashboard/user/quedadas?focus=<quedadaId>).
//   - si NO tiene sesión: muestra una landing mínima con un AuthModal abierto
//     y next=/q/<code> para que, al volver autenticado, ejecute el join.
//
// El join real lo hace JoinByCodeClient (client) al montar, porque
// joinByInviteCode necesita correr desde un boundary client para poder
// redirigir client-side según el ActionResult.
import { getSession } from "@/lib/auth/session";
import { Icon } from "@/components/Icon";
import { JoinByCodeClient, AuthGate } from "./JoinByCodeClient";

export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getSession();

  // Sesión activa → el client ejecuta el join al montar y redirige.
  if (session.authenticated) {
    return <JoinByCodeClient code={code} />;
  }

  // Sin sesión → landing mínima on-brand + AuthModal abierto (signup por
  // defecto). Al completar login/signup, AuthModal navega a next=/q/<code>,
  // que vuelve a esta misma página ya autenticada y dispara el join.
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
          Te invitaron a una quedada
        </h1>

        <p style={{ fontSize: 14, color: "var(--muted-fg)", margin: 0 }}>
          Crea tu cuenta o inicia sesión para unirte. Es gratis y te toma menos
          de un minuto.
        </p>
      </div>

      {/* AuthModal abierto sobre la landing. Al autenticar navega a
          next=/q/<code> y vuelve aquí ya con sesión para disparar el join. */}
      <AuthGate code={code} />
    </main>
  );
}
