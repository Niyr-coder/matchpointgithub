import { listCoaches } from "@/server/actions/coaches";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { CoachesPageView } from "@/components/landing/coaches/CoachesPageView";

export default async function CoachesPage() {
  const r = await listCoaches({ pageSize: 24 });
  const coaches = r.ok ? r.data : [];
  return (
    <PublicChrome>
      <CoachesPageView coaches={coaches} />
    </PublicChrome>
  );
}
