import { notFound } from "next/navigation";
import { AdminApplicationDetail } from "@/components/dashboard/admin/AdminApplicationDetail";
import { AdminEventDetail } from "@/components/dashboard/admin/AdminEventDetail";

export default async function RoleSectionDetailPage({
  params,
}: {
  params: Promise<{ role: string; section: string; id: string }>;
}) {
  const { role, section, id } = await params;
  if (role === "admin" && section === "admin-clubs") {
    return <AdminApplicationDetail applicationId={id} />;
  }
  if (role === "admin" && section === "admin-events") {
    // El id viene prefijado: "ev-{uuid}" para evento, "tr-{uuid}" para torneo.
    // Esto se decide en AdminEventsScreen al armar los rows.
    return <AdminEventDetail id={id} />;
  }
  notFound();
}
