// Server: perfil público del coach (coach_profiles + profiles + specialties + certs + reviews + clubes).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import {
  CoachProfileScreenView,
  type CoachProfileData,
  type Specialty,
  type ScheduleRow,
  type ReviewRow,
} from "./CoachProfileScreenView";

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "hoy";
  if (diffDays < 7) return `hace ${diffDays} d`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 4) return `hace ${weeks} sem`;
  const months = Math.floor(diffDays / 30);
  return `hace ${months} m`;
}

async function loadData(): Promise<CoachProfileData> {
  const session = await getSession();

  if (!session.authenticated) {
    return {
      coachId: null,
      name: "—",
      handle: "—",
      sport: "—",
      city: "—",
      primaryClubName: null,
      bio: null,
      certifications: [],
      hourlyRateCents: null,
      rating: null,
      reviewCount: 0,
      studentsActive: 0,
      classesGiven: 0,
      hasCoachProfile: false,
      specialties: [],
      schedule: [],
      reviews: [],
    };
  }

  const coachId = session.session.userId;
  const supabase = await getServerClient();
  const now = new Date();

  const [
    { data: profile },
    { data: coachProfile },
    { data: specialties },
    { data: certs },
    { data: availability },
    { data: reviewsRows },
    { data: coachClubsRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,username,city,bio")
      .eq("id", coachId)
      .maybeSingle(),
    supabase
      .from("coach_profiles")
      .select("bio,headline,hourly_rate_cents,rating_avg,rating_count,years_experience")
      .eq("id", coachId)
      .maybeSingle(),
    supabase
      .from("coach_specialties")
      .select("specialty,proficiency,sport")
      .eq("coach_id", coachId),
    supabase
      .from("coach_certifications")
      .select("name,issuer,issued_year")
      .eq("coach_id", coachId)
      .order("issued_year", { ascending: false }),
    supabase
      .from("coach_availability")
      .select("day_of_week,starts_at,ends_at")
      .eq("coach_id", coachId)
      .order("day_of_week"),
    supabase
      .from("coach_reviews")
      .select("id,rating,comment,created_at,reviewer_id")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("coach_clubs")
      .select("club_id,active,clubs(name,city)")
      .eq("coach_id", coachId)
      .eq("active", true),
  ]);

  // Class count + active students
  const { data: myClasses } = await supabase
    .from("classes")
    .select("id")
    .eq("coach_id", coachId);
  const classIds = (myClasses ?? []).map((c) => c.id as string);

  const [{ count: sessionsCount }, { count: lessonsCount }, { data: enrollments }, { data: recentLessons }] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("class_sessions")
          .select("id", { count: "exact", head: true })
          .in("class_id", classIds)
          .eq("status", "completed")
      : Promise.resolve({ count: 0 }),
    supabase
      .from("lessons_1on1")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("status", "completed"),
    classIds.length > 0
      ? supabase
          .from("class_enrollments")
          .select("student_id")
          .in("class_id", classIds)
          .eq("status", "enrolled")
      : Promise.resolve({ data: [] as { student_id: string }[] }),
    (() => {
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return supabase
        .from("lessons_1on1")
        .select("student_id")
        .eq("coach_id", coachId)
        .gte("created_at", ninetyDaysAgo.toISOString());
    })(),
  ]);

  const studentsActiveSet = new Set<string>();
  for (const e of enrollments ?? []) studentsActiveSet.add(e.student_id as string);
  for (const l of recentLessons ?? []) studentsActiveSet.add(l.student_id as string);

  // Reviewer names
  const reviewerIds = Array.from(new Set((reviewsRows ?? []).map((r) => r.reviewer_id as string)));
  const { data: reviewerProfiles } = reviewerIds.length > 0
    ? await supabase.from("profiles").select("id,display_name").in("id", reviewerIds)
    : { data: [] as { id: string; display_name: string }[] };
  const reviewerName = new Map<string, string>();
  for (const p of reviewerProfiles ?? []) reviewerName.set(p.id as string, (p.display_name as string) ?? "Alumno");

  const specialtiesOut: Specialty[] = (specialties ?? []).map((s) => ({
    label: s.specialty as string,
    proficiency: Math.max(0, Math.min(100, ((s.proficiency as number) ?? 0) * 20)), // 1..5 → 20..100
  }));

  // Build schedule por día (agrupado)
  const slotsByDay = new Map<number, { from: string; to: string }[]>();
  for (const a of availability ?? []) {
    const d = a.day_of_week as number;
    const list = slotsByDay.get(d) ?? [];
    list.push({
      from: (a.starts_at as string).slice(0, 5),
      to: (a.ends_at as string).slice(0, 5),
    });
    slotsByDay.set(d, list);
  }
  const schedule: ScheduleRow[] = [];
  for (let d = 1; d <= 7; d++) {
    // Convertimos: en SQL day_of_week 0=Dom...6=Sáb. Mostrar Lun..Dom.
    const dbIdx = d === 7 ? 0 : d; // map 1=Lun→1, 7=Dom→0
    const slots = slotsByDay.get(dbIdx);
    if (!slots || slots.length === 0) {
      schedule.push({
        day: DAY_NAMES[d - 1],
        hours: "—",
        avail: "closed",
      });
    } else {
      schedule.push({
        day: DAY_NAMES[d - 1],
        hours: slots.map((s) => `${s.from} – ${s.to}`).join(" · "),
        avail: "open",
      });
    }
  }

  const reviews: ReviewRow[] = (reviewsRows ?? []).map((r) => ({
    id: r.id as string,
    name: reviewerName.get(r.reviewer_id as string) ?? "Alumno",
    comment: (r.comment as string | null) ?? "—",
    rating: (r.rating as number) ?? 5,
    when: relativeTime(r.created_at as string, now),
  }));

  const certifications = (certs ?? []).map((c) => (c.name as string));

  // Primary club
  const cClubs = (coachClubsRows ?? []) as { club_id: string; active: boolean; clubs: { name?: string; city?: string } | null }[];
  const primary = cClubs[0] ?? null;

  return {
    coachId,
    name: (profile?.display_name as string | undefined) ?? "Coach",
    handle: `@${(profile?.username as string | undefined) ?? "coach"}`,
    sport: "Pickleball",
    city: (profile?.city as string | undefined) ?? "—",
    primaryClubName: primary?.clubs?.name ?? null,
    bio:
      (coachProfile?.bio as string | undefined) ??
      (coachProfile?.headline as string | undefined) ??
      (profile?.bio as string | undefined) ??
      null,
    certifications,
    hourlyRateCents: (coachProfile?.hourly_rate_cents as number | null) ?? null,
    rating: (coachProfile?.rating_avg as number | null) ?? null,
    reviewCount: (coachProfile?.rating_count as number | null) ?? 0,
    studentsActive: studentsActiveSet.size,
    classesGiven: (sessionsCount ?? 0) + (lessonsCount ?? 0),
    hasCoachProfile: !!coachProfile,
    specialties: specialtiesOut,
    schedule,
    reviews,
  };
}

export async function CoachProfileScreen() {
  const data = await loadData();
  return <CoachProfileScreenView data={data} />;
}
