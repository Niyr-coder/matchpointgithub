// Server: solo sesión + conv de URL. El inbox y el hilo cargan en cliente (más rápido).
import { getSession } from "@/lib/auth/session";
import { MensajesScreenView } from "./MensajesScreenView";

export type { ConvoLite } from "@/lib/messaging/convo-lite";

export async function MensajesScreen({
  searchParams,
}: {
  searchParams?: Promise<{ conv?: string }>;
} = {}) {
  const params = (await searchParams) ?? {};
  const session = await getSession();
  const meUserId = session.authenticated ? session.session.userId : null;

  const initialConvId =
    typeof params.conv === "string" && params.conv.length > 0 ? params.conv : null;

  return (
    <MensajesScreenView
      convos={[]}
      meUserId={meUserId}
      initialConvId={initialConvId}
      loadInboxOnClient
    />
  );
}
