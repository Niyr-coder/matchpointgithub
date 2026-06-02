import { listAdminHelpOverview } from "@/server/actions/admin/help";
import { AdminAyudaGuiasScreenView } from "./AdminAyudaGuiasScreenView";

export async function AdminAyudaGuiasScreen() {
  const data = await listAdminHelpOverview();
  return <AdminAyudaGuiasScreenView data={data} />;
}
