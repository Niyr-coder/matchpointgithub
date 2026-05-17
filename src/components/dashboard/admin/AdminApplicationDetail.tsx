// Server: detalle completo de una solicitud de club para revisión admin.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { getAdminClient } from "@/lib/db/client.admin";
import { getSession } from "@/lib/auth/session";
import { STORAGE_BUCKETS } from "@/lib/storage/buckets";
import { AdminApplicationDetailActions } from "./AdminApplicationDetailActions";

const SIGNED_URL_TTL = 60 * 30; // 30 min

type DocItem = {
  id: string;
  kind: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  uploadedAt: string | null;
  url: string | null;
};

type PhotoItem = {
  id: string;
  ordinal: number;
  caption: string | null;
  url: string | null;
};

type CourtItem = {
  code: string;
  sport: string;
  surface: string | null;
  indoor: boolean;
  lights: boolean;
  openTime: string | null;
  closeTime: string | null;
  priceCents: number | null;
};

type ApplicantInfo = { display_name: string; username: string; email: string | null };

type DetailData = {
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

const STATUS_LABEL: Record<string, { l: string; bg: string; fg: string; border: string }> = {
  draft: { l: "Borrador", bg: "var(--muted)", fg: "var(--muted-fg)", border: "var(--border)" },
  submitted: { l: "Enviada", bg: "#fef3c7", fg: "#92400e", border: "#fde68a" },
  docs_review: { l: "Revisión docs", bg: "#fef3c7", fg: "#92400e", border: "#fde68a" },
  field_verification: { l: "Verificación campo", bg: "#dbeafe", fg: "#1e40af", border: "#bfdbfe" },
  final_review: { l: "Revisión final", bg: "#e0e7ff", fg: "#3730a3", border: "#c7d2fe" },
  approved: { l: "Aprobada", bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" },
  rejected: { l: "Rechazada", bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  withdrawn: { l: "Retirada", bg: "var(--muted)", fg: "var(--muted-fg)", border: "var(--border)" },
};

const DOC_KIND_LABEL: Record<string, string> = {
  tax_id_certificate: "RUC actualizado",
  incorporation_act: "Acta constitutiva",
  land_use_permit: "Certificado de uso de suelo",
  liability_insurance: "Seguro de responsabilidad civil",
  health_permit: "Permiso sanitario",
  other: "Otro documento",
};

async function ensureAdmin(): Promise<void> {
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

async function loadData(applicationId: string): Promise<DetailData | null> {
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

  // Signed URLs en paralelo
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

  // Email del applicant via auth.admin
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

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" });
}

export async function AdminApplicationDetail({ applicationId }: { applicationId: string }) {
  await ensureAdmin();
  const data = await loadData(applicationId);
  if (!data) notFound();

  const st = STATUS_LABEL[data.status] ?? STATUS_LABEL.submitted;
  const canDecide = !["approved", "rejected", "withdrawn"].includes(data.status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Link
            href="/dashboard/admin/admin-clubs"
            style={{
              fontSize: 11,
              color: "var(--muted-fg)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 8,
            }}
          >
            <Icon name="arrow-left" size={12} /> Volver a Clubes
          </Link>
          <div className="label-mp">Solicitud · SC-{data.id.slice(0, 8).toUpperCase()}</div>
          <h1
            className="font-heading"
            style={{
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              margin: "4px 0 0",
            }}
          >
            {data.name ?? "Sin nombre"}
            <span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4 }}>
            {data.applicant
              ? `Solicitada por ${data.applicant.display_name} (@${data.applicant.username})`
              : "Solicitante desconocido"}{" "}
            · {fmtDate(data.submittedAt ?? data.createdAt)}
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 9999,
            background: st.bg,
            color: st.fg,
            border: "1px solid " + st.border,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.fg }} />
          {st.l}
        </span>
      </div>

      {canDecide && (
        <AdminApplicationDetailActions
          applicationId={data.id}
          name={data.name ?? "esta solicitud"}
          status={data.status}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>Identidad pública</div>
          <DetailRow k="Nombre" v={data.name} />
          <DetailRow k="Descripción" v={data.shortDescription} />
          <DetailRow k="Deportes" v={data.sports?.join(", ") ?? null} />
          <DetailRow k="Año fundación" v={data.foundedYear ? String(data.foundedYear) : null} />
          <DetailRow k="Web / redes" v={data.websiteOrSocial} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>Ubicación</div>
          <DetailRow k="Dirección" v={data.address} />
          <DetailRow k="Sector" v={data.district} />
          <DetailRow k="Provincia" v={data.province} />
          <DetailRow k="País" v={data.country} />
          <DetailRow k="Estacionamiento" v={data.parking} />
          <DetailRow k="Referencia" v={data.referenceNote} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>Legal & contacto</div>
          <DetailRow k="Razón social" v={data.legalName} />
          <DetailRow k="RUC" v={data.taxId} />
          <DetailRow k="Contacto" v={data.contactPerson} />
          <DetailRow k="Email" v={data.contactEmail} />
          <DetailRow k="Celular" v={data.contactPhone} />
          {data.applicant && (
            <DetailRow k="Cuenta solicitante" v={data.applicant.email ?? `@${data.applicant.username}`} />
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>
            Canchas propuestas ({data.courts.length})
          </div>
          {data.courts.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--muted-fg)", fontStyle: "italic" }}>
              No definió canchas.
            </div>
          ) : (
            data.courts.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr auto",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: i === 0 ? 0 : "1px dashed var(--border)",
                  fontSize: 12,
                }}
              >
                <b style={{ fontFamily: "Plus Jakarta Sans" }}>{c.code}</b>
                <span style={{ color: "var(--muted-fg)" }}>
                  {c.sport} · {c.surface ?? "—"} · {c.indoor ? "indoor" : "outdoor"} ·{" "}
                  {c.lights ? "con luz" : "sin luz"} · {c.openTime ?? "—"}–{c.closeTime ?? "—"}
                </span>
                <b style={{ color: "var(--primary)" }}>
                  {c.priceCents != null ? `$${Math.round(c.priceCents / 100)}/h` : "$—"}
                </b>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="label-mp" style={{ marginBottom: 12 }}>
          Documentos ({data.documents.length})
        </div>
        {data.documents.length === 0 ? (
          <div
            style={{
              padding: 14,
              background: "#fafafa",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--muted-fg)",
              textAlign: "center",
            }}
          >
            El solicitante no subió documentos.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.documents.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="file-text" size={14} />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>
                    {DOC_KIND_LABEL[d.kind] ?? d.kind}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    {d.filename ?? "—"} · {fmtBytes(d.sizeBytes)} · {d.mimeType ?? "—"} · subido{" "}
                    {fmtDate(d.uploadedAt)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9.5,
                    padding: "3px 8px",
                    borderRadius: 9999,
                    background:
                      d.status === "approved"
                        ? "#dcfce7"
                        : d.status === "rejected"
                          ? "#fee2e2"
                          : "var(--muted)",
                    color:
                      d.status === "approved"
                        ? "#166534"
                        : d.status === "rejected"
                          ? "#991b1b"
                          : "var(--muted-fg)",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {d.status}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {d.url ? (
                    <>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                        style={{
                          background: "#fff",
                          border: "1px solid var(--border)",
                          fontSize: 10.5,
                          textDecoration: "none",
                        }}
                      >
                        <Icon name="external-link" size={11} />
                        Ver
                      </a>
                      <a
                        href={d.url}
                        download={d.filename ?? undefined}
                        className="btn"
                        style={{
                          background: "#fff",
                          border: "1px solid var(--border)",
                          fontSize: 10.5,
                          textDecoration: "none",
                        }}
                      >
                        <Icon name="download" size={11} />
                      </a>
                    </>
                  ) : (
                    <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                      Sin acceso al archivo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="label-mp" style={{ marginBottom: 12 }}>
          Galería del club ({data.photos.length})
        </div>
        {data.photos.length === 0 ? (
          <div
            style={{
              padding: 14,
              background: "#fafafa",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--muted-fg)",
              textAlign: "center",
            }}
          >
            El solicitante no subió fotos.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {data.photos.map((p) => (
              <a
                key={p.id}
                href={p.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  aspectRatio: "1",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  position: "relative",
                }}
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={p.caption ?? `Foto ${p.ordinal + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--muted-fg)",
                    }}
                  >
                    <Icon name="image-off" size={20} />
                  </div>
                )}
                <span
                  style={{
                    position: "absolute",
                    bottom: 6,
                    left: 8,
                    fontSize: 9.5,
                    fontWeight: 900,
                    color: "#fff",
                    background: "rgba(10,10,10,0.6)",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  #{p.ordinal + 1}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: string | null }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 10,
        padding: "6px 0",
        borderTop: "1px dashed var(--border)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--muted-fg)", fontWeight: 700 }}>{k}</span>
      <span style={{ fontWeight: 800, color: v ? "#0a0a0a" : "var(--muted-fg)" }}>{v || "—"}</span>
    </div>
  );
}
