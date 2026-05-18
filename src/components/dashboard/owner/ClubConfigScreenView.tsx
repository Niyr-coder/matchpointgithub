// Client view de ClubConfigScreen — layout 1:1 (RoleScreensPolish.jsx 563-639).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ImageUploader } from "@/components/ImageUploader";
import { PolHero } from "../widgets/PolHero";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { updateClub } from "@/server/actions/clubs";
import { ClubMapPicker } from "@/components/dashboard/clubes/ClubMapPicker";

type Item = [string, string] | [string, string, "critical"];
export type Section = { i: string; t: string; items: Item[] };
export type ConfigData = {
  clubId: string | null;
  sections: Record<string, Section> | null;
  logoUrl: string | null;
  coverUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  version: number | null;
};

// Sin fallback inventado: si no hay clubId resuelto, secciones con valores `—`.
const EMPTY_SECTIONS: Record<string, Section> = {
  info: {
    i: "building-2",
    t: "Información",
    items: [
      ["Nombre del club", "—"],
      ["Dirección", "—"],
      ["Ciudad", "—"],
      ["Teléfono", "—"],
      ["Email", "—"],
      ["Slug público", "—"],
    ],
  },
  horarios: {
    i: "clock",
    t: "Horarios",
    items: [
      ["Lunes a Viernes", "—"],
      ["Sábado", "—"],
      ["Domingo", "—"],
    ],
  },
  tarifas: {
    i: "wallet",
    t: "Tarifas",
    items: [["Cancha estándar", "—", "critical"]],
  },
  reglas: {
    i: "scroll-text",
    t: "Reglas del club",
    items: [
      ["Edad mínima sin acompañante", "—"],
      ["Vestimenta deportiva", "—"],
      ["Calzado adecuado", "—"],
      ["Mascotas", "—"],
      ["Bebidas alcohólicas", "—"],
    ],
  },
};

export function ClubConfigScreenView({ data }: { data: ConfigData }) {
  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "clubs", filter: `id=eq.${data.clubId}` },
          { table: "club_settings", filter: `club_id=eq.${data.clubId}` },
          { table: "court_pricing" },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const SECTIONS_DATA = data.sections ?? EMPTY_SECTIONS;
  // Inyectamos una sección sintética "Identidad visual" que renderiza uploaders
  // en vez de la lista de items. Va al inicio porque es lo más visible públicamente.
  const SECTIONS: Record<string, Section> = {
    visual: { i: "image", t: "Identidad visual", items: [] },
    ...SECTIONS_DATA,
  };
  const SECTION_KEYS = Object.keys(SECTIONS);

  const toast = useToast();
  const router = useRouter();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const persistClubAsset = async (kind: "logoUrl" | "coverUrl", url: string) => {
    if (!data.clubId) return;
    const res = await updateClub({
      clubId: data.clubId,
      patch: { [kind]: url } as Record<string, string>,
    });
    if (res.ok) {
      toast({ icon: "check", title: kind === "logoUrl" ? "Logo actualizado" : "Cover actualizado" });
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleSave = async () => {
    if (!data.clubId) return;
    const name = await ask({
      title: "Nombre del club",
      label: "Nombre",
      placeholder: "Mi Club",
      required: true,
      validate: (v) => (v.trim().length < 2 ? "Mínimo 2 caracteres." : null),
    });
    if (name == null) return;
    startTransition(async () => {
      const res = await updateClub({
        clubId: data.clubId!,
        patch: { name: name.trim() },
      });
      if (res.ok) toast({ icon: "check", title: "Nombre actualizado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const [active, setActive] = useState<string>("info");
  const cur = SECTIONS[active] ?? SECTIONS[SECTION_KEYS[0]];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);

  const handleSaveCoords = async (lat: number, lng: number) => {
    if (!data.clubId) return;
    setPickerSaving(true);
    const res = await updateClub({
      clubId: data.clubId,
      patch: {
        latitude: lat,
        longitude: lng,
        expectedVersion: data.version ?? 1,
      } as Record<string, unknown>,
    });
    setPickerSaving(false);
    if (res.ok) {
      toast({ icon: "check", title: "Ubicación guardada" });
      setPickerOpen(false);
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  // Mapeo etiqueta visible → campo de `clubs` editable vía updateClub.
  const EDITABLE_INFO: Record<string, "name" | "address" | "phone" | "email"> = {
    "Nombre del club": "name",
    "Dirección": "address",
    "Teléfono": "phone",
    "Email": "email",
  };

  const handleEditRow = async (sectionKey: string, label: string, currentValue: string) => {
    if (!data.clubId) {
      toast({ icon: "alert-triangle", title: "Sin club resuelto" });
      return;
    }
    if (sectionKey === "ubicacion") {
      setPickerOpen(true);
      return;
    }
    if (sectionKey !== "info" || !EDITABLE_INFO[label]) {
      toast({
        icon: "alert-triangle",
        title: "Edición no disponible aún",
        sub: `${label} requiere un editor dedicado (próximamente).`,
      });
      return;
    }
    const field = EDITABLE_INFO[label];
    const next = await ask({
      title: `Editar ${label.toLowerCase()}`,
      label,
      initialValue: currentValue === "—" ? "" : currentValue,
      placeholder:
        field === "email"
          ? "hola@miclub.com"
          : field === "phone"
            ? "+593 99 999 9999"
            : field === "address"
              ? "Av. Interoceánica km 12"
              : "Nombre del club",
      required: field === "name",
      validate: (v) => {
        const t = v.trim();
        if (field === "name" && t.length < 2) return "Mínimo 2 caracteres.";
        if (field === "email" && t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))
          return "Formato: nombre@dominio.com";
        if (field === "phone" && t && t.length < 7) return "Mínimo 7 dígitos.";
        return null;
      },
    });
    if (next == null) return;
    const trimmed = next.trim();
    startTransition(async () => {
      const res = await updateClub({
        clubId: data.clubId!,
        patch: { [field]: trimmed || null } as Record<string, string | null>,
      });
      if (res.ok) toast({ icon: "check", title: `${label} actualizado` });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <>
      <PolHero
        tone="dark"
        wm="CLUB"
        label="Club · Configuración"
        title="Ajustes del club"
        sub="Información, horarios, tarifas y reglas. Los cambios se publican al instante en el perfil del club."
        right={
          <button className="btn btn-primary" onClick={handleSave} disabled={isPending || !data.clubId}>
            <Icon name="save" size={13} color="#fff" />
            {isPending ? "Guardando…" : "Guardar"}
          </button>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div className="card" style={{ padding: 8 }}>
          {SECTION_KEYS.map((k) => {
            const s = SECTIONS[k];
            const on = active === k;
            return (
              <button
                key={k}
                onClick={() => setActive(k)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "11px 12px",
                  borderRadius: 8,
                  background: on ? "#ecfdf5" : "transparent",
                  border: 0,
                  borderLeft: on ? "3px solid var(--primary)" : "3px solid transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: on ? "var(--primary)" : "var(--muted)",
                    color: on ? "#fff" : "#0a0a0a",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={s.i} size={13} color={on ? "#fff" : "#0a0a0a"} />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: on ? 900 : 700,
                    color: on ? "#0a0a0a" : "var(--muted-fg)",
                  }}
                >
                  {s.t}
                </div>
              </button>
            );
          })}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: "var(--primary)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={cur.i} size={20} color="#fff" />
            </div>
            <div>
              <div className="label-mp">Sección</div>
              <h2
                className="font-heading"
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "-0.025em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {cur.t}
                <span className="dot">.</span>
              </h2>
            </div>
          </div>
          {active === "visual" ? (
            <VisualPanel
              clubId={data.clubId}
              logoUrl={data.logoUrl}
              coverUrl={data.coverUrl}
              onUploadLogo={(url) => persistClubAsset("logoUrl", url)}
              onUploadCover={(url) => persistClubAsset("coverUrl", url)}
            />
          ) : cur.items.map(([k, v, critical], i) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 0",
                borderTop: i === 0 ? 0 : "1px dashed var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{k}</div>
                {critical && (
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "#dc2626",
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      marginTop: 3,
                    }}
                  >
                    ⚠ Visible al público
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 900 }}>{v}</span>
                <button
                  className="btn"
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    padding: "5px 12px",
                    fontSize: 10,
                  }}
                  disabled={isPending}
                  onClick={() => handleEditRow(active, k, v)}
                >
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pickerOpen && (
        <ClubMapPicker
          initialLat={data.latitude}
          initialLng={data.longitude}
          onCancel={() => setPickerOpen(false)}
          onSave={handleSaveCoords}
          saving={pickerSaving}
        />
      )}
    </>
  );
}

function VisualPanel({
  clubId,
  logoUrl,
  coverUrl,
  onUploadLogo,
  onUploadCover,
}: {
  clubId: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  onUploadLogo: (url: string) => void | Promise<void>;
  onUploadCover: (url: string) => void | Promise<void>;
}) {
  if (!clubId) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted-fg)", padding: 16 }}>
        Activa el club primero para subir imágenes.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>
          Logo del club
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 10 }}>
          Cuadrado, idealmente 512×512px. Aparece en cards, tickets y reseñas.
        </div>
        <div style={{ maxWidth: 200 }}>
          <ImageUploader
            bucket="clubs"
            folder={clubId}
            filenamePrefix="logo"
            currentUrl={logoUrl}
            shape="circle"
            height={160}
            onUploaded={onUploadLogo}
          />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>
          Cover del club
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 10 }}>
          Apaisado, idealmente 1600×600px. Banner principal en la página pública.
        </div>
        <ImageUploader
          bucket="clubs"
          folder={clubId}
          filenamePrefix="cover"
          currentUrl={coverUrl}
          shape="rectangle"
          height={200}
          onUploaded={onUploadCover}
        />
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        JPG, PNG o WEBP · máximo 4 MB por imagen.
      </div>
    </div>
  );
}
