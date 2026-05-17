// Server: lee getMyApplication + detail (con courts) y enruta vista por status.
import {
  createApplication,
  getApplicationDetail,
  getMyApplication,
} from "@/server/actions/clubApplications";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import {
  SolicitarClubScreenView,
  type AppStatus,
  type ApplicationReviewState,
  type ApprovedClubSummary,
  type ClubOnboardingChecklist,
  type InitialDraft,
} from "./SolicitarClubScreenView";

export async function SolicitarClubScreen() {
  const myAppRes = await getMyApplication();
  let application = myAppRes.ok ? myAppRes.data : null;

  // Si no hay application, creamos un draft en blanco — así el wizard ya tiene
  // applicationId y puede persistir cada cambio.
  if (!application) {
    const created = await createApplication();
    if (created.ok) application = created.data;
  }

  let initial: InitialDraft | null = null;
  let status: AppStatus = "none";
  let review: ApplicationReviewState | null = null;

  if (application) {
    status = application.status as AppStatus;
    // Snapshot del estado de revisión — alimenta SubmittedView / RejectedView
    // con timeline real, notas del revisor y motivo de rechazo.
    review = {
      applicationCode: application.code,
      status: application.status as AppStatus,
      submittedAt: application.submittedAt,
      reviewStartedAt: application.reviewStartedAt,
      approvedAt: application.approvedAt,
      rejectedAt: application.rejectedAt,
      rejectionReason: application.rejectionReason,
      reviewerNotes: application.reviewerNotes,
      contactPhone: application.contactPhone ?? null,
    };
    const detail = await getApplicationDetail({ applicationId: application.id });
    if (detail.ok) {
      const a = detail.data.application;
      initial = {
        applicationId: a.id,
        name: a.name ?? "",
        sports: a.sports ?? [],
        description: a.shortDescription ?? "",
        accentColor: "#10b981",
        city: a.district ?? "",
        province: a.province ?? "",
        country: a.country ?? "Ecuador",
        address: a.address ?? "",
        referenceNote: a.referenceNote ?? "",
        legalName: a.legalName ?? "",
        taxId: a.taxId ?? "",
        foundedYear: a.foundedYear ?? null,
        contactPerson: a.contactPerson ?? "",
        contactEmail: a.contactEmail ?? "",
        contactPhone: a.contactPhone ?? "",
        websiteOrSocial: a.websiteOrSocial ?? "",
        courts: detail.data.courts.map((c) => ({
          id: c.id,
          name: c.proposedCode,
          surf: [c.indoor ? "Indoor" : "Outdoor", c.surface ?? "—"].filter(Boolean).join(" · "),
          hours: [c.openTime, c.closeTime].filter(Boolean).join(" – ") || "06:00 – 22:00",
          price: c.basePriceCents != null ? Math.round(c.basePriceCents / 100) : 14,
          lights: c.lights,
          sport: c.sport,
          surface: c.surface ?? null,
          indoor: c.indoor,
        })),
      };
    }
  }

  // Si la aplicación está aprobada, buscamos el club materializado
  // (creado por fn_materialize_club_from_application) para wirear los CTAs.
  let approvedClub: ApprovedClubSummary | null = null;
  if (status === "approved") {
    const session = await getSession();
    if (session.authenticated) {
      const supabase = await getServerClient();
      const { data: ownerRole } = await supabase
        .from("role_assignments")
        .select("club_id")
        .eq("user_id", session.session.userId)
        .eq("role", "owner")
        .is("revoked_at", null)
        .not("club_id", "is", null)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ownerRole?.club_id) {
        const clubId = ownerRole.club_id as string;
        // Calcular checklist en paralelo: ítems operativos del nuevo portal.
        const [
          { data: club },
          { count: courtsCount },
          { count: pricingCount },
        ] = await Promise.all([
          supabase.from("clubs").select("id,slug,name,logo_url,cover_url").eq("id", clubId).maybeSingle(),
          supabase.from("courts").select("id", { count: "exact", head: true }).eq("club_id", clubId).eq("active", true),
          supabase
            .from("court_pricing")
            .select("court_id,courts!inner(club_id)", { count: "exact", head: true })
            .eq("courts.club_id", clubId)
            .eq("active", true),
        ]);
        if (club) {
          const checklist: ClubOnboardingChecklist = {
            hasCourts: (courtsCount ?? 0) > 0,
            hasPricing: (pricingCount ?? 0) > 0,
            hasLogo: !!(club.logo_url as string | null),
            hasCover: !!(club.cover_url as string | null),
          };
          approvedClub = {
            id: club.id as string,
            slug: club.slug as string,
            name: club.name as string,
            checklist,
          };
        }
      }
    }
  }

  return (
    <SolicitarClubScreenView
      status={status}
      initial={initial}
      approvedClub={approvedClub}
      review={review}
    />
  );
}
