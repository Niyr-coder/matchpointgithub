import { notFound } from "next/navigation";
import { ClubGiveawayOrgScreen } from "@/components/dashboard/club/ClubGiveawayOrgScreen";

const ORG_ROLES = new Set(["owner", "manager"]);
const SUBVIEWS = new Set(["publicado", "sortear", "ganador"]);

export default async function ClubGiveawayOrgSubviewPage({
  params,
}: {
  params: Promise<{ role: string; section: string; id: string; subview: string }>;
}) {
  const { role, section, id, subview } = await params;
  if (!ORG_ROLES.has(role) || section !== "club-sorteos" || !SUBVIEWS.has(subview)) notFound();
  return (
    <ClubGiveawayOrgScreen
      roleSegment={role as "owner" | "manager"}
      giveawayId={id}
      subview={subview as "publicado" | "sortear" | "ganador"}
    />
  );
}
