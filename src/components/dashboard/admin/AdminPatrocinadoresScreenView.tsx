"use client";

import { useRef, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { useToast } from "@/components/dashboard/ToastProvider";
import { InfoTip, LabelWithTip } from "@/components/dashboard/widgets/InfoTip";
import {
  createSponsor,
  createSponsorPlacement,
  createSponsorSlot,
  setSponsorPlacementStatus,
  setSponsorStatus,
  updateSponsor,
  updateSponsorPlacement,
  updateSponsorSlot,
  type AdminSponsor,
  type AdminSponsorPlacement,
  type AdminSponsorSlot,
  type AdminSponsorsData,
} from "@/server/actions/admin/sponsors";

type SponsorForm = {
  id: string | null;
  name: string;
  slug: string;
  websiteUrl: string;
  logoUrl: string;
  brandColor: string;
  contactName: string;
  contactEmail: string;
  billingEmail: string;
  contractStartsOn: string;
  contractEndsOn: string;
  notes: string;
};

type SlotForm = {
  id: string | null;
  key: string;
  surface: string;
  label: string;
  description: string;
  maxActivePlacements: string;
  basePriceCents: string;
  currency: string;
  isActive: boolean;
};

type PlacementForm = {
  id: string | null;
  sponsorId: string;
  slotId: string;
  status: AdminSponsorPlacement["status"];
  headline: string;
  body: string;
  imageUrl: string;
  imageAlt: string;
  targetUrl: string;
  priority: string;
  startsAt: string;
  endsAt: string;
  contractAmountCents: string;
  currency: string;
};

type MutationResult = { ok: boolean; error?: { message: string } };

const STATUS_META: Record<AdminSponsor["status"] | AdminSponsorPlacement["status"], { label: string; bg: string; color: string }> = {
  active: { label: "Activo", bg: "#ecfdf5", color: "#047857" },
  paused: { label: "Pausado", bg: "#fef3c7", color: "#92400e" },
  archived: { label: "Archivado", bg: "var(--muted)", color: "var(--muted-fg)" },
  draft: { label: "Borrador", bg: "#eef2ff", color: "#3730a3" },
};

const NATIVE_PACKAGES = [
  { name: "Torneo local Presenting", price: "USD 500-800/mes", inventory: "Fixture, detalle de torneo, premios y reporte post-evento." },
  { name: "Circuito ciudad", price: "USD 1,000-1,500/mes", inventory: "Listado de torneos, ranking, home jugador y comunicaciones por ciudad/deporte." },
  { name: "Club Partner", price: "USD 500-1,000/mes", inventory: "Club destacado, beneficio para miembros y presencia en eventos del club." },
  { name: "Beneficio MATCHPOINT+", price: "USD 300-700/mes", inventory: "Oferta exclusiva para usuarios MP+ con URL, código o reporte mensual." },
] as const;

function emptySponsorForm(): SponsorForm {
  return {
    id: null,
    name: "",
    slug: "",
    websiteUrl: "",
    logoUrl: "",
    brandColor: "",
    contactName: "",
    contactEmail: "",
    billingEmail: "",
    contractStartsOn: "",
    contractEndsOn: "",
    notes: "",
  };
}

function sponsorToForm(row: AdminSponsor): SponsorForm {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    websiteUrl: row.websiteUrl ?? "",
    logoUrl: row.logoUrl ?? "",
    brandColor: row.brandColor ?? "",
    contactName: row.contactName ?? "",
    contactEmail: row.contactEmail ?? "",
    billingEmail: row.billingEmail ?? "",
    contractStartsOn: row.contractStartsOn ?? "",
    contractEndsOn: row.contractEndsOn ?? "",
    notes: row.notes ?? "",
  };
}

function emptySlotForm(): SlotForm {
  return {
    id: null,
    key: "",
    surface: "",
    label: "",
    description: "",
    maxActivePlacements: "1",
    basePriceCents: "0",
    currency: "USD",
    isActive: true,
  };
}

function slotToForm(row: AdminSponsorSlot): SlotForm {
  return {
    id: row.id,
    key: row.key,
    surface: row.surface,
    label: row.label,
    description: row.description ?? "",
    maxActivePlacements: String(row.maxActivePlacements),
    basePriceCents: String(row.basePriceCents),
    currency: row.currency,
    isActive: row.isActive,
  };
}

function toInputDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromInputDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function emptyPlacementForm(data: AdminSponsorsData): PlacementForm {
  return {
    id: null,
    sponsorId: data.sponsors[0]?.id ?? "",
    slotId: data.slots[0]?.id ?? "",
    status: "draft",
    headline: "",
    body: "",
    imageUrl: "",
    imageAlt: "",
    targetUrl: "",
    priority: "0",
    startsAt: toInputDateTime(new Date().toISOString()),
    endsAt: "",
    contractAmountCents: "0",
    currency: "USD",
  };
}

function placementToForm(row: AdminSponsorPlacement): PlacementForm {
  return {
    id: row.id,
    sponsorId: row.sponsorId,
    slotId: row.slotId,
    status: row.status,
    headline: row.headline,
    body: row.body ?? "",
    imageUrl: row.imageUrl ?? "",
    imageAlt: row.imageAlt ?? "",
    targetUrl: row.targetUrl ?? "",
    priority: String(row.priority),
    startsAt: toInputDateTime(row.startsAt),
    endsAt: toInputDateTime(row.endsAt),
    contractAmountCents: String(row.contractAmountCents),
    currency: row.currency,
  };
}

function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency }).format(cents / 100);
}

function dateLabel(iso: string | null): string {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" });
}

function ctr(clicks: number, impressions: number): string {
  if (impressions <= 0) return "0.0%";
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

function Pill({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {meta.label}
    </span>
  );
}

export function AdminPatrocinadoresScreenView({ data }: { data: AdminSponsorsData }) {
  const router = useRouter();
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"placements" | "sponsors" | "slots">("placements");
  const [sponsorForm, setSponsorForm] = useState<SponsorForm>(data.sponsors[0] ? sponsorToForm(data.sponsors[0]) : emptySponsorForm());
  const [slotForm, setSlotForm] = useState<SlotForm>(data.slots[0] ? slotToForm(data.slots[0]) : emptySlotForm());
  const [placementForm, setPlacementForm] = useState<PlacementForm>(data.placements[0] ? placementToForm(data.placements[0]) : emptyPlacementForm(data));

  useRealtimeRefresh(
    [
      { table: "sponsors" },
      { table: "sponsor_slots" },
      { table: "sponsor_placements" },
      { table: "sponsor_placement_events", event: "INSERT" },
    ],
    { debounceMs: 5000 },
  );

  const focusPanel = () => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openNewSlot = () => {
    setTab("slots");
    setSlotForm(emptySlotForm());
    focusPanel();
  };

  const openNewSponsor = () => {
    setTab("sponsors");
    setSponsorForm(emptySponsorForm());
    focusPanel();
  };

  const openNewPlacement = () => {
    if (data.sponsors.length === 0) {
      toast({
        icon: "handshake",
        title: "Primero crea una marca",
        sub: "Necesitas al menos una marca registrada antes de vender un placement.",
      });
      openNewSponsor();
      return;
    }
    if (data.slots.length === 0) {
      toast({
        icon: "layout-grid",
        title: "Primero crea un slot",
        sub: "Define el inventario publicitario antes de crear el placement.",
      });
      openNewSlot();
      return;
    }
    setTab("placements");
    setPlacementForm(emptyPlacementForm(data));
    focusPanel();
  };

  const run = (fn: () => Promise<MutationResult>, okMessage: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast({ icon: "check", title: okMessage });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error?.message });
      }
    });
  };

  const saveSponsor = () => {
    const payload = {
      name: sponsorForm.name,
      slug: sponsorForm.slug || undefined,
      websiteUrl: sponsorForm.websiteUrl || null,
      logoUrl: sponsorForm.logoUrl || null,
      brandColor: sponsorForm.brandColor || null,
      contactName: sponsorForm.contactName || null,
      contactEmail: sponsorForm.contactEmail || null,
      billingEmail: sponsorForm.billingEmail || null,
      contractStartsOn: sponsorForm.contractStartsOn || null,
      contractEndsOn: sponsorForm.contractEndsOn || null,
      notes: sponsorForm.notes || null,
    };
    if (sponsorForm.id) {
      run(() => updateSponsor({ sponsorId: sponsorForm.id, patch: payload }), "Marca actualizada");
    } else {
      run(() => createSponsor(payload), "Marca creada");
    }
  };

  const saveSlot = () => {
    const payload = {
      key: slotForm.key,
      surface: slotForm.surface,
      label: slotForm.label,
      description: slotForm.description || null,
      maxActivePlacements: Number(slotForm.maxActivePlacements),
      basePriceCents: Number(slotForm.basePriceCents),
      currency: slotForm.currency,
      isActive: slotForm.isActive,
    };
    if (slotForm.id) {
      run(() => updateSponsorSlot({ slotId: slotForm.id, patch: payload }), "Slot actualizado");
    } else {
      run(() => createSponsorSlot(payload), "Slot creado");
    }
  };

  const savePlacement = () => {
    const startsAt = fromInputDateTime(placementForm.startsAt);
    if (!startsAt) {
      toast({ icon: "alert-triangle", title: "Fecha requerida", sub: "Define cuándo inicia el placement." });
      return;
    }
    const payload = {
      sponsorId: placementForm.sponsorId,
      slotId: placementForm.slotId,
      status: placementForm.status,
      headline: placementForm.headline,
      body: placementForm.body || null,
      imageUrl: placementForm.imageUrl || null,
      imageAlt: placementForm.imageAlt || null,
      targetUrl: placementForm.targetUrl || null,
      priority: Number(placementForm.priority),
      startsAt,
      endsAt: fromInputDateTime(placementForm.endsAt),
      contractAmountCents: Number(placementForm.contractAmountCents),
      currency: placementForm.currency,
    };
    if (placementForm.id) {
      run(() => updateSponsorPlacement({ placementId: placementForm.id, patch: payload }), "Placement actualizado");
    } else {
      run(() => createSponsorPlacement(payload), "Placement creado");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 className="font-heading" style={{ margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Patrocinadores<span className="dot">.</span>
            <InfoTip maxWidth={280} text="Publicidad nativa en MATCHPOINT: marcas en el catálogo, slots donde pueden aparecer y placements con ventana y monto. Sin AdMob ni redes externas; impresiones y clics salen de eventos reales en la app." />
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            Catálogo, inventario y placements reales. Las métricas salen de eventos registrados; no hay estimaciones inventadas.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={openNewSlot}>
            <Icon name="layout-grid" size={13} />Nuevo slot
          </button>
          <button type="button" className="btn" onClick={openNewSponsor}>
            <Icon name="badge-dollar-sign" size={13} />Nueva marca
          </button>
          <button type="button" className="btn btn-primary" onClick={openNewPlacement}>
            <Icon name="plus" size={13} color="#fff" />Nuevo placement
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, minWidth: 0 }}>
          <Kpi label="Marcas" value={String(data.totals.sponsors)} hint={`${data.totals.activeSponsors} activas`} icon="handshake" tip="Anunciantes o partners en el catálogo. Solo las activas pueden tener placements publicados." />
          <Kpi label="Slots" value={String(data.totals.slots)} hint="inventario configurado" icon="layout-grid" tip="Superficies publicitarias nativas: pantalla + posición fija donde puede renderizarse un creative." />
          <Kpi label="Placements live" value={String(data.totals.activePlacements)} hint="activos ahora" icon="radio-tower" tip="Campañas en estado activo cuya fecha de inicio/fin incluye hoy. Es lo que ven los usuarios en este momento." />
          <Kpi label="Contratado" value={money(data.totals.bookedAmountCents)} hint="placements no archivados" icon="wallet" tip="Suma del monto contratado de todos los placements que no están archivados, sin importar si están pausados." />
          <Kpi label="Impresiones 30d" value={data.totals.impressions30d.toLocaleString("en-US")} hint="eventos reales" icon="eye" tip="Veces que la app registró una impresión de sponsor en los últimos 30 días. No hay estimaciones ni terceros." />
          <Kpi label="CTR 30d" value={ctr(data.totals.clicks30d, data.totals.impressions30d)} hint={`${data.totals.clicks30d} clics`} icon="mouse-pointer-click" tip="Clics ÷ impresiones en 30 días. Solo placements con URL destino y tracking de clic aportan al numerador." />
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              ● Rate card nativo
              <InfoTip maxWidth={260} text="Guía comercial de referencia para ventas. Cada deal real lo registras como slot + placement con el monto acordado; estos paquetes no crean filas automáticamente." />
            </div>
            <h2 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Paquetes comerciales iniciales<span className="dot">.</span>
            </h2>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {NATIVE_PACKAGES.map((pkg) => (
            <div key={pkg.name} style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)", background: "var(--muted)" }}>
              <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                {pkg.name}<span className="dot">.</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900, color: "var(--primary)" }}>{pkg.price}</div>
              <p style={{ margin: "7px 0 0", fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>{pkg.inventory}</p>
            </div>
          ))}
        </div>
      </div>

      <div ref={panelRef} style={{ display: "flex", flexDirection: "column", gap: 16, scrollMarginTop: 88 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <TabButton active={tab === "placements"} onClick={() => setTab("placements")} label="Placements" count={data.placements.length} />
        <TabButton active={tab === "sponsors"} onClick={() => setTab("sponsors")} label="Marcas" count={data.sponsors.length} />
        <TabButton active={tab === "slots"} onClick={() => setTab("slots")} label="Slots" count={data.slots.length} />
      </div>

      {tab === "placements" && (
        <div className="mp-admin-sponsors-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <SectionHead
              title="Placements vendidos"
              sub="Campañas por slot, estado y ventana de publicación."
              titleTip="Un placement es la campaña concreta: une una marca con un slot, creative, fechas y monto contratado."
            />
            {data.placements.length === 0 ? (
              <EmptyState icon="radio-tower" title="Sin placements" hint="Crea una marca y un slot para vender el primer placement." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "var(--muted)" }}><Th tip="Titular del creative y marca dueña del contrato.">Placement</Th><Th tip="Superficie nativa donde se publica (key técnico entre paréntesis).">Slot</Th><Th tip="Borrador, activo, pausado o archivado. Solo activo dentro de fechas se muestra.">Estado</Th><Th align="right" tip="Impresiones y clics de los últimos 30 días para este placement.">30d</Th><Th align="right" tip="Monto acordado en centavos, moneda del contrato.">Contrato</Th></tr></thead>
                  <tbody>
                    {data.placements.map((placement) => (
                      <tr key={placement.id} onClick={() => setPlacementForm(placementToForm(placement))} style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: placement.id === placementForm.id ? "#fffbeb" : undefined }}>
                        <Td><b>{placement.headline}</b><br /><Small>{placement.sponsorName} · {dateLabel(placement.startsAt)}</Small></Td>
                        <Td><b>{placement.slotLabel}</b><br /><Small>{placement.slotKey}</Small></Td>
                        <Td><Pill status={placement.status} /></Td>
                        <Td align="right"><b>{placement.impressions30d}</b><br /><Small>{placement.clicks30d} clics · {ctr(placement.clicks30d, placement.impressions30d)}</Small></Td>
                        <Td align="right"><b>{money(placement.contractAmountCents, placement.currency)}</b></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <EditorCard title={placementForm.id ? "Editar placement" : "Nuevo placement"} icon="radio-tower">
            <Field label="Marca" tip="Anunciante dueño del creative y del contrato comercial.">
              <select value={placementForm.sponsorId} onChange={(e) => setPlacementForm({ ...placementForm, sponsorId: e.target.value })} style={inputStyle}><option value="">Selecciona marca</option>{data.sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
            <Field label="Slot" tip="Dónde se renderiza en la app (ej. home jugador, listado de clubes).">
              <select value={placementForm.slotId} onChange={(e) => setPlacementForm({ ...placementForm, slotId: e.target.value })} style={inputStyle}><option value="">Selecciona slot</option>{data.slots.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.key}</option>)}</select>
            </Field>
            <Field label="Titular" tip="Texto principal visible en el anuncio.">
              <input value={placementForm.headline} onChange={(e) => setPlacementForm({ ...placementForm, headline: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Texto" tip="Copy secundario o descripción del beneficio.">
              <textarea value={placementForm.body} onChange={(e) => setPlacementForm({ ...placementForm, body: e.target.value })} rows={3} style={inputStyle} />
            </Field>
            <Field label="Inicio" tip="Cuándo empieza a ser elegible para publicarse (si está activo).">
              <input type="datetime-local" value={placementForm.startsAt} onChange={(e) => setPlacementForm({ ...placementForm, startsAt: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Fin opcional" tip="Cuándo deja de publicarse. Vacío = sin fecha de corte.">
              <input type="datetime-local" value={placementForm.endsAt} onChange={(e) => setPlacementForm({ ...placementForm, endsAt: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="URL destino" tip="Link al hacer clic. Debe ser https; alimenta el CTR.">
              <input value={placementForm.targetUrl} onChange={(e) => setPlacementForm({ ...placementForm, targetUrl: e.target.value })} style={inputStyle} placeholder="https://..." />
            </Field>
            <Field label="Monto ctvs" tip="Valor del contrato en centavos (USD 10,00 = 1000).">
              <input type="number" min={0} value={placementForm.contractAmountCents} onChange={(e) => setPlacementForm({ ...placementForm, contractAmountCents: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Prioridad" tip="Si compiten varios placements en el mismo slot, gana el número más alto.">
              <input type="number" value={placementForm.priority} onChange={(e) => setPlacementForm({ ...placementForm, priority: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Estado" tip="Borrador no se ve · Activo publica · Pausado congela · Archivado cierra el ciclo.">
              <select value={placementForm.status} onChange={(e) => setPlacementForm({ ...placementForm, status: e.target.value as PlacementForm["status"] })} style={inputStyle}><option value="draft">Borrador</option><option value="active">Activo</option><option value="paused">Pausado</option><option value="archived">Archivado</option></select>
            </Field>
            <button className="btn btn-primary" disabled={pending || !placementForm.sponsorId || !placementForm.slotId} onClick={savePlacement}><Icon name="save" size={13} color="#fff" />Guardar placement</button>
            {placementForm.id && <StatusActions disabled={pending} activeLabel="Reactivar" pauseLabel="Pausar" archiveLabel="Archivar" onActive={() => run(() => setSponsorPlacementStatus({ placementId: placementForm.id, status: "active" }), "Placement reactivado")} onPause={() => run(() => setSponsorPlacementStatus({ placementId: placementForm.id, status: "paused" }), "Placement pausado")} onArchive={() => run(() => setSponsorPlacementStatus({ placementId: placementForm.id, status: "archived" }), "Placement archivado")} />}
          </EditorCard>
        </div>
      )}

      {tab === "sponsors" && (
        <div className="mp-admin-sponsors-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }}>
          <ListCard title="Catálogo de marcas" emptyTitle="Sin marcas" emptyHint="Crea una marca para empezar a vender placements." titleTip="Ficha del anunciante: contacto, branding y estado comercial. Sin marca no puedes crear placements.">
            {data.sponsors.map((sponsor) => (
              <button key={sponsor.id} onClick={() => setSponsorForm(sponsorToForm(sponsor))} style={rowButtonStyle(sponsor.id === sponsorForm.id)}>
                <span><b>{sponsor.name}</b><Small>/{sponsor.slug}{sponsor.contactEmail ? ` · ${sponsor.contactEmail}` : ""}</Small></span>
                <Pill status={sponsor.status} />
              </button>
            ))}
          </ListCard>
          <EditorCard title={sponsorForm.id ? "Editar marca" : "Nueva marca"} icon="badge-dollar-sign">
            <Field label="Nombre" tip="Nombre comercial que verás en listados y contratos.">
              <input value={sponsorForm.name} onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Slug" tip="Identificador en URL. Se autogenera del nombre si lo dejas vacío.">
              <input value={sponsorForm.slug} onChange={(e) => setSponsorForm({ ...sponsorForm, slug: e.target.value })} style={inputStyle} placeholder="se-genera-si-lo-dejas-vacio" />
            </Field>
            <Field label="Web pública" tip="Sitio del anunciante; puede usarse en reportes o validación.">
              <input value={sponsorForm.websiteUrl} onChange={(e) => setSponsorForm({ ...sponsorForm, websiteUrl: e.target.value })} style={inputStyle} placeholder="https://..." />
            </Field>
            <Field label="Logo URL" tip="Imagen del logo para creatives o documentación interna.">
              <input value={sponsorForm.logoUrl} onChange={(e) => setSponsorForm({ ...sponsorForm, logoUrl: e.target.value })} style={inputStyle} placeholder="https://..." />
            </Field>
            <Field label="Color marca" tip="Hex de referencia para previews (#111827).">
              <input value={sponsorForm.brandColor} onChange={(e) => setSponsorForm({ ...sponsorForm, brandColor: e.target.value })} style={inputStyle} placeholder="#111827" />
            </Field>
            <Field label="Contacto" tip="Persona de referencia del lado del anunciante.">
              <input value={sponsorForm.contactName} onChange={(e) => setSponsorForm({ ...sponsorForm, contactName: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Email contacto" tip="Canal operativo para coordinación comercial.">
              <input value={sponsorForm.contactEmail} onChange={(e) => setSponsorForm({ ...sponsorForm, contactEmail: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Notas internas" tip="Contexto para el equipo admin; no se muestra al usuario final.">
              <textarea value={sponsorForm.notes} onChange={(e) => setSponsorForm({ ...sponsorForm, notes: e.target.value })} rows={3} style={inputStyle} />
            </Field>
            <button className="btn btn-primary" disabled={pending} onClick={saveSponsor}><Icon name="save" size={13} color="#fff" />Guardar marca</button>
            {sponsorForm.id && <StatusActions disabled={pending} activeLabel="Reactivar" pauseLabel="Pausar" archiveLabel="Archivar" onActive={() => run(() => setSponsorStatus({ sponsorId: sponsorForm.id, status: "active" }), "Marca reactivada")} onPause={() => run(() => setSponsorStatus({ sponsorId: sponsorForm.id, status: "paused" }), "Marca pausada")} onArchive={() => run(() => setSponsorStatus({ sponsorId: sponsorForm.id, status: "archived" }), "Marca archivada")} />}
          </EditorCard>
        </div>
      )}

      {tab === "slots" && (
        <div className="mp-admin-sponsors-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }}>
          <ListCard title="Inventario de slots" emptyTitle="Sin slots" emptyHint="Crea superficies publicitarias antes de vender placements." titleTip="Define dónde puede aparecer publicidad en la app: key técnico, cupos simultáneos y precio base de referencia.">
            {data.slots.map((slot) => (
              <button key={slot.id} onClick={() => setSlotForm(slotToForm(slot))} style={rowButtonStyle(slot.id === slotForm.id)}>
                <span><b>{slot.label}</b><Small>{slot.key} · {slot.activePlacementCount}/{slot.maxActivePlacements} activos</Small></span>
                <span style={{ fontSize: 10, fontWeight: 900, color: slot.isActive ? "#047857" : "var(--muted-fg)" }}>{slot.isActive ? "Activo" : "Inactivo"}</span>
              </button>
            ))}
          </ListCard>
          <EditorCard title={slotForm.id ? "Editar slot" : "Nuevo slot"} icon="layout-grid">
            <Field label="Key técnico" tip="Clave que usa el código (ej. dashboard_user_home). Evita cambiarla en producción sin migrar placements.">
              <input value={slotForm.key} onChange={(e) => setSlotForm({ ...slotForm, key: e.target.value })} style={inputStyle} placeholder="dashboard_user_home" />
            </Field>
            <Field label="Superficie" tip="Módulo o pantalla padre donde vive el slot (dashboard, torneo, ranking…).">
              <input value={slotForm.surface} onChange={(e) => setSlotForm({ ...slotForm, surface: e.target.value })} style={inputStyle} placeholder="dashboard" />
            </Field>
            <Field label="Nombre visible" tip="Etiqueta humana para el panel admin y reportes comerciales.">
              <input value={slotForm.label} onChange={(e) => setSlotForm({ ...slotForm, label: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Descripción" tip="Qué incluye el inventario y restricciones creativas.">
              <textarea value={slotForm.description} onChange={(e) => setSlotForm({ ...slotForm, description: e.target.value })} rows={3} style={inputStyle} />
            </Field>
            <Field label="Cupos activos" tip="Cuántos placements activos pueden coexistir en este slot a la vez.">
              <input type="number" min={1} value={slotForm.maxActivePlacements} onChange={(e) => setSlotForm({ ...slotForm, maxActivePlacements: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Precio base ctvs" tip="Tarifa de referencia en centavos; el monto real del deal va en cada placement.">
              <input type="number" min={0} value={slotForm.basePriceCents} onChange={(e) => setSlotForm({ ...slotForm, basePriceCents: e.target.value })} style={inputStyle} />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={slotForm.isActive} onChange={(e) => setSlotForm({ ...slotForm, isActive: e.target.checked })} />
              <LabelWithTip tip="Si está apagado, no se ofrece inventario nuevo aunque existan placements históricos.">Slot disponible</LabelWithTip>
            </label>
            <button className="btn btn-primary" disabled={pending} onClick={saveSlot}><Icon name="save" size={13} color="#fff" />Guardar slot</button>
          </EditorCard>
        </div>
      )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, icon, tip }: { label: string; value: string; hint: string; icon: string; tip?: string }) {
  return (
    <div className="card" style={{ padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, flex: 1 }}>
          <span className="label-mp" style={{ fontSize: 9, letterSpacing: "0.1em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {label}
          </span>
          {tip ? <InfoTip text={tip} maxWidth={240} /> : null}
        </span>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={icon} size={12} />
        </span>
      </div>
      <div className="font-heading" style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 10, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hint}</p>
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} style={{ padding: "8px 13px", borderRadius: 999, border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`, background: active ? "#0a0a0a" : "#fff", color: active ? "#fff" : "#0a0a0a", fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
      {label} <span style={{ opacity: 0.7 }}>{count}</span>
    </button>
  );
}

function SectionHead({ title, sub, titleTip }: { title: string; sub: string; titleTip?: string }) {
  return (
    <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
      <h2 className="font-heading" style={{ margin: 0, fontSize: 17, fontWeight: 900, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
        {title}<span className="dot">.</span>
        {titleTip ? <InfoTip text={titleTip} maxWidth={260} /> : null}
      </h2>
      <p style={{ margin: "4px 0 0", color: "var(--muted-fg)", fontSize: 12 }}>{sub}</p>
    </div>
  );
}

function EditorCard({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  // Sticky lateral: si el formulario supera el viewport, scroll interno en vez de
  // dejar que el sticky empuje el top por encima del TopBar (bug visual top<0).
  return (
    <div
      className="card"
      style={{
        position: "sticky",
        top: 76,
        alignSelf: "start",
        maxHeight: "calc(100dvh - 76px - 1.75rem)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 0,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 16px 0", flexShrink: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={14} />
        </span>
        <h2 className="font-heading" style={{ margin: 0, fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>{title}<span className="dot">.</span></h2>
      </div>
      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0,
          minWidth: 0,
          flex: 1,
          overscrollBehavior: "contain",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ListCard({ title, emptyTitle, emptyHint, titleTip, children }: { title: string; emptyTitle: string; emptyHint: string; titleTip?: string; children: ReactNode[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <SectionHead title={title} sub="Datos reales del backend de sponsors." titleTip={titleTip} />
      {children.length > 0 ? <div style={{ display: "flex", flexDirection: "column" }}>{children}</div> : <EmptyState icon="inbox" title={emptyTitle} hint={emptyHint} />}
    </div>
  );
}

function Field({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-fg)", minWidth: 0 }}>
      <LabelWithTip tip={tip}>{label}</LabelWithTip>
      {children}
    </label>
  );
}

function StatusActions({ disabled, activeLabel, pauseLabel, archiveLabel, onActive, onPause, onArchive }: { disabled: boolean; activeLabel: string; pauseLabel: string; archiveLabel: string; onActive: () => void; onPause: () => void; onArchive: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn" disabled={disabled} onClick={onActive}>{activeLabel}</button>
      <button className="btn" disabled={disabled} onClick={onPause}>{pauseLabel}</button>
      <button className="btn" disabled={disabled} onClick={onArchive}>{archiveLabel}</button>
    </div>
  );
}

function Th({ children, align, tip }: { children: ReactNode; align?: "left" | "right"; tip?: string }) {
  return (
    <th style={{ padding: "10px 14px", textAlign: align ?? "left", color: "var(--muted-fg)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
        <span style={{ whiteSpace: "nowrap" }}>{children}</span>
        {tip ? <InfoTip text={tip} maxWidth={240} /> : null}
      </span>
    </th>
  );
}

function Td({ children, align }: { children: ReactNode; align?: "left" | "right" }) {
  return <td style={{ padding: "12px 14px", textAlign: align ?? "left", verticalAlign: "middle" }}>{children}</td>;
}

function Small({ children }: { children: ReactNode }) {
  return <span style={{ display: "block", marginTop: 3, color: "var(--muted-fg)", fontSize: 10.5 }}>{children}</span>;
}

const inputStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "9px 10px",
  fontFamily: "inherit",
  fontSize: 12,
  outline: "none",
  background: "#fff",
};

function rowButtonStyle(active: boolean): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    border: 0,
    borderTop: "1px solid var(--border)",
    background: active ? "#fffbeb" : "#fff",
    padding: "13px 16px",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
  };
}
