import { notFound } from "next/navigation";
import { AdminApplicationDetail } from "@/components/dashboard/admin/AdminApplicationDetail";
import { AdminEventDetail } from "@/components/dashboard/admin/AdminEventDetail";
import { ClubGiveawayOrgScreen } from "@/components/dashboard/club/ClubGiveawayOrgScreen";

export const dynamic = "force-dynamic";

const ORG_ROLES = new Set(["owner", "manager"]);

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
    return <AdminEventDetail id={id} />;
  }
  if (ORG_ROLES.has(role) && section === "club-sorteos") {
    return <ClubGiveawayOrgScreen roleSegment={role as "owner" | "manager"} giveawayId={id} />;
  }

  notFound();
}
