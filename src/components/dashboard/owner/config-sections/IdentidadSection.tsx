"use client";
// Sección Identidad del Club Config v2. Texto vía updateClubIdentity;
// logo, cover y coords vía updateClub + Storage / ClubMapPicker.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ImageUploader } from "@/components/ImageUploader";
import { ClubMapPicker } from "@/components/dashboard/clubes/ClubMapPicker";
import { ClubMap } from "@/components/dashboard/clubes/ClubMap";
import { useToast } from "@/components/dashboard/ToastProvider";
import { updateClubIdentity } from "@/server/actions/club-config-identidad";
import { updateClub } from "@/server/actions/clubs";
import { Field, type SectionToast } from "./_shared";

export type IdentidadData = {
  clubId: string;
  name: string;
  legalName: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  reference: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  latitude: number | null;
  longitude: number | null;
  initials: string;
  sportsLabel: string;
  courtsLabel: string;
  ratingAvg: number | null;
  ratingCount: number | null;
  openLabel: string;
  slug: string | null;
  version: number;
};

type FormState = {
  name: string;
  legalName: string;
  description: string;
  country: string;
  city: string;
  address: string;
  reference: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  instagram: string;
  tiktok: string;
};

function toFormState(d?: IdentidadData): FormState {
  return {
    name: d?.name ?? "",
    legalName: d?.legalName ?? "",
    description: d?.description ?? "",
    country: d?.country ?? "",
    city: d?.city ?? "",
    address: d?.address ?? "",
    reference: d?.reference ?? "",
    phone: d?.phone ?? "",
    whatsapp: d?.whatsapp ?? "",
    email: d?.email ?? "",
    website: d?.website ?? "",
    instagram: d?.instagram ?? "",
    tiktok: d?.tiktok ?? "",
  };
}

export function IdentidadSection({
  onAction,
  data,
}: {
  onAction: SectionToast;
  data?: IdentidadData;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(data));
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(data?.logoUrl ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(data?.coverUrl ?? null);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: data?.latitude ?? null,
    lng: data?.longitude ?? null,
  });

  const persistClubAsset = async (kind: "logoUrl" | "coverUrl", url: string) => {
    if (!data?.clubId) return;
    const res = await updateClub({
      clubId: data.clubId,
      patch: { [kind]: url },
    });
    if (res.ok) {
      if (kind === "logoUrl") setLogoUrl(url);
      else setCoverUrl(url);
      toast({ icon: "check-circle-2", title: kind === "logoUrl" ? "Logo actualizado" : "Portada actualizada" });
      router.refresh();
    } else {
      toast({ icon: "alert-circle", title: "Error", sub: res.error.message });
    }
  };

  const handleSaveCoords = async (lat: number, lng: number) => {
    if (!data?.clubId) return;
    setPickerSaving(true);
    const res = await updateClub({
      clubId: data.clubId,
      patch: {
        latitude: lat,
        longitude: lng,
        expectedVersion: data.version ?? 1,
      },
    });
    setPickerSaving(false);
    if (res.ok) {
      setCoords({ lat, lng });
      toast({ icon: "check-circle-2", title: "Ubicación guardada" });
      setPickerOpen(false);
      router.refresh();
    } else {
      toast({ icon: "alert-circle", title: "Error", sub: res.error.message });
    }
  };

  const initials = (form.name.trim()
    ? form.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : "??"
  ).slice(0, 2);

  const cityLine = [form.city, form.country].filter(Boolean).join(" · ") || "—";
  const update = (k: keyof FormState) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const onSave = () => {
    setErr(null);
    if (!data?.clubId) {
      toast({ icon: "alert-circle", title: "No hay club activo" });
      return;
    }
    if (form.name.trim().length < 2) {
      setErr("El nombre comercial es obligatorio");
      return;
    }
    startTransition(async () => {
      const res = await updateClubIdentity({
        clubId: data.clubId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        country: form.country.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
      if (!res.ok) {
        setErr(res.error.message);
        toast({ icon: "alert-circle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Identidad guardada" });
      router.refresh();
    });
  };

  return (
    <div className="mp-ccfg-ident" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "flex-start" }}>
      <div className="card mp-ccfg-ident-card" style={{ padding: 24 }}>
        <div className="mp-ccfg-cover-block" style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
            Foto de portada
          </label>
          <div
            className="mp-ccfg-cover-preview"
            style={{
              position: "relative",
              minHeight: 160,
              height: 180,
              borderRadius: 12,
              overflow: "hidden",
              background: coverUrl
                ? `url(${coverUrl}) center/cover`
                : "linear-gradient(135deg, #166534, #10b981 60%, #34d399)",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.08) 42%, rgba(0,0,0,0.55) 100%)",
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: "radial-gradient(circle at 25% 80%, rgba(255,255,255,0.18), transparent 50%)",
              }}
            />
            <span
              className="mp-ccfg-cover-badge"
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                padding: "3px 10px",
                borderRadius: 9999,
                background: "rgba(0,0,0,0.65)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.15em",
              }}
            >
              ● PREVIEW HEADER
            </span>
            <div
              className="mp-ccfg-cover-content"
              style={{
                position: "absolute",
                left: 14,
                right: 14,
                bottom: 14,
                display: "flex",
                alignItems: "flex-end",
                gap: 12,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  borderRadius: 14,
                  background: "#0a0a0a",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "3px solid #fff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  overflow: "hidden",
                }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em" }}>
                    {initials}
                  </span>
                )}
              </div>
              <div style={{ color: "#fff", minWidth: 0, flex: 1 }}>
                <div
                  className="font-heading mp-ccfg-cover-title"
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    letterSpacing: "-0.025em",
                    textTransform: "uppercase",
                    textShadow: "0 1px 4px rgba(0,0,0,0.35)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {form.name || "Sin nombre"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    opacity: 0.92,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cityLine}
                </div>
              </div>
            </div>
          </div>
          <div className="mp-ccfg-cover-actions" style={{ marginTop: 10 }}>
            {data?.clubId ? (
              <ImageUploader
                bucket="clubs"
                folder={data.clubId}
                filenamePrefix="cover"
                currentUrl={coverUrl}
                shape="rectangle"
                height={140}
                onUploaded={(url) => persistClubAsset("coverUrl", url)}
              />
            ) : (
              <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>Activa el club para subir la portada.</div>
            )}
          </div>
        </div>

        <div className="mp-ccfg-ident-logo-row" style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Logo</label>
            {data?.clubId ? (
              <ImageUploader
                bucket="clubs"
                folder={data.clubId}
                filenamePrefix="logo"
                currentUrl={logoUrl}
                shape="circle"
                height={100}
                onUploaded={(url) => persistClubAsset("logoUrl", url)}
              />
            ) : (
              <div style={{ width: 100, height: 100, borderRadius: 14, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <span className="font-heading" style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em" }}>{initials}</span>
              </div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <Field l="Nombre comercial" v={form.name} onChange={update("name")} hint="Aparece en el browse y en compartidos sociales." />
          </div>
        </div>

        <Field l="Descripción corta" v={form.description} onChange={update("description")} hint={`Máx. 280 caracteres · ${form.description.length} / 280`} />
        <div className="mp-ccfg-ident-contact" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field l="Teléfono" v={form.phone} onChange={update("phone")} icon="phone" />
          <Field l="Email" v={form.email} onChange={update("email")} icon="mail" />
        </div>

        <div style={{ marginTop: 18, padding: 14, background: "var(--muted)", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Icon name="map-pin" size={14} color="var(--primary)" />
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>Ubicación física</span>
          </div>
          <div className="mp-ccfg-ident-contact" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field l="Ciudad" v={form.city} onChange={update("city")} />
            <Field l="País" v={form.country} onChange={update("country")} />
            <Field l="Dirección" v={form.address} onChange={update("address")} />
          </div>
          <div style={{ borderRadius: 8, overflow: "hidden", marginTop: 4, position: "relative", minHeight: 110 }}>
            {coords.lat != null && coords.lng != null ? (
              <ClubMap latitude={coords.lat} longitude={coords.lng} height={110} />
            ) : (
              <div style={{ height: 110, background: "linear-gradient(135deg, #d4f1de 0%, #bbf7d0 60%, #ecfdf5 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted-fg)" }}>
                Sin pin en el mapa
              </div>
            )}
            <button
              type="button"
              className="btn"
              style={{ position: "absolute", right: 10, bottom: 10, background: "#fff", border: "1px solid var(--border)", fontSize: 10, zIndex: 2 }}
              onClick={() => {
                if (!data?.clubId) {
                  toast({ icon: "alert-circle", title: "No hay club activo" });
                  return;
                }
                setPickerOpen(true);
              }}
            >
              Editar en mapa
            </button>
          </div>
        </div>

        <div className="mp-ccfg-ident-save" style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10.5, color: err ? "#dc2626" : "var(--muted-fg)" }}>
            {err ?? "Los cambios se aplican al instante en el perfil público."}
          </div>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={pending || !data?.clubId}
            style={{ opacity: pending || !data?.clubId ? 0.6 : 1, cursor: pending || !data?.clubId ? "not-allowed" : "pointer" }}
          >
            <Icon name={pending ? "loader-2" : "save"} size={13} color="#fff" />
            {pending ? "Guardando…" : "Guardar identidad"}
          </button>
        </div>
      </div>

      <div className="mp-ccfg-preview" style={{ position: "sticky", top: 80 }}>
        <div className="label-mp" style={{ marginBottom: 8 }}>● Vista previa pública</div>
        <div className="card" style={{ padding: 0, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ height: 120, background: coverUrl ? `url(${coverUrl}) center/cover` : "linear-gradient(135deg, #166534, #10b981 60%, #34d399)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 25% 80%, rgba(255,255,255,0.18), transparent 50%)" }} />
          </div>
          <div style={{ padding: 16, position: "relative" }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", marginTop: -40, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", overflow: "hidden" }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em" }}>{initials}</span>
              )}
            </div>
            <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", marginTop: 10 }}>{form.name || "Sin nombre"}<span className="dot">.</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
              <Icon name="map-pin" size={11} />{cityLine}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 8, lineHeight: 1.45 }}>{form.description || "Sin descripción todavía."}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {[data?.sportsLabel, data?.courtsLabel].filter(Boolean).map((c) => (
                <span key={c as string} style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 9999, background: "var(--muted)", color: "#0a0a0a" }}>{c}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} onClick={() => onAction("Reservar · vista previa")}>Reservar</button>
              <button className="btn" style={{ flex: 1, background: "#fff", border: "1px solid var(--border)", fontSize: 11 }} onClick={() => onAction("Ver canchas · vista previa")}>Ver canchas</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 10 }}>
              <div>
                <b style={{ color: "#fbbf24" }}>★ {data?.ratingAvg != null ? data.ratingAvg.toFixed(1) : "—"}</b>
                <span style={{ color: "var(--muted-fg)" }}> · {data?.ratingCount ?? 0} reseñas</span>
              </div>
              <div style={{ color: "var(--muted-fg)" }}>● {data?.openLabel ?? "Abierto"}</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 10, textAlign: "center", lineHeight: 1.4 }}>
          Así te verán los jugadores en <b>matchpoint.top/clubes</b>
        </div>
      </div>

      {pickerOpen && (
        <ClubMapPicker
          initialLat={coords.lat}
          initialLng={coords.lng}
          onCancel={() => setPickerOpen(false)}
          onSave={handleSaveCoords}
          saving={pickerSaving}
        />
      )}
    </div>
  );
}
