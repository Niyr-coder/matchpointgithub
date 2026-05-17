import { notFound } from "next/navigation";
import { getClub, listClubReviews, listFeaturedClubs } from "@/server/actions/clubs";
import { getSession } from "@/lib/auth/session";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { ClubDetailView } from "@/components/landing/clubes/ClubDetailView";

export const dynamic = "force-dynamic";

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [detailRes, summaryRes, session] = await Promise.all([
    getClub({ idOrSlug: slug }),
    listFeaturedClubs({ limit: 24 }),
    getSession(),
  ]);
  if (!detailRes.ok) notFound();
  const summary = summaryRes.ok ? summaryRes.data.find((c) => c.slug === slug) : undefined;
  const meUserId = session.authenticated ? session.session.userId : null;

  // Reseñas reales + detectar si el user actual ya dejó una.
  const reviewsRes = await listClubReviews({
    clubId: detailRes.data.club.id,
    limit: 20,
  });
  const reviews = reviewsRes.ok ? reviewsRes.data : [];
  const reviewsCount = reviews.length;
  const ratingAvg =
    reviewsCount > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewsCount) * 10) / 10
      : 0;
  const myReview = meUserId ? reviews.find((r) => r.userId === meUserId) ?? null : null;

  const stats = {
    courtsCount: summary?.courtsCount ?? 0,
    minPriceCents: summary?.minPriceCents ?? null,
    rating: ratingAvg,
    reviews: reviewsCount,
  };
  return (
    <PublicChrome>
      <ClubDetailView
        detail={detailRes.data}
        stats={stats}
        reviews={reviews}
        myReview={myReview}
        canReview={!!meUserId}
      />
    </PublicChrome>
  );
}
