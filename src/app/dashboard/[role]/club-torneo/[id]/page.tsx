import { notFound } from "next/navigation";
import PartnerTorneoPage from "../../../partner/torneo/[id]/page";

type Props = {
  params: Promise<{ role: string; id: string }>;
};

/** Gestión de torneo del club — owner/manager (reutiliza paneles partner). */
export default async function ClubTorneoGestionPage({ params }: Props) {
  const { role, id } = await params;
  if (role !== "owner" && role !== "manager") notFound();
  return PartnerTorneoPage({ params: Promise.resolve({ id }) });
}
