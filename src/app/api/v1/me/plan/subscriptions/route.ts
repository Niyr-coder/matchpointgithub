// GET /api/v1/me/plan/subscriptions — historial de suscripciones del user actual
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const sess = await getSession();
  if (!sess.authenticated) {
    return httpFail(401, "AUTH.UNAUTHENTICATED", "Inicia sesión");
  }
  const userId = sess.session.userId;
  const supabase = await getServerClient();

  // RLS filtra por auth.uid(), pero filtramos también explícitamente por
  // seguridad en profundidad.
  const { data, error } = await supabase
    .from("player_subscriptions")
    .select(
      "id,tier,status,starts_at,expires_at,duration_months,transaction_id,created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return httpFail(500, "PLAN.SUBS_LIST_FAILED", error.message);
  }

  const items = (data ?? []).map((row) => ({
    id: row.id as string,
    tier: row.tier as string,
    status: row.status as string,
    startsAt: (row.starts_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    durationMonths: row.duration_months as number,
    transactionId: (row.transaction_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  return httpOk(items);
}
