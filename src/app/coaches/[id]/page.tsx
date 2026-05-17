import { notFound } from "next/navigation";
import { getCoach } from "@/server/actions/coaches";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { CoachDetailView } from "@/components/landing/coaches/CoachDetailView";

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getCoach({ id });
  if (!r.ok) notFound();
  return (
    <PublicChrome>
      <CoachDetailView detail={r.data} />
    </PublicChrome>
  );
}
