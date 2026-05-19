// Server component: fetch clubs reales + ciudad del usuario, pasa a ClubesScreenClient.
import { getClubReviewStats, listFeaturedClubs } from "@/server/actions/clubs";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { ClubesScreenClient, type RatingInfo } from "./ClubesScreenClient";

async function fetchMyCity(): Promise<string | null> {
  // El layout del dashboard ya pidió getProfileSummary; reusamos su cache en
  // lugar de hacer una query separada a profiles.
  const session = await getSession();
  if (!session.authenticated) return null;
  const profile = await getProfileSummary(session.session.userId);
  return profile.city;
}

export async function ClubesScreen() {
  const [clubsRes, meCity] = await Promise.all([
    listFeaturedClubs({ limit: 24 }),
    fetchMyCity(),
  ]);
  const clubs = clubsRes.ok ? clubsRes.data : [];

  // Bulk stats: 1 RPC para todos los clubes visibles.
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

  return <ClubesScreenClient clubs={clubs} meCity={meCity} ratingByClubId={ratingByClubId} />;
}
