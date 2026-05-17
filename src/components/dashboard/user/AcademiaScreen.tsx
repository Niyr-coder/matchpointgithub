// Server: fetch coach_profiles + classes (con coach + club).
import { getServerClient } from "@/lib/db/client.server";
import { listCoaches } from "@/server/actions/coaches";
import { AcademiaScreenView, type AcademiaClass, type AcademiaCoach } from "./AcademiaScreenView";

const FALLBACK_RATING = 2500;

function sportLabel(s: string | null | undefined): string {
  if (s === "tennis") return "Tenis";
  if (s === "padel") return "Pádel";
  return "Pickleball";
}

function levelFromRating(elo: number | null | undefined): number {
  return Math.round(((elo ?? FALLBACK_RATING) / 1000) * 10) / 10;
}

async function loadData() {
  const supabase = await getServerClient();

  // Coaches (reusa la action pública).
  const coachesRes = await listCoaches({ pageSize: 24 });
  const coaches: AcademiaCoach[] = coachesRes.ok
    ? coachesRes.data.map((c) => ({
        id: c.id,
        name: c.displayName,
        sport: "Pickleball", // default — specialties[0] requeriría detail call
        level: levelFromRating(c.hourlyRateCents ? null : null) || 4.0,
        rating: c.ratingAvg ?? 4.5,
        reviews: c.ratingCount,
        students: 0, // requeriría count de class_enrollments — futuro
        hour: c.hourlyRateCents != null ? Math.round(c.hourlyRateCents / 100) : 40,
        group: c.hourlyRateCents != null ? Math.round((c.hourlyRateCents * 0.45) / 100) : 18,
        verified: c.verifiedAt != null,
        cert: c.verifiedAt != null ? "Verificado" : "Coach activo",
        club: c.city ?? "—",
        bio: c.headline ?? "Coach en la red MatchPoint.",
      }))
    : [];

  // Clases abiertas (activas, joined).
  const { data: classRows } = await supabase
    .from("classes")
    .select("id,name,description,kind,sport,skill_level,max_students,price_cents,currency,coach_id,club_id,clubs(name),coach_profiles(id,profiles(display_name))")
    .eq("active", true)
    .limit(24);

  // Enrollment counts en batch.
  const classIds = (classRows ?? []).map((c) => c.id as string);
  const { data: enrollments } =
    classIds.length > 0
      ? await supabase
          .from("class_enrollments")
          .select("class_id")
          .in("class_id", classIds)
          .eq("status", "enrolled")
      : { data: [] };
  const enrolledMap = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const k = e.class_id as string;
    enrolledMap.set(k, (enrolledMap.get(k) ?? 0) + 1);
  }

  const classes: AcademiaClass[] = (classRows ?? []).map((c) => {
    const club = c.clubs as { name?: string } | null;
    const coachProfile = c.coach_profiles as { profiles?: { display_name?: string } } | null;
    const coachName = coachProfile?.profiles?.display_name ?? "Coach";
    const enrolled = enrolledMap.get(c.id as string) ?? 0;
    const cap = (c.max_students as number) ?? 8;
    return {
      id: c.id as string,
      name: c.name as string,
      coachName,
      coachId: c.coach_id as string,
      sport: sportLabel(c.sport as string),
      kind: c.kind as string,
      skillLevel: (c.skill_level as string | null) ?? null,
      enrolled,
      cap,
      full: enrolled >= cap,
      priceCents: (c.price_cents as number) ?? 0,
      club: club?.name ?? "—",
    };
  });

  return { coaches, classes };
}

export async function AcademiaScreen() {
  const data = await loadData();
  return <AcademiaScreenView {...data} />;
}
