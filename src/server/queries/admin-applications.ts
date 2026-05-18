// Server-only queries para el detalle de club_applications. Aislado del
// componente que las consume para que NUNCA puedan terminar bundleadas al
// cliente — el `import "server-only"` arroja error de build si alguien
// intenta importar esto desde un módulo client.
//
// Motivo: estas funciones usan getAdminClient() (service role) y leen email
// del auth.admin, datos sensibles que no deben filtrarse al browser.
import "server-only";

import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/db/client.admin";
import { getSession } from "@/lib/auth/session";
import { STORAGE_BUCKETS } from "@/lib/storage/buckets";

const SIGNED_URL_TTL = 60 * 30;

export type DocItem = {
  id: string;
  kind: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  uploadedAt: string | null;
  url: string | null;
};

export type PhotoItem = {
  id: string;
  ordinal: number;
  caption: string | null;
  url: string | null;
};

export type CourtItem = {
  code: string;
  sport: string;
  surface: string | null;
  indoor: boolean;
  lights: boolean;
  openTime: string | null;
  closeTime: string | null;
  priceCents: number | null;
};

export type ApplicantInfo = { display_name: string; username: string; email: string | null };

export type ApplicationDetail = {
  id: string;
  status: string;
  name: string | null;
  shortDescription: string | null;
  legalName: string | null;
  taxId: string | null;
  foundedYear: number | null;
  sports: string[] | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteOrSocial: string | null;
  address: string | null;
  district: string | null;
  province: string | null;
  country: string | null;
  parking: string | null;
  referenceNote: string | null;
  submittedAt: string | null;
  createdAt: string;
  applicant: ApplicantInfo | null;
  courts: CourtItem[];
  documents: DocItem[];
  photos: PhotoItem[];
};

export async function ensureAdmin(): Promise<void> {
  const session = await getSession();
  if (!session.authenticated) notFound();
  const admin = getAdminClient();
  const { data } = await admin
    .from("role_assignments")
    .select("role")
    .eq("user_id", session.session.userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) notFound();
}

export async function loadApplicationDetail(
  applicationId: string,
): Promise<ApplicationDetail | null> {
  const supabase = getAdminClient();
  const { data: app } = await supabase
    .from("club_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return null;

  const [{ data: courts }, { data: docs }, { data: photos }, applicantRes] = await Promise.all([
    supabase
      .from("club_application_courts")
      .select("*")
      .eq("application_id", applicationId)
      .order("ordinal"),
    supabase
      .from("club_application_documents")
      .select("*")
      .eq("application_id", applicationId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("club_application_photos")
      .select("*")
      .eq("application_id", applicationId)
      .order("ordinal"),
    app.applicant_id
      ? supabase
          .from("profiles")
          .select("display_name,username")
          .eq("id", app.applicant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [docUrls, photoUrls] = await Promise.all([
    Promise.all(
      (docs ?? []).map(async (d) => {
        if (!d.storage_path) return null;
        const { data: signed } = await supabase.storage
          .from(STORAGE_BUCKETS.KYC_DOCS)
          .createSignedUrl(d.storage_path, SIGNED_URL_TTL);
        return signed?.signedUrl ?? null;
      }),
    ),
    Promise.all(
      (photos ?? []).map(async (p) => {
        if (!p.storage_path) return null;
        const { data: signed } = await supabase.storage
          .from(STORAGE_BUCKETS.CLUB_COVERS)
          .createSignedUrl(p.storage_path, SIGNED_URL_TTL);
        return signed?.signedUrl ?? null;
      }),
    ),
  ]);

  let applicantEmail: string | null = null;
  if (app.applicant_id) {
    const { data: userRes } = await supabase.auth.admin.getUserById(app.applicant_id as string);
    applicantEmail = userRes.user?.email ?? null;
  }

  return {
    id: app.id as string,
    status: app.status as string,
    name: (app.name as string) ?? null,
    shortDescription: (app.short_description as string) ?? null,
    legalName: (app.legal_name as string) ?? null,
    taxId: (app.tax_id as string) ?? null,
    foundedYear: (app.founded_year as number) ?? null,
    sports: (app.sports as string[]) ?? null,
    contactPerson: (app.contact_person as string) ?? null,
    contactEmail: (app.contact_email as string) ?? null,
    contactPhone: (app.contact_phone as string) ?? null,
    websiteOrSocial: (app.website_or_social as string) ?? null,
    address: (app.address as string) ?? null,
    district: (app.district as string) ?? null,
    province: (app.province as string) ?? null,
    country: (app.country as string) ?? null,
    parking: (app.parking as string) ?? null,
    referenceNote: (app.reference_note as string) ?? null,
    submittedAt: (app.submitted_at as string) ?? null,
    createdAt: app.created_at as string,
    applicant: applicantRes.data
      ? {
          display_name: applicantRes.data.display_name as string,
          username: applicantRes.data.username as string,
          email: applicantEmail,
        }
      : null,
    courts: (courts ?? []).map((c) => ({
      code: c.proposed_code as string,
      sport: c.sport as string,
      surface: (c.surface as string | null) ?? null,
      indoor: c.indoor as boolean,
      lights: c.lights as boolean,
      openTime: (c.open_time as string | null) ?? null,
      closeTime: (c.close_time as string | null) ?? null,
      priceCents: (c.base_price_cents as number | null) ?? null,
    })),
    documents: (docs ?? []).map((d, i) => ({
      id: d.id as string,
      kind: d.kind as string,
      filename: (d.filename as string | null) ?? null,
      mimeType: (d.mime_type as string | null) ?? null,
      sizeBytes: (d.size_bytes as number | null) ?? null,
      status: d.status as string,
      uploadedAt: (d.uploaded_at as string | null) ?? null,
      url: docUrls[i],
    })),
    photos: (photos ?? []).map((p, i) => ({
      id: p.id as string,
      ordinal: p.ordinal as number,
      caption: (p.caption as string | null) ?? null,
      url: photoUrls[i],
    })),
  };
}
