import { listAdminPartnersOverview } from "@/server/actions/admin/partners";
import { AdminPartnersScreenView } from "./AdminPartnersScreenView";

export async function AdminPartnersScreen() {
  const data = await listAdminPartnersOverview();
  return <AdminPartnersScreenView data={data} />;
}
