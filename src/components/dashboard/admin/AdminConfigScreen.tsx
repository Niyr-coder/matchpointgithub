// Server: config global de la plataforma. Sin tabla `platform_settings` aún,
// se muestran constantes del app + counts derivados de DB. Filas no modeladas
// quedan en `—` hasta que existan.
import { getServerClient } from "@/lib/db/client.server";
import { AdminConfigScreenView, type ConfigData } from "./AdminConfigScreenView";

async function loadData(): Promise<ConfigData> {
  const supabase = await getServerClient();

  const { count: adminCount } = await supabase
    .from("role_assignments")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin")
    .is("revoked_at", null);

  return { adminCount: adminCount ?? 0 };
}

export async function AdminConfigScreen() {
  const data = await loadData();
  return <AdminConfigScreenView data={data} />;
}
