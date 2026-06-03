import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";

/** Publica un aviso de sistema en el chat grupal de la quedada (Mensajes). No lanza. */
export async function postQuedadaChannelMessage(
  quedadaId: string,
  body: string,
  payload: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const admin = getAdminClient();
    const { data, error } = await (admin as any).rpc("fn_post_quedada_channel_message", {
      p_quedada_id: quedadaId,
      p_body: body,
      p_payload: payload as never,
    });
    if (error) {
      console.error("[postQuedadaChannelMessage]", error.message, { quedadaId });
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error("[postQuedadaChannelMessage] unexpected", { quedadaId, e });
    return null;
  }
}
