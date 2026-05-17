export const dynamic = "force-dynamic";

import { listFeaturedClubs } from "@/server/actions/clubs";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { ClubesPageView } from "@/components/landing/clubes/ClubesPageView";

export default async function ClubesPage() {
  const r = await listFeaturedClubs({ limit: 24 });
  const clubs = r.ok ? r.data : [];
  return (
    <PublicChrome>
      <ClubesPageView clubs={clubs} />
    </PublicChrome>
  );
}
