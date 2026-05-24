// Dispatch server-side: si el user ya tiene MP+ activo → MpPlusManageScreen
// (gestión del plan). Si no → MpPlusSalesView (landing de ventas). El route
// `/dashboard/user/mp-plus` apunta acá; ambos paths reusan la misma URL.
import { getServerClient } from "@/lib/db/client.server";
import { MpPlusManageScreen } from "./MpPlusManageScreen";
import { MpPlusSalesView } from "./MpPlusSalesView";

export async function MatchPointPlusScreen() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <MpPlusSalesView />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_tier,plan_expires_at")
    .eq("id", user.id)
    .maybeSingle();

  const tier = (profile?.plan_tier as string | null) ?? "free";
  const expiresAt = profile?.plan_expires_at as string | null;
  const planActive =
    tier === "premium" && (!expiresAt || new Date(expiresAt).getTime() > Date.now());

  if (planActive) return <MpPlusManageScreen />;
  return <MpPlusSalesView />;
}
