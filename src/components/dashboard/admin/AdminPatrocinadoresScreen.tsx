import { listAdminSponsorsOverview } from "@/server/actions/admin/sponsors";
import { AdminPatrocinadoresScreenView } from "./AdminPatrocinadoresScreenView";

export async function AdminPatrocinadoresScreen() {
  const data = await listAdminSponsorsOverview();
  return <AdminPatrocinadoresScreenView data={data} />;
}
