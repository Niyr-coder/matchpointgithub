export const dynamic = "force-dynamic";

import { getClubReviewStats, listFeaturedClubs } from "@/server/actions/clubs";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { ClubesPageView, type RatingInfo } from "@/components/landing/clubes/ClubesPageView";

export default async function ClubesPage() {
  const r = await listFeaturedClubs({ limit: 24 });
  const clubs = r.ok ? r.data : [];

  // Bulk stats reales en una sola RPC. Mismo patrón que el dashboard del user.
  const ratingByClubId: Record<string, RatingInfo> = {};
  if (clubs.length > 0) {
    const statsRes = await getClubReviewStats({ clubIds: clubs.map((c) => c.id) });
    if (statsRes.ok) {
      for (const [clubId, stats] of statsRes.data) {
        ratingByClubId[clubId] = {
          rating: stats.avgRating,
          reviews: stats.reviewsCount,
        };
      }
    }
  }

  return (
    <PublicChrome>
      <ClubesPageView clubs={clubs} ratingByClubId={ratingByClubId} />
    </PublicChrome>
  );
}
