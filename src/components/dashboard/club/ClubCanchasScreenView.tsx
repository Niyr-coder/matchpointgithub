"use client";
// Owner · Canchas v2 — rediseño 1:1 del kit (ui_kits/dashboard/ClubCanchasScreen.jsx).
// Estado en vivo con SVG real de pickleball por cancha (colores customizables,
// mig 168), tabs Galería/Agenda/Floorplan, drawer de detalle, bloqueo masivo.
//
// Backend cableado: createCourt + updateCourt (incluye appearance) +
// setCourtMaintenance + clearCourtMaintenance + bulkSetCourtMaintenance.
// "Now playing" y "Next slot" derivan de reservations (incluye kind mig 167).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import {
  bulkSetCourtMaintenance,
  clearCourtMaintenance,
  createCourt,
  createCourtBlocker,
  setCourtMaintenance,
  setCourtPricing,
  updateCourt,
} from "@/server/actions/courts";

// Pricing band para una cancha (court_pricing row). day_of_week null = todos los días.
export type PricingBand = {
  id?: string;
  dayOfWeek: number | null;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  durationMinutes: number;
  currency: string;
  active: boolean;
};

export type CourtCard = {
  id: string;
  name: string;
  sport: "pickleball" | "padel" | "tennis";
  surf: string;
  lights: boolean;
  active: boolean;
  priceCents: number | null;
  hours: string;
  util: number;
  status: "busy" | "free" | "maintenance" | "closed";
  surfaceColor: string;
  linesColor: string;
  lineStyle: string;
  strokeWidth: number;
  maintenanceReason: string | null;
  maintenanceUntil: string | null;
  bookingsToday: number;
  revenueTodayCents: number;
  nowPlaying: { who: string; startMs: number; endMs: number; kind: string } | null;
  nextSlot: { who: string; startMs: number; kind: string } | null;
  // Drawer: agenda completa del día + historial de mantenimientos (mig 169).
  todaySlots: Array<{
    id: string;
    startMs: number;
    endMs: number;
    kind: string;
    who: string;
    notes: string | null;
  }>;
  maintenanceLog: Array<{
    id: string;
    reason: string | null;
    startsAt: string;
    expectedUntil: string | null;
    endedAt: string | null;
  }>;
  // Tarifas activas e inactivas: la edición usa setCourtPricing (replace-all).
  pricingBands: PricingBand[];
};

export type CanchasData = {
  clubId: string | null;
  courts: CourtCard[];
};

// Tabs alineados al UX Kit Ola A (MAT-3 §4): "Vista pública" (preserva el SVG
// rediseñado), "Gestión" (cards operativas con CRUD inline), "Tarifas" (editor
// de bands court_pricing). Agenda + Floorplan se mantienen como vistas
// adicionales del rediseño previo — siguen siendo útiles y no contradicen el
// UX kit ("no destruir el rediseño").
type View = "publica" | "gestion" | "tarifas" | "schedule" | "floorplan";

const STATUS_META: Record<CourtCard["status"], { c: string; l: string; bg: string }> = {
  busy: { c: "#dc2626", l: "En juego", bg: "rgba(220,38,38,0.12)" },
  free: { c: "#10b981", l: "Libre", bg: "rgba(16,185,129,0.12)" },
  maintenance: { c: "#92400e", l: "Mantenimiento", bg: "#fef3c7" },
  closed: { c: "#737373", l: "Cerrada", bg: "var(--muted)" },
};

function fmtMoney(cents: number): string {
  if (cents === 0) return "$0";
  const n = cents / 100;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString("es-EC")}`;
}

function fmtHM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Countdown legible. <60min → "Termina en X min"; >=60min → "Termina en Xh Ymin";
// negativo/0 → "Terminando". renderedAt se actualiza con realtime, así que el
// número se va achicando solo cuando llega un cambio en reservations.
function fmtRemaining(deltaMs: number): string {
  if (deltaMs <= 0) return "Terminando";
  const totalMin = Math.ceil(deltaMs / 60000);
  if (totalMin < 60) return `Termina en ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `Termina en ${h}h` : `Termina en ${h}h ${m}min`;
}

export function ClubCanchasScreenView({ data }: { data: CanchasData }) {
  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "courts", filter: `club_id=eq.${data.clubId}` },
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<View>("publica");
  const [openCourt, setOpenCourt] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const courts = data.courts;
  const total = courts.length;
  const busy = courts.filter((c) => c.status === "busy").length;
  const maint = courts.filter((c) => c.status === "maintenance").length;
  const revenueTodayCents = courts.reduce((s, c) => s + c.revenueTodayCents, 0);
  const bookingsToday = courts.reduce((s, c) => s + c.bookingsToday, 0);

  // ── Helpers de acción (todos llaman server actions reales) ──
  // Tarifa inline en el form de creación (UX kit §4.4): el form recoge diurna
  // + nocturna con franja, y aquí persistimos como 2 bands de court_pricing.
  // Si el alta falla no se intenta el pricing.
  const handleCreate = (form: {
    code: string;
    sport: "pickleball" | "padel" | "tennis";
    indoor: boolean;
    lights: boolean;
    surface: string;
    pricing: {
      currency: string;
      dayStart: string;
      dayEnd: string;
      dayPriceCents: number;
      nightPriceCents: number;
    } | null;
  }) => {
    if (!data.clubId) return;
    startTransition(async () => {
      const r = await createCourt({
        clubId: data.clubId,
        code: form.code.trim(),
        sport: form.sport,
        indoor: form.indoor,
        lights: form.lights,
        surface: form.surface.trim() || undefined,
      });
      if (!r.ok) {
        const msg =
          r.error.code === "COURTS.DUPLICATE_CODE"
            ? "Ya existe una cancha con ese código en este club"
            : r.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: msg });
        return;
      }
      toast({ icon: "check-circle-2", title: "Cancha creada", sub: r.data.code });
      // Seed inicial de bandas (best-effort: si falla no rompemos el alta —
      // el owner puede editar tarifas después desde el tab "Tarifas").
      if (form.pricing) {
        const p = form.pricing;
        const dayBand = {
          dayOfWeek: null,
          startsAt: p.dayStart,
          endsAt: p.dayEnd,
          priceCents: p.dayPriceCents,
          durationMinutes: 60,
          currency: p.currency,
          active: true,
        };
        // Banda nocturna: del fin del diurno hasta justo antes de dayStart del
        // día siguiente (envuelve la medianoche). Para evitar wrap-around en
        // SQL time, partimos en 2 fragmentos.
        const nightBands = [
          {
            dayOfWeek: null,
            startsAt: p.dayEnd,
            endsAt: "23:59:59",
            priceCents: p.nightPriceCents,
            durationMinutes: 60,
            currency: p.currency,
            active: true,
          },
          {
            dayOfWeek: null,
            startsAt: "00:00:00",
            endsAt: p.dayStart,
            priceCents: p.nightPriceCents,
            durationMinutes: 60,
            currency: p.currency,
            active: true,
          },
        ].filter((b) => b.endsAt > b.startsAt);
        const pr = await setCourtPricing({
          courtId: r.data.id,
          bands: [dayBand, ...nightBands],
        });
        if (!pr.ok) {
          toast({
            icon: "alert-triangle",
            title: "Tarifas pendientes",
            sub: "Cancha creada pero no se pudieron grabar las tarifas. Edítalas desde Tarifas.",
          });
        }
      }
      setShowAdd(false);
      router.refresh();
    });
  };

  // Reemplaza todas las bands de una cancha (replace-all transacción lógica).
  const handleSetPricing = (
    courtId: string,
    bands: PricingBand[],
    onDone?: () => void,
  ) => {
    startTransition(async () => {
      const r = await setCourtPricing({ courtId, bands });
      if (!r.ok) {
        const msg =
          r.error.code === "COURTS.PRICING_OVERLAP"
            ? "Hay franjas de tarifa que se solapan"
            : r.error.message;
        toast({ icon: "alert-triangle", title: "No se pudieron guardar", sub: msg });
        return;
      }
      toast({ icon: "check-circle-2", title: "Tarifas guardadas" });
      router.refresh();
      onDone?.();
    });
  };

  const handleToggleActive = (court: CourtCard) => {
    startTransition(async () => {
      const r = await updateCourt({
        courtId: court.id,
        patch: { active: !court.active },
      });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo", sub: r.error.message });
        return;
      }
      toast({
        icon: court.active ? "ban" : "check-circle-2",
        title: court.active ? "Cancha bloqueada" : "Cancha reabierta",
        sub: court.name,
      });
      router.refresh();
    });
  };

  const handleMaintenance = (
    court: CourtCard,
    reason: string,
    until: string | null,
  ) => {
    startTransition(async () => {
      const r = await setCourtMaintenance({
        courtId: court.id,
        reason: reason.trim() || undefined,
        until: until ?? null,
      });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo", sub: r.error.message });
        return;
      }
      toast({ icon: "wrench", title: "En mantenimiento", sub: court.name });
      router.refresh();
    });
  };

  const handleClearMaintenance = (court: CourtCard) => {
    startTransition(async () => {
      const r = await clearCourtMaintenance({ courtId: court.id });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo", sub: r.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Cancha reabierta", sub: court.name });
      router.refresh();
    });
  };

  const handleBulkBlock = (
    courtIds: string[],
    reason: string,
    until: string | null,
  ) => {
    startTransition(async () => {
      const r = await bulkSetCourtMaintenance({
        courtIds,
        reason: reason.trim() || undefined,
        until: until ?? null,
      });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo", sub: r.error.message });
        return;
      }
      toast({ icon: "wrench", title: `${r.data.updated} canchas en mantenimiento` });
      setShowBulk(false);
      router.refresh();
    });
  };

  // Drawer: edit (updateCourt acepta todos los campos, incluido appearance).
  const handleUpdateCourt = (
    courtId: string,
    patch: Partial<{
      code: string;
      sport: "pickleball" | "padel" | "tennis";
      surface: string | null;
      indoor: boolean;
      lights: boolean;
      active: boolean;
      surfaceColor: string;
      linesColor: string;
      lineStyle: "classic" | "showcourt" | "minimal";
      strokeWidth: number;
    }>,
  ) => {
    startTransition(async () => {
      const r = await updateCourt({ courtId, patch });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: r.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Cancha actualizada", sub: r.data.code });
      router.refresh();
    });
  };

  // Drawer: bloquear slot específico (genera reservation kind=event/class).
  const handleCreateBlocker = (
    courtId: string,
    startsAt: string,
    endsAt: string,
    kind: "event" | "class",
    notes: string,
  ) => {
    startTransition(async () => {
      const r = await createCourtBlocker({
        courtId,
        startsAt,
        endsAt,
        kind,
        notes: notes.trim() || undefined,
      });
      if (!r.ok) {
        const msg =
          r.error.code === "COURTS.BLOCKER_OVERLAP"
            ? "Ese horario ya está reservado"
            : r.error.code === "COURTS.BLOCKER_INVALID_RANGE"
              ? "El horario fin debe ser después del inicio"
              : r.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo bloquear", sub: msg });
        return;
      }
      toast({ icon: "ban", title: "Slot bloqueado" });
      router.refresh();
    });
  };

  return (
    <div className="mp-canchas-screen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── HEADER ── */}
      <div>
        <div className="mp-canchas-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div className="mp-canchas-header-copy">
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● {total} {total === 1 ? "cancha" : "canchas"} · {busy} ocupada
              {busy === 1 ? "" : "s"} ahora
            </div>
            <h1
              className="font-heading mp-canchas-title"
              style={{
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                lineHeight: 1,
                margin: "8px 0 0",
              }}
            >
              Canchas<span className="dot">.</span>
            </h1>
          </div>
          <div className="mp-canchas-actions" style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowBulk(true)}
              disabled={total === 0}
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                opacity: total === 0 ? 0.5 : 1,
              }}
            >
              <Icon name="calendar-range" size={13} />
              Bloqueo masivo
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="btn btn-primary"
            >
              <Icon name="plus" size={13} color="#fff" />
              Agregar cancha
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="mp-canchas-kpis">
        <div className="mp-canchas-kpi-hero">
          <OccupancyHero occupied={busy} total={total} maintenance={maint} />
        </div>
        <CCKpi
          icon="dollar-sign"
          label="Revenue hoy"
          value={fmtMoney(revenueTodayCents)}
          sub={
            bookingsToday > 0
              ? `${bookingsToday} ${bookingsToday === 1 ? "reserva" : "reservas"}`
              : "Sin reservas aún"
          }
          emerald
        />
        <CCKpi
          icon="calendar-check"
          label="Reservas hoy"
          value={String(bookingsToday)}
          sub={
            courts.find((c) => c.nextSlot)?.nextSlot
              ? `Próxima: ${fmtHM(courts.find((c) => c.nextSlot)!.nextSlot!.startMs)}`
              : "Sin reservas pendientes"
          }
        />
        <CCKpi
          icon="alert-triangle"
          label="Mantenimiento"
          value={String(maint)}
          sub={maint > 0 ? `${maint} cancha${maint === 1 ? "" : "s"}` : "Todo OK"}
          warn={maint > 0}
        />
      </div>

      {/* ── VIEW TABS ── */}
      <div
        className="mp-canchas-tabs"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {(
          [
            { k: "publica", l: "Vista pública", i: "layout-grid" },
            { k: "schedule", l: "Agenda hoy", i: "calendar-days" },
            { k: "tarifas", l: "Tarifas", i: "dollar-sign" },
            { k: "floorplan", l: "Plano del club", i: "map" },
            { k: "gestion", l: "Gestión", i: "list-checks" },
          ] as Array<{ k: View; l: string; i: string }>
        ).map((t) => {
          const on = view === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setView(t.k)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "11px 14px",
                background: "transparent",
                border: 0,
                borderBottom: "2px solid " + (on ? "#0a0a0a" : "transparent"),
                color: on ? "#0a0a0a" : "var(--muted-fg)",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: on ? 900 : 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              <Icon name={t.i} size={12} />
              {t.l}
            </button>
          );
        })}
      </div>

      {courts.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <>
          {view === "gestion" && (
            <ManagementView
              courts={courts}
              onOpen={setOpenCourt}
              onToggleActive={handleToggleActive}
            />
          )}
          {view === "publica" && (
            <PublicView
              courts={courts}
              onOpen={setOpenCourt}
              onToggleActive={handleToggleActive}
            />
          )}
          {view === "tarifas" && (
            <PricingTab
              courts={courts}
              onSetPricing={handleSetPricing}
              pending={pending}
            />
          )}
          {view === "schedule" && <ScheduleView courts={courts} />}
          {view === "floorplan" && <FloorplanView courts={courts} onOpen={setOpenCourt} />}
        </>
      )}

      {openCourt && (
        <CourtDrawer
          c={courts.find((x) => x.id === openCourt)!}
          close={() => setOpenCourt(null)}
          onMaintenance={handleMaintenance}
          onClearMaintenance={handleClearMaintenance}
          onToggleActive={handleToggleActive}
          onUpdate={handleUpdateCourt}
          onCreateBlocker={handleCreateBlocker}
          pending={pending}
        />
      )}
      {showAdd && (
        <AddCourtModal close={() => setShowAdd(false)} onCreate={handleCreate} pending={pending} />
      )}
      {showBulk && (
        <BulkBlockModal
          courts={courts.filter((c) => c.status !== "maintenance")}
          close={() => setShowBulk(false)}
          onBlock={handleBulkBlock}
          pending={pending}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="card"
      style={{
        padding: 40,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          width: 60,
          height: 60,
          borderRadius: 12,
          background: "var(--muted)",
          color: "var(--muted-fg)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="square" size={26} color="var(--muted-fg)" />
      </span>
      <div
        className="font-heading"
        style={{
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
        }}
      >
        Sin canchas todavía<span className="dot">.</span>
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--muted-fg)",
          maxWidth: 380,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Agrega tu primera cancha para empezar a recibir reservas. Vas a poder
        configurar superficie, color, precio y horarios.
      </p>
      <button onClick={onAdd} className="btn btn-primary" style={{ marginTop: 4 }}>
        <Icon name="plus" size={13} color="#fff" />
        Agregar primera cancha
      </button>
    </div>
  );
}

function OccupancyHero({
  occupied,
  total,
  maintenance,
}: {
  occupied: number;
  total: number;
  maintenance: number;
}) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const freeCount = Math.max(0, total - occupied - maintenance);
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 14.4,
        background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
        color: "#fff",
        padding: 18,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.32), transparent 55%)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="label-mp" style={{ color: "#34d399" }}>
            ● Ocupación ahora
          </span>
        </div>
        <div
          className="font-heading tabular mp-canchas-occ-statline"
          style={{
            fontSize: 38,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            marginTop: 8,
            display: "flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: "4px 8px",
          }}
        >
          {occupied}
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 22 }}>/{total}</span>
          <span
            className="mp-canchas-occ-sub"
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 700,
              marginLeft: 8,
            }}
          >
            canchas · {pct}%
          </span>
        </div>
        <div
          style={{
            marginTop: 14,
            height: 10,
            borderRadius: 9999,
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
            display: "flex",
          }}
        >
          {Array.from({ length: Math.max(total, 1) }).map((_, i) => {
            const isMaint = total > 0 && i >= total - maintenance;
            const isOcc = i < occupied;
            const bg = isMaint ? "#dc2626" : isOcc ? "#10b981" : "rgba(255,255,255,0.15)";
            return (
              <div
                key={i}
                style={{ flex: 1, background: bg, marginRight: i < total - 1 ? 2 : 0 }}
              />
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
          <span style={{ color: "#34d399", fontWeight: 700 }}>
            {occupied} ocupada{occupied === 1 ? "" : "s"}
          </span>{" "}
          · {freeCount} libre{freeCount === 1 ? "" : "s"} · {maintenance} en mant.
        </div>
      </div>
    </div>
  );
}

function CCKpi({
  icon,
  label,
  value,
  sub,
  emerald,
  warn,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  emerald?: boolean;
  warn?: boolean;
}) {
  const c = emerald ? "#047857" : warn ? "#92400e" : "#0a0a0a";
  const bg = emerald ? "rgba(16,185,129,0.12)" : warn ? "#fef3c7" : "var(--muted)";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span className="label-mp">{label}</span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: bg,
            color: c,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: "-0.025em",
          color: c,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// ── SVG de cancha — estilo vectorial limpio (mismo lenguaje que el
// CourtMatchup de QuedadaManagePanel): perímetro + red + líneas de cocina +
// líneas centrales de servicio en stroke fino. Sin relleno de superficie.
// Mantiene los props legacy (surface/lines/stroke/lineStyle) para no romper
// callers, pero ahora `surface` = color de FONDO de la cancha (no del path),
// `lines` = color de las líneas, y `stroke`/`lineStyle` controlan grosor.
function CourtSVG({
  lines = "#0a0a0a",
  stroke = 1.5,
  players = [],
  width = "100%",
  height = "auto",
}: {
  surface?: string;
  lines?: string;
  stroke?: number;
  lineStyle?: string;
  players?: { x: number; y: number; color: string }[];
  width?: string;
  height?: string;
}) {
  const lineProps = {
    stroke: lines,
    strokeWidth: stroke,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <svg
      viewBox="0 0 480 224"
      width={width}
      height={height === "auto" ? undefined : height}
      style={{ display: "block", height: height === "auto" ? "auto" : undefined }}
    >
      <g fill="none" strokeLinejoin="miter">
        {/* perímetro */}
        <rect x={6} y={6} width={468} height={212} {...lineProps} />
        {/* red (centro) */}
        <line x1={240} y1={6} x2={240} y2={218} {...lineProps} />
        {/* líneas de cocina (a cada lado de la red) */}
        <line x1={170} y1={6} x2={170} y2={218} {...lineProps} />
        <line x1={310} y1={6} x2={310} y2={218} {...lineProps} />
        {/* líneas centrales de servicio (baseline → cocina) */}
        <line x1={6} y1={112} x2={170} y2={112} {...lineProps} />
        <line x1={310} y1={112} x2={474} y2={112} {...lineProps} />
      </g>
      {/* Player dots opcionales (status=busy en cards). Coords reproyectadas
          al viewBox 480×224 — los originales eran 903×419. */}
      {players.map((p, i) => {
        const cx = (p.x / 903) * 480;
        const cy = (p.y / 419) * 224;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={8}
            fill={p.color}
            stroke="#fff"
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
function GalleryView({
  courts,
  onOpen,
  onToggleActive,
}: {
  courts: CourtCard[];
  onOpen: (id: string) => void;
  onToggleActive: (c: CourtCard) => void;
}) {
  return (
    <div className="mp-canchas-gallery" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {courts.map((c, index) => (
        <GalleryCard
          key={c.id}
          c={c}
          displayNo={index + 1}
          onClick={() => onOpen(c.id)}
          onToggleActive={() => onToggleActive(c)}
        />
      ))}
    </div>
  );
}

function GalleryCard({
  c,
  displayNo,
  onClick,
  onToggleActive,
}: {
  c: CourtCard;
  displayNo: number;
  onClick: () => void;
  onToggleActive: () => void;
}) {
  // Tick cada 60s para que el countdown "Termina en X min" y la progress
  // bar se actualicen aunque no llegue ningún evento realtime. Date.now()
  // no se puede llamar en el body del render (react-hooks/purity).
  const [renderedAt, setRenderedAt] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setRenderedAt(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const st = STATUS_META[c.status];
  const players =
    c.status === "busy"
      ? [
          { x: 160, y: 200, color: "#fbbf24" },
          { x: 730, y: 200, color: "#ec4899" },
        ]
      : [];
  // Número editorial: posición en la lista (orden `ordinal` del backend), no el code/nombre.
  const numPadded = String(displayNo).padStart(2, "0");
  // Caption del frame editorial: "PICKLEBALL · OUTDOOR" / "TENIS · INDOOR" etc.
  const SPORT_LABEL_UPPER: Record<typeof c.sport, string> = {
    pickleball: "PICKLEBALL",
    padel: "PÁDEL",
    tennis: "TENIS",
  };
  const surfFirst = c.surf.split(" · ")[0] ?? "";
  const frameCaption = `${SPORT_LABEL_UPPER[c.sport]} · ${surfFirst.toUpperCase()}`;
  // Meta itálica del body: combina precio + horarios + lo que esté pasando.
  let metaLine: string;
  if (c.status === "maintenance") {
    metaLine =
      c.maintenanceReason ??
      (c.maintenanceUntil
        ? `Vuelve ${new Date(c.maintenanceUntil).toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}`
        : "Cerrada por mantenimiento");
  } else if (c.status === "busy" && c.nowPlaying) {
    const kindLabel =
      c.nowPlaying.kind === "class"
        ? "Clase"
        : c.nowPlaying.kind === "event"
          ? "Evento"
          : "En juego";
    metaLine = `${c.nowPlaying.who} · ${kindLabel} hasta ${fmtHM(c.nowPlaying.endMs)}`;
  } else if (c.status === "free" && c.nextSlot) {
    metaLine = `$${c.priceCents != null ? Math.round(c.priceCents / 100) : "—"} / hora · próxima reserva ${fmtHM(c.nextSlot.startMs)} · ${c.nextSlot.who}`;
  } else {
    metaLine =
      c.priceCents != null
        ? `$${Math.round(c.priceCents / 100)} por hora · ${c.hours}`
        : c.hours;
  }
  const sessionProgress =
    c.nowPlaying && c.nowPlaying.endMs > c.nowPlaying.startMs
      ? Math.min(
          100,
          ((renderedAt - c.nowPlaying.startMs) /
            (c.nowPlaying.endMs - c.nowPlaying.startMs)) *
            100,
        )
      : 0;

  const frameDim = c.status === "maintenance" || !c.active;

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
      }}
      onClick={onClick}
    >
      {/* ── TOP (V2 NYT-Mag): número gigante 110px + info al lado ── */}
      <div
        className="mp-canchas-gallery-head"
        style={{
          display: "grid",
          gridTemplateColumns: "110px 1fr",
          gap: 10,
          padding: "22px 22px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="font-heading mp-canchas-gallery-num"
          style={{
            fontWeight: 900,
            fontSize: 84,
            letterSpacing: "-0.08em",
            lineHeight: 0.78,
            color: "#0a0a0a",
          }}
        >
          {numPadded}
          <span style={{ color: "var(--primary)" }}>.</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minWidth: 0,
          }}
        >
          <div>
            <div
              className="font-heading"
              style={{
                fontSize: 14,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {frameCaption}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--muted-fg)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.priceCents != null
                ? `${c.hours} · $${Math.round(c.priceCents / 100)}/h`
                : c.hours}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
              gap: 8,
            }}
          >
            <span
              style={{
                padding: "3px 9px",
                borderRadius: 9999,
                background: st.bg,
                color: st.c,
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: st.c,
                }}
              />
              {st.l}
            </span>
            {(() => {
              const sub =
                c.status === "busy" && c.nowPlaying
                  ? `termina ${fmtHM(c.nowPlaying.endMs)}`
                  : c.status === "free" && c.nextSlot
                    ? `→ próxima ${fmtHM(c.nextSlot.startMs)}`
                    : c.status === "maintenance" && c.maintenanceUntil
                      ? `vuelve ${new Date(c.maintenanceUntil).toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}`
                      : null;
              if (!sub) return null;
              return (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted-fg)",
                    fontFamily: "ui-monospace, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sub}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── COURT BLOCK: SVG centrado con padding ── */}
      <div
        style={{
          padding: "16px 22px 8px",
          opacity: frameDim ? 0.55 : 1,
        }}
      >
        <CourtSVG
          surface={c.surfaceColor}
          stroke={c.strokeWidth}
          lineStyle={c.lineStyle}
          players={players}
        />
      </div>

      {/* ── Panel "EN JUEGO" denso (busy + nowPlaying): pill + jugadores +
          progress bar. Reemplaza la línea meta italic anterior cuando hay
          sesión activa. ── */}
      {c.status === "busy" && c.nowPlaying ? (
        <div style={{ padding: "0 22px 6px" }}>
          <div
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "10px 12px 0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 9.5,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#dc2626",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#dc2626",
                  }}
                />
                {c.nowPlaying.kind === "class"
                  ? "Clase"
                  : c.nowPlaying.kind === "event"
                    ? "Evento"
                    : "En juego"}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.55)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {fmtRemaining(c.nowPlaying.endMs - renderedAt)}
              </span>
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: "-0.005em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.nowPlaying.who}
            </div>
            <div
              style={{
                height: 3,
                background: "rgba(255,255,255,0.12)",
                borderRadius: 2,
                marginTop: 10,
                marginLeft: -12,
                marginRight: -12,
                marginBottom: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${sessionProgress}%`,
                  height: "100%",
                  background: "#dc2626",
                  transition: "width 200ms linear",
                }}
              />
            </div>
          </div>
        </div>
      ) : c.status === "maintenance" ? (
        <div
          style={{
            padding: "0 22px 6px",
            fontSize: 11,
            color: "var(--muted-fg)",
            fontStyle: "italic",
          }}
        >
          {metaLine}
        </div>
      ) : null}

      {/* ── STATS: valores alineados abajo aunque el label haga wrap ── */}
      <div style={{ display: "flex", padding: "0 22px 14px", gap: 22 }}>
        {[
          {
            key: "util",
            label: "Utilización",
            value: `${c.util}%`,
            color:
              c.util > 80
                ? "var(--primary)"
                : c.util > 60
                  ? "#fbbf24"
                  : "var(--muted-fg)",
          },
          {
            key: "rev",
            label: "Revenue hoy",
            value: fmtMoney(c.revenueTodayCents),
            color: "#0a0a0a",
          },
          {
            key: "book",
            label: "Reservas",
            value: String(c.bookingsToday),
            color: "#0a0a0a",
          },
        ].map(({ key, label, value, color }) => (
          <div
            key={key}
            style={{
              flex: 1,
              minWidth: 0,
              display: "grid",
              gridTemplateRows: "1fr auto",
              minHeight: 44,
            }}
          >
            <div
              className="label-mp"
              style={{ alignSelf: "end", lineHeight: 1.25, paddingBottom: 2 }}
            >
              {label}
            </div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      {/* ── ACTIONS (V2): row con border-top + padding propio ── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "14px 22px 18px",
          borderTop: "1px solid var(--border)",
        }}
      >
        {c.status === "maintenance" || !c.active ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive();
            }}
            className="btn btn-primary"
            style={{ flex: 1, fontSize: 10.5, justifyContent: "center" }}
          >
            <Icon name="rotate-ccw" size={11} color="#fff" />
            Reabrir
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive();
            }}
            className="btn"
            style={{
              flex: 1,
              background: "#fff",
              border: "1px solid var(--border)",
              fontSize: 10.5,
              justifyContent: "center",
            }}
          >
            <Icon name="ban" size={11} />
            Bloquear
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="btn"
          style={{
            flex: 1,
            background: "#fff",
            border: "1px solid var(--border)",
            fontSize: 10.5,
            justifyContent: "center",
          }}
        >
          <Icon name="calendar-days" size={11} />
          Agenda
        </button>
      </div>
    </div>
  );
}


// ────────────────────────────────────────────────────────────────────────
// ScheduleView: timeline simple del día por court usando today reservations.
// Cada slot está derivado de nowPlaying / nextSlot por court (ya tenemos
// solo esos 2 picos del día). Para una agenda completa habría que extender
// el server fetch — TODO Stage 2.
function ScheduleView({ courts }: { courts: CourtCard[] }) {
  const hours = Array.from({ length: 17 }, (_, i) => 6 + i); // 06..22
  // Lectura única en mount — la posición se actualiza en cada re-render
  // por realtime (cambios en reservations).
  const [now] = useState(() => new Date());
  const nowPct = Math.max(
    0,
    Math.min(
      100,
      ((now.getHours() + now.getMinutes() / 60 - 6) / hours.length) * 100,
    ),
  );
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "14px 22px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div className="label-mp">Agenda hoy</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "2px 0 0",
            }}
          >
            Timeline · {courts.length} canchas<span className="dot">.</span>
          </h3>
        </div>
      </div>

      <div style={{ padding: 22, overflowX: "auto" }}>
        {/* Hours header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `90px repeat(${hours.length}, 1fr)`,
            marginBottom: 8,
          }}
        >
          <div />
          {hours.map((h) => (
            <div
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--muted-fg)",
                fontFamily: "ui-monospace, monospace",
                borderLeft: h % 4 === 0 ? "1px solid var(--border)" : "none",
                paddingLeft: 4,
              }}
            >
              {h.toString().padStart(2, "0")}h
            </div>
          ))}
        </div>

        {/* Court rows */}
        {courts.map((c) => (
          <div
            key={c.id}
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr",
              gap: 12,
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div
                className="font-heading"
                style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}
              >
                {c.name}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{c.surf}</div>
            </div>
            <div
              style={{
                position: "relative",
                height: 36,
                borderRadius: 8,
                background: "var(--muted)",
                overflow: "hidden",
              }}
            >
              {/* Now line */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${nowPct}%`,
                  width: 2,
                  background: "#dc2626",
                  zIndex: 3,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -16,
                    left: -14,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: 8.5,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  AHORA
                </span>
              </div>
              {/* Maintenance band (covers full day) */}
              {c.status === "maintenance" && (
                <div
                  style={{
                    position: "absolute",
                    top: 3,
                    bottom: 3,
                    left: 0,
                    right: 0,
                    background: "#fef3c7",
                    color: "#78350f",
                    borderRadius: 5,
                    padding: "0 8px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  MANTENIMIENTO · {c.maintenanceReason ?? "cerrada"}
                </div>
              )}
              {/* Now playing block */}
              {c.nowPlaying && (
                <SlotBar
                  startMs={c.nowPlaying.startMs}
                  endMs={c.nowPlaying.endMs}
                  hours={hours}
                  who={c.nowPlaying.who}
                  kind={c.nowPlaying.kind}
                  live
                />
              )}
              {/* Next slot (best-effort: duration assumed 90 min) */}
              {c.nextSlot && (
                <SlotBar
                  startMs={c.nextSlot.startMs}
                  endMs={c.nextSlot.startMs + 90 * 60 * 1000}
                  hours={hours}
                  who={c.nextSlot.who}
                  kind={c.nextSlot.kind}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "12px 22px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 14,
          fontSize: 10.5,
          color: "var(--muted-fg)",
          background: "#fafafa",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 3, background: "var(--primary)" }}
          />
          Reservada
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "#dc2626" }} />
          En juego
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "#7c3aed" }} />
          Clase
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "#fef3c7" }} />
          Mant.
        </span>
      </div>
    </div>
  );
}

function SlotBar({
  startMs,
  endMs,
  hours,
  who,
  kind,
  live,
}: {
  startMs: number;
  endMs: number;
  hours: number[];
  who: string;
  kind: string;
  live?: boolean;
}) {
  const d = new Date(startMs);
  const startH = d.getHours() + d.getMinutes() / 60;
  const e = new Date(endMs);
  const endH = e.getHours() + e.getMinutes() / 60;
  if (endH <= 6 || startH >= 22) return null;
  const left = ((Math.max(6, startH) - 6) / hours.length) * 100;
  const width = ((Math.min(22, endH) - Math.max(6, startH)) / hours.length) * 100;
  const bg = live
    ? "#dc2626"
    : kind === "class"
      ? "#7c3aed"
      : kind === "event"
        ? "#fbbf24"
        : "var(--primary)";
  return (
    <div
      style={{
        position: "absolute",
        top: 3,
        bottom: 3,
        left: `${left}%`,
        width: `${width}%`,
        background: bg,
        color: "#fff",
        borderRadius: 5,
        padding: "0 6px",
        display: "flex",
        alignItems: "center",
        fontSize: 9.5,
        fontWeight: 800,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        border: live ? "2px solid #fff" : 0,
        boxShadow: live ? "0 0 0 1px #dc2626" : "none",
        zIndex: live ? 2 : 1,
      }}
      title={who}
    >
      {live && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#fff",
            marginRight: 4,
          }}
        />
      )}
      {who}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function FloorplanView({
  courts,
  onOpen,
}: {
  courts: CourtCard[];
  onOpen: (id: string) => void;
}) {
  // Posiciones automáticas en grid 2×N (más simple que coords absolutas
  // hasta tener un sistema de layout real del club).
  return (
    <div className="card" style={{ padding: 22 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 14,
        }}
      >
        <div>
          <div className="label-mp">Vista física</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "2px 0 0",
            }}
          >
            Plano del club<span className="dot">.</span>
          </h3>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10.5,
            color: "var(--muted-fg)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              style={{ width: 8, height: 8, borderRadius: 2, background: "#10b981" }}
            />
            Libre
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              style={{ width: 8, height: 8, borderRadius: 2, background: "#dc2626" }}
            />
            En juego
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#fbbf24" }} />
            Mant.
          </span>
        </div>
      </div>

      <div
        className="mp-canchas-floorplan"
        style={{
          padding: 18,
          background: "linear-gradient(180deg, #f5f5f5, #e7e5e4)",
          borderRadius: 14,
          border: "2px solid #0a0a0a",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
        }}
      >
        {courts.map((c) => {
          const st = STATUS_META[c.status];
          return (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              style={{
                padding: 0,
                border: `3px solid ${st.c}`,
                borderRadius: 8,
                cursor: "pointer",
                overflow: "hidden",
                background: "#fff",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  padding: 8,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <CourtSVG
                  surface={c.surfaceColor}
                  stroke={Math.max(3, c.strokeWidth + 1)}
                  lineStyle={c.lineStyle}
                  players={
                    c.status === "busy"
                      ? [
                          { x: 160, y: 200, color: "#fbbf24" },
                          { x: 730, y: 200, color: "#ec4899" },
                        ]
                      : []
                  }
                />
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#fff",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span
                  className="font-heading"
                  style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 8.5,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    color: st.c,
                    textTransform: "uppercase",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: st.c,
                    }}
                  />
                  {st.l}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────
// COURT DRAWER (v2): header compacto + stats + tabs internos
// (Agenda · Editar · Bloquear · Historial).
// ────────────────────────────────────────────────────────────────────────
type DrawerTab = "agenda" | "edit" | "blocker" | "history";

function CourtDrawer({
  c,
  close,
  onMaintenance,
  onClearMaintenance,
  onToggleActive,
  onUpdate,
  onCreateBlocker,
  pending,
}: {
  c: CourtCard;
  close: () => void;
  onMaintenance: (c: CourtCard, reason: string, until: string | null) => void;
  onClearMaintenance: (c: CourtCard) => void;
  onToggleActive: (c: CourtCard) => void;
  onUpdate: (
    courtId: string,
    patch: Partial<{
      code: string;
      sport: "pickleball" | "padel" | "tennis";
      surface: string | null;
      indoor: boolean;
      lights: boolean;
      active: boolean;
      surfaceColor: string;
      linesColor: string;
      lineStyle: "classic" | "showcourt" | "minimal";
      strokeWidth: number;
    }>,
  ) => void;
  onCreateBlocker: (
    courtId: string,
    startsAt: string,
    endsAt: string,
    kind: "event" | "class",
    notes: string,
  ) => void;
  pending: boolean;
}) {
  const st = STATUS_META[c.status];
  const [tab, setTab] = useState<DrawerTab>("agenda");
  const [renderedAt] = useState(() => Date.now());

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#fff",
          height: "100%",
          overflow: "auto",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header compacto: status + nombre + close ── */}
        <div
          style={{
            background: "#0a0a0a",
            color: "#fff",
            padding: 22,
            position: "relative",
          }}
        >
          <button
            onClick={close}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              zIndex: 2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span
              style={{
                padding: "3px 9px",
                borderRadius: 9999,
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              ● {st.l}
            </span>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>{c.surf}</span>
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {c.name}
            <span style={{ color: "var(--primary)" }}>.</span>
          </h2>
        </div>

        {/* ── Quick stats (siempre visibles) ── */}
        <div
          className="mp-canchas-drawer-stats"
          style={{
            padding: 18,
            borderBottom: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <DStat
            l="Tarifa"
            v={c.priceCents != null ? `$${Math.round(c.priceCents / 100)}/h` : "—"}
          />
          <DStat l="Util. 7d" v={`${c.util}%`} accent={c.util > 80} />
          <DStat l="Revenue hoy" v={fmtMoney(c.revenueTodayCents)} />
          <DStat l="Reservas" v={String(c.bookingsToday)} />
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", padding: "0 6px" }}>
          {(
            [
              { k: "agenda", l: "Agenda hoy", i: "calendar-days" },
              { k: "edit", l: "Editar", i: "settings-2" },
              { k: "blocker", l: "Bloquear slot", i: "ban" },
              { k: "history", l: "Historial", i: "history" },
            ] as Array<{ k: DrawerTab; l: string; i: string }>
          ).map((t) => {
            const on = tab === t.k;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 12px",
                  background: "transparent",
                  border: 0,
                  borderBottom: "2px solid " + (on ? "#0a0a0a" : "transparent"),
                  color: on ? "#0a0a0a" : "var(--muted-fg)",
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: on ? 900 : 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: -1,
                }}
              >
                <Icon name={t.i} size={11} />
                {t.l}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div style={{ flex: 1, padding: 22 }}>
          {tab === "agenda" && (
            <AgendaTab c={c} renderedAt={renderedAt} onJumpToBlocker={() => setTab("blocker")} />
          )}
          {tab === "edit" && (
            <EditTab c={c} onUpdate={onUpdate} pending={pending} />
          )}
          {tab === "blocker" && (
            <BlockerTab c={c} onCreateBlocker={onCreateBlocker} pending={pending} />
          )}
          {tab === "history" && (
            <HistoryTab
              c={c}
              onMaintenance={onMaintenance}
              onClearMaintenance={onClearMaintenance}
              onToggleActive={onToggleActive}
              pending={pending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Agenda Tab: lista de slots del día con status done/live/upcoming ──
function AgendaTab({
  c,
  renderedAt,
  onJumpToBlocker,
}: {
  c: CourtCard;
  renderedAt: number;
  onJumpToBlocker: () => void;
}) {
  const slots = c.todaySlots;
  if (slots.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "var(--muted-fg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="calendar-x" size={28} color="var(--muted-fg)" />
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a" }}>
          Sin reservas hoy
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, maxWidth: 320 }}>
          La cancha está libre todo el día. Puedes bloquear un slot manualmente.
        </p>
        <button
          onClick={onJumpToBlocker}
          className="btn btn-primary"
          style={{ marginTop: 6, fontSize: 11 }}
        >
          <Icon name="ban" size={12} color="#fff" />
          Bloquear slot
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {slots.map((s) => {
        const isDone = s.endMs <= renderedAt;
        const isLive = s.startMs <= renderedAt && renderedAt < s.endMs;
        const meta = isLive
          ? { bg: "rgba(220,38,38,0.06)", border: "#fca5a5", c: "#dc2626", label: "EN VIVO" }
          : isDone
            ? { bg: "#fafafa", border: "var(--border)", c: "var(--muted-fg)", label: "TERMINADA" }
            : { bg: "#fff", border: "var(--border)", c: "#0a0a0a", label: "PRÓXIMA" };
        const kindLabel =
          s.kind === "class" ? "Clase" : s.kind === "event" ? "Evento" : "Reserva";
        return (
          <div
            key={s.id}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${meta.border}`,
              background: meta.bg,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11.5,
                color: meta.c,
                fontWeight: 800,
                minWidth: 110,
              }}
            >
              {fmtHM(s.startMs)} – {fmtHM(s.endMs)}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: isLive ? 900 : 700,
                color: meta.c,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {isLive && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#dc2626",
                  }}
                />
              )}
              {s.who}
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                  padding: "1px 6px",
                  borderRadius: 9999,
                  background: "var(--muted)",
                }}
              >
                {kindLabel}
              </span>
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: meta.c,
              }}
            >
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Edit Tab: form con appearance picker ──
function EditTab({
  c,
  onUpdate,
  pending,
}: {
  c: CourtCard;
  onUpdate: (
    courtId: string,
    patch: Partial<{
      code: string;
      sport: "pickleball" | "padel" | "tennis";
      surface: string | null;
      indoor: boolean;
      lights: boolean;
      surfaceColor: string;
      linesColor: string;
      lineStyle: "classic" | "showcourt" | "minimal";
      strokeWidth: number;
    }>,
  ) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState(c.name);
  const [sport, setSport] = useState(c.sport);
  const [surface, setSurface] = useState(
    c.surf.split(" · ").slice(1).join(" · ") ?? "",
  );
  const [indoor, setIndoor] = useState(c.surf.startsWith("Indoor"));
  const [lights, setLights] = useState(c.lights);
  const [linesColor, setLinesColor] = useState(c.linesColor);
  const [lineStyle, setLineStyle] = useState(c.lineStyle as "classic" | "showcourt" | "minimal");
  const [strokeWidth, setStrokeWidth] = useState(c.strokeWidth);

  const submit = () => {
    onUpdate(c.id, {
      code: code.trim(),
      sport,
      surface: surface.trim() || null,
      indoor,
      lights,
      linesColor,
      lineStyle,
      strokeWidth,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="label-mp" style={{ marginBottom: 6 }}>
          Código
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={20}
          style={inputStyle}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div className="label-mp" style={{ marginBottom: 6 }}>
            Deporte
          </div>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value as typeof sport)}
            style={inputStyle}
          >
            <option value="pickleball">Pickleball</option>
            <option value="padel">Pádel</option>
            <option value="tennis">Tenis</option>
          </select>
        </div>
        <div>
          <div className="label-mp" style={{ marginBottom: 6 }}>
            Superficie
          </div>
          <input
            value={surface}
            onChange={(e) => setSurface(e.target.value)}
            placeholder="acrílica, sintética…"
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={indoor}
            onChange={(e) => setIndoor(e.target.checked)}
            style={{ accentColor: "#10b981" }}
          />
          Indoor
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={lights}
            onChange={(e) => setLights(e.target.checked)}
            style={{ accentColor: "#10b981" }}
          />
          Tiene luces
        </label>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div className="label-mp" style={{ marginBottom: 10 }}>
          Apariencia del SVG
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>
              Color de líneas
            </div>
            <input
              type="color"
              value={linesColor}
              onChange={(e) => setLinesColor(e.target.value)}
              style={{ ...inputStyle, padding: 4, height: 38 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>
              Estilo
            </div>
            <select
              value={lineStyle}
              onChange={(e) =>
                setLineStyle(e.target.value as "classic" | "showcourt" | "minimal")
              }
              style={inputStyle}
            >
              <option value="classic">Classic</option>
              <option value="showcourt">Show court</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>
            Grosor de línea ({strokeWidth})
          </div>
          <input
            type="range"
            min={1}
            max={6}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#10b981" }}
          />
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 14,
            border: "1px dashed var(--border)",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 10, color: "var(--muted-fg)", marginBottom: 6, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Preview
          </div>
          <CourtSVG lines={linesColor} stroke={strokeWidth} lineStyle={lineStyle} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={submit}
          disabled={pending}
          className="btn btn-primary"
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          <Icon name="check" size={13} color="#fff" />
          Guardar cambios
        </button>
      </div>
    </div>
  );
}

// ── Blocker Tab: form para crear reservation kind=event|class ──
function BlockerTab({
  c,
  onCreateBlocker,
  pending,
}: {
  c: CourtCard;
  onCreateBlocker: (
    courtId: string,
    startsAt: string,
    endsAt: string,
    kind: "event" | "class",
    notes: string,
  ) => void;
  pending: boolean;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [kind, setKind] = useState<"event" | "class">("event");
  const [notes, setNotes] = useState("");
  const valid = start.length > 0 && end.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Crea un bloqueo manual del slot (ej. torneo, clase del coach). Aparecerá en la agenda
        como reserva tipo {kind === "event" ? "Evento" : "Clase"} y bloquea el espacio para
        que nadie pueda reservarlo.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div className="label-mp" style={{ marginBottom: 6 }}>
            Inicio
          </div>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <div className="label-mp" style={{ marginBottom: 6 }}>
            Fin
          </div>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
      <div>
        <div className="label-mp" style={{ marginBottom: 6 }}>
          Tipo
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["event", "class"] as const).map((k) => {
            const on = kind === k;
            return (
              <label
                key={k}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 12,
                  borderRadius: 8,
                  border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: on ? "#ecfdf5" : "#fff",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={on}
                  onChange={() => setKind(k)}
                  style={{ accentColor: "#10b981" }}
                />
                <span style={{ fontSize: 12.5, fontWeight: 800 }}>
                  {k === "event" ? "Evento" : "Clase"}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div>
        <div className="label-mp" style={{ marginBottom: 6 }}>
          Notas (opcional)
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={280}
          placeholder="Torneo interno, clase de Diego, etc"
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() =>
            onCreateBlocker(
              c.id,
              new Date(start).toISOString(),
              new Date(end).toISOString(),
              kind,
              notes,
            )
          }
          disabled={!valid || pending}
          className="btn btn-primary"
          style={{ opacity: !valid || pending ? 0.6 : 1 }}
        >
          <Icon name="ban" size={13} color="#fff" />
          Bloquear slot
        </button>
      </div>
    </div>
  );
}

// ── History Tab: log de mantenimientos + acciones globales ──
function HistoryTab({
  c,
  onMaintenance,
  onClearMaintenance,
  onToggleActive,
  pending,
}: {
  c: CourtCard;
  onMaintenance: (c: CourtCard, reason: string, until: string | null) => void;
  onClearMaintenance: (c: CourtCard) => void;
  onToggleActive: (c: CourtCard) => void;
  pending: boolean;
}) {
  const [maintOpen, setMaintOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Estado actual + acciones globales */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {c.status === "maintenance" ? (
          <>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: "#fef3c7",
                color: "#78350f",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <Icon name="wrench" size={14} color="#78350f" />
              <div style={{ flex: 1, fontSize: 11.5, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 800 }}>En mantenimiento</div>
                {c.maintenanceReason && <div>{c.maintenanceReason}</div>}
                {c.maintenanceUntil && (
                  <div>
                    Vuelve{" "}
                    <b>
                      {new Date(c.maintenanceUntil).toLocaleDateString("es-EC", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </b>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => onClearMaintenance(c)}
              disabled={pending}
              className="btn btn-primary"
              style={{ justifyContent: "center", opacity: pending ? 0.6 : 1 }}
            >
              <Icon name="rotate-ccw" size={12} color="#fff" />
              Reabrir cancha
            </button>
          </>
        ) : maintOpen ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (opcional)"
              style={inputStyle}
            />
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                onClick={() => setMaintOpen(false)}
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  onMaintenance(c, reason, until ? new Date(until).toISOString() : null)
                }
                disabled={pending}
                className="btn btn-primary"
                style={{ opacity: pending ? 0.6 : 1 }}
              >
                <Icon name="wrench" size={12} color="#fff" />
                Marcar mantenimiento
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              onClick={() => onToggleActive(c)}
              disabled={pending}
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                justifyContent: "center",
                opacity: pending ? 0.6 : 1,
              }}
            >
              <Icon name={c.active ? "ban" : "rotate-ccw"} size={12} />
              {c.active ? "Bloquear cancha" : "Reabrir"}
            </button>
            <button
              onClick={() => setMaintOpen(true)}
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                justifyContent: "center",
                color: "#92400e",
              }}
            >
              <Icon name="wrench" size={12} color="#92400e" />
              Mantenimiento
            </button>
          </div>
        )}
      </div>

      {/* Historial de mantenimientos */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div className="label-mp" style={{ marginBottom: 10 }}>
          Historial de mantenimientos
        </div>
        {c.maintenanceLog.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "var(--muted-fg)",
              fontSize: 12,
            }}
          >
            Sin mantenimientos registrados todavía.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {c.maintenanceLog.map((m) => {
              const closed = m.endedAt != null;
              return (
                <div
                  key={m.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: closed ? "#fafafa" : "#fef3c7",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 11,
                      color: closed ? "var(--muted-fg)" : "#78350f",
                      fontWeight: 800,
                    }}
                  >
                    <span>
                      {new Date(m.startsAt).toLocaleString("es-EC", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {m.endedAt &&
                        ` → ${new Date(m.endedAt).toLocaleString("es-EC", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {closed ? "Cerrado" : "Activo"}
                    </span>
                  </div>
                  {m.reason && (
                    <div
                      style={{
                        fontSize: 12,
                        marginTop: 4,
                        color: closed ? "#0a0a0a" : "#78350f",
                      }}
                    >
                      {m.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DStat({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return (
    <div>
      <div className="label-mp">{l}</div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 18,
          fontWeight: 900,
          marginTop: 4,
          letterSpacing: "-0.02em",
          color: accent ? "var(--primary)" : "#0a0a0a",
        }}
      >
        {v}
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  background: "#fff",
  outline: "none",
  width: "100%",
} as const;

// ────────────────────────────────────────────────────────────────────────
function AddCourtModal({
  close,
  onCreate,
  pending,
}: {
  close: () => void;
  onCreate: (form: {
    code: string;
    sport: "pickleball" | "padel" | "tennis";
    indoor: boolean;
    lights: boolean;
    surface: string;
    pricing: {
      currency: string;
      dayStart: string;
      dayEnd: string;
      dayPriceCents: number;
      nightPriceCents: number;
    } | null;
  }) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState("");
  const [sport, setSport] = useState<"pickleball" | "padel" | "tennis">("pickleball");
  const [indoor, setIndoor] = useState(false);
  const [lights, setLights] = useState(true);
  const [surface, setSurface] = useState("");
  // UX kit §4.4: tarifa inline diurna/nocturna con franja diurna configurable.
  // El owner puede saltarse el seed inicial con "Configurar tarifas después".
  const [seedPricing, setSeedPricing] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [dayStart, setDayStart] = useState("08:00");
  const [dayEnd, setDayEnd] = useState("18:00");
  const [dayPrice, setDayPrice] = useState(20);
  const [nightPrice, setNightPrice] = useState(25);
  const pricingValid =
    !seedPricing ||
    (dayEnd > dayStart && dayPrice >= 0 && nightPrice >= 0);
  const valid = code.trim().length > 0 && pricingValid;
  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            padding: "20px 22px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Nueva cancha
          </div>
          <h3
            className="font-heading"
            style={{
              margin: "4px 0 0",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Agregar cancha<span className="dot">.</span>
          </h3>
        </div>
        <div
          style={{
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Código <span style={{ color: "#dc2626" }}>∗</span>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={20}
              placeholder="C1, Pickle 3, Show Court…"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>
                Deporte
              </div>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value as typeof sport)}
                style={inputStyle}
              >
                <option value="pickleball">Pickleball</option>
                <option value="padel">Pádel</option>
                <option value="tennis">Tenis</option>
              </select>
            </div>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>
                Superficie (texto)
              </div>
              <input
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                placeholder="acrílica, sintética, polvo…"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, paddingTop: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={indoor}
                onChange={(e) => setIndoor(e.target.checked)}
                style={{ accentColor: "#10b981" }}
              />
              Indoor (techada)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={lights}
                onChange={(e) => setLights(e.target.checked)}
                style={{ accentColor: "#10b981" }}
              />
              Tiene luces
            </label>
          </div>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: 6,
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={seedPricing}
                onChange={(e) => setSeedPricing(e.target.checked)}
                style={{ accentColor: "#10b981" }}
              />
              Configurar tarifa diurna/nocturna ahora
            </label>
            {seedPricing && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <div className="label-mp" style={{ marginBottom: 6 }}>
                      Moneda
                    </div>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                      <option value="MXN">MXN</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div>
                    <div className="label-mp" style={{ marginBottom: 6 }}>
                      Franja diurna desde
                    </div>
                    <input
                      type="time"
                      value={dayStart}
                      onChange={(e) => setDayStart(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div className="label-mp" style={{ marginBottom: 6 }}>
                      hasta
                    </div>
                    <input
                      type="time"
                      value={dayEnd}
                      onChange={(e) => setDayEnd(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="label-mp" style={{ marginBottom: 6 }}>
                      Tarifa diurna ($/h)
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={dayPrice}
                      onChange={(e) => setDayPrice(Math.max(0, Number(e.target.value)))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div className="label-mp" style={{ marginBottom: 6 }}>
                      Tarifa nocturna ($/h)
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={nightPrice}
                      onChange={(e) => setNightPrice(Math.max(0, Number(e.target.value)))}
                      style={inputStyle}
                    />
                  </div>
                </div>
                {!pricingValid && (
                  <div style={{ color: "#dc2626", fontSize: 12 }}>
                    El fin de la franja diurna debe ser después del inicio.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={close}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onCreate({
                code,
                sport,
                indoor,
                lights,
                surface,
                pricing: seedPricing
                  ? {
                      currency,
                      dayStart: `${dayStart}:00`,
                      dayEnd: `${dayEnd}:00`,
                      dayPriceCents: Math.round(dayPrice * 100),
                      nightPriceCents: Math.round(nightPrice * 100),
                    }
                  : null,
              })
            }
            disabled={!valid || pending}
            className="btn btn-primary"
            style={{ opacity: !valid || pending ? 0.6 : 1 }}
          >
            <Icon name="check" size={13} color="#fff" />
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function BulkBlockModal({
  courts,
  close,
  onBlock,
  pending,
}: {
  courts: CourtCard[];
  close: () => void;
  onBlock: (courtIds: string[], reason: string, until: string | null) => void;
  pending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const all = selected.size === courts.length && courts.length > 0;
  const toggleAll = () =>
    setSelected(all ? new Set() : new Set(courts.map((c) => c.id)));
  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ color: "#92400e" }}>
            ● Bloqueo masivo
          </div>
          <h3
            className="font-heading"
            style={{
              margin: "4px 0 0",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Marcar mantenimiento<span className="dot">.</span>
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>
            Las canchas seleccionadas quedan en mantenimiento con motivo y fecha de
            retorno (opcional).
          </p>
        </div>
        <div
          style={{
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="label-mp">Canchas ({selected.size} de {courts.length})</span>
            <button
              onClick={toggleAll}
              style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 800,
                color: "var(--primary)",
                textDecoration: "underline",
              }}
            >
              {all ? "Limpiar" : "Seleccionar todas"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {courts.map((c) => {
              const on = selected.has(c.id);
              return (
                <label
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: on ? "#ecfdf5" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(c.id)}
                    style={{ accentColor: "#10b981" }}
                  />
                  <span
                    style={{
                      width: 24,
                      height: 16,
                      borderRadius: 3,
                      background: c.surfaceColor,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{c.surf}</span>
                </label>
              );
            })}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional)"
            style={inputStyle}
          />
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={close}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onBlock(
                [...selected],
                reason,
                until ? new Date(until).toISOString() : null,
              )
            }
            disabled={selected.size === 0 || pending}
            className="btn btn-primary"
            style={{ opacity: selected.size === 0 || pending ? 0.6 : 1 }}
          >
            <Icon name="wrench" size={13} color="#fff" />
            Bloquear {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// UX Kit Ola A — vistas Vista pública / Gestión / Tarifas
// ════════════════════════════════════════════════════════════════════════

// Vista pública: galería editorial con SVG por cancha (UX kit §4.2).
function PublicView({
  courts,
  onOpen,
  onToggleActive,
}: {
  courts: CourtCard[];
  onOpen: (id: string) => void;
  onToggleActive: (c: CourtCard) => void;
}) {
  return (
    <GalleryView courts={courts} onOpen={onOpen} onToggleActive={onToggleActive} />
  );
}

// Gestión: lista de cards densas con status visible y acciones inline. UX kit
// §4.3 — cards (no tabla), status pill, acciones Editar / Bloquear / Tarifas.
function ManagementView({
  courts,
  onOpen,
  onToggleActive,
}: {
  courts: CourtCard[];
  onOpen: (id: string) => void;
  onToggleActive: (c: CourtCard) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {courts.map((c) => (
        <ManagementCard
          key={c.id}
          c={c}
          onOpen={() => onOpen(c.id)}
          onToggleActive={() => onToggleActive(c)}
        />
      ))}
    </div>
  );
}

function ManagementCard({
  c,
  onOpen,
  onToggleActive,
}: {
  c: CourtCard;
  onOpen: () => void;
  onToggleActive: () => void;
}) {
  const st = STATUS_META[c.status];
  // Mini-resumen de tarifas: si hay 1+ bands activas mostramos rango de precios
  // (min–max); si no, mostramos "Sin tarifa configurada" para señalar gap.
  const activeBands = c.pricingBands.filter((b) => b.active);
  let pricingSummary: string;
  if (activeBands.length === 0) {
    pricingSummary = "Sin tarifa configurada";
  } else {
    const prices = activeBands.map((b) => b.priceCents);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    pricingSummary =
      min === max
        ? `$${(min / 100).toFixed(0)}/h`
        : `$${(min / 100).toFixed(0)}–$${(max / 100).toFixed(0)}/h`;
  }
  return (
    <div
      className="card mp-canchas-mgmt-card"
      style={{
        padding: 14,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        opacity: c.active ? 1 : 0.6,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="font-heading"
            style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" }}
          >
            {c.name}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 999,
              background: st.bg,
              color: st.c,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            ● {st.l}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {c.surf} · {c.lights ? "Con luces" : "Sin luces"} · {c.hours}
        </div>
        <div style={{ fontSize: 12, color: "#0a0a0a" }}>
          <Icon name="dollar-sign" size={11} /> {pricingSummary}
          {c.status === "maintenance" && c.maintenanceReason ? (
            <span style={{ color: "#92400e", marginLeft: 10 }}>
              · {c.maintenanceReason}
            </span>
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onOpen}
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
        >
          <Icon name="pencil" size={12} />
          Editar
        </button>
        <button
          onClick={onToggleActive}
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            color: c.active ? "#92400e" : "#10b981",
          }}
        >
          <Icon name={c.active ? "ban" : "check-circle-2"} size={12} />
          {c.active ? "Bloquear" : "Reabrir"}
        </button>
      </div>
    </div>
  );
}

// Tarifas: editor de bands por cancha. UX kit §4.6 — alcance mínimo Ola A:
// permitimos crear/editar bands de court_pricing por cancha. Cada cancha es
// editable independientemente; se persiste con setCourtPricing (replace-all).
const DAY_OPTIONS: Array<{ v: number | null; l: string }> = [
  { v: null, l: "Todos los días" },
  { v: 1, l: "Lunes" },
  { v: 2, l: "Martes" },
  { v: 3, l: "Miércoles" },
  { v: 4, l: "Jueves" },
  { v: 5, l: "Viernes" },
  { v: 6, l: "Sábado" },
  { v: 0, l: "Domingo" },
];

function PricingTab({
  courts,
  onSetPricing,
  pending,
}: {
  courts: CourtCard[];
  onSetPricing: (courtId: string, bands: PricingBand[], onDone?: () => void) => void;
  pending: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          fontSize: 13,
          color: "var(--muted-fg)",
          padding: "8px 4px",
        }}
      >
        Editá las franjas de tarifa por cancha. Podés definir múltiples franjas
        por día (ej. diurna/nocturna, fin de semana). Los cambios se aplican al
        guardar — el calendario de reservas refleja la nueva tarifa al instante.
      </div>
      {courts.map((c) => (
        <PricingCardEditor
          key={c.id}
          court={c}
          onSave={(bands, done) => onSetPricing(c.id, bands, done)}
          pending={pending}
        />
      ))}
    </div>
  );
}

function PricingCardEditor({
  court,
  onSave,
  pending,
}: {
  court: CourtCard;
  onSave: (bands: PricingBand[], onDone?: () => void) => void;
  pending: boolean;
}) {
  // Estado local edita una copia de las bandas; se descarta al guardar/recargar.
  const initial = court.pricingBands.length
    ? court.pricingBands.map((b) => ({ ...b }))
    : [
        {
          dayOfWeek: null,
          startsAt: "08:00:00",
          endsAt: "18:00:00",
          priceCents: 2000,
          durationMinutes: 60,
          currency: "USD",
          active: true,
        },
      ];
  const [bands, setBands] = useState<PricingBand[]>(initial);
  const [open, setOpen] = useState(court.pricingBands.length === 0);
  const dirty = JSON.stringify(bands) !== JSON.stringify(initial);

  const updateBand = (idx: number, patch: Partial<PricingBand>) => {
    setBands((b) => b.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addBand = () => {
    setBands((b) => [
      ...b,
      {
        dayOfWeek: null,
        startsAt: "18:00:00",
        endsAt: "22:00:00",
        priceCents: 2500,
        durationMinutes: 60,
        currency: bands[0]?.currency ?? "USD",
        active: true,
      },
    ]);
  };
  const removeBand = (idx: number) => {
    setBands((b) => b.filter((_, i) => i !== idx));
  };
  const reset = () => setBands(initial);

  return (
    <div
      className="card"
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
        <span
          className="font-heading"
          style={{ fontSize: 15, fontWeight: 900, flex: 1 }}
        >
          {court.name}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {bands.length} {bands.length === 1 ? "franja" : "franjas"}
          {dirty ? " · sin guardar" : ""}
        </span>
      </div>
      {open && (
        <>
        <div className="mp-canchas-pricing-scroll">
          <div
            className="mp-canchas-pricing-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.6fr auto",
              gap: 8,
              alignItems: "center",
              fontSize: 11,
              color: "var(--muted-fg)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 700,
              padding: "0 4px",
            }}
          >
            <span>Día</span>
            <span>Desde</span>
            <span>Hasta</span>
            <span>Precio ($)</span>
            <span>Slot (min)</span>
            <span>Activa</span>
            <span />
          </div>
          {bands.map((b, i) => (
            <div
              key={i}
              className="mp-canchas-pricing-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.6fr auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <select
                value={b.dayOfWeek === null ? "null" : String(b.dayOfWeek)}
                onChange={(e) =>
                  updateBand(i, {
                    dayOfWeek: e.target.value === "null" ? null : Number(e.target.value),
                  })
                }
                style={inputStyle}
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d.v === null ? "null" : d.v} value={d.v === null ? "null" : String(d.v)}>
                    {d.l}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={b.startsAt.slice(0, 5)}
                onChange={(e) => updateBand(i, { startsAt: `${e.target.value}:00` })}
                style={inputStyle}
              />
              <input
                type="time"
                value={b.endsAt.slice(0, 5)}
                onChange={(e) => updateBand(i, { endsAt: `${e.target.value}:00` })}
                style={inputStyle}
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={(b.priceCents / 100).toFixed(2)}
                onChange={(e) =>
                  updateBand(i, {
                    priceCents: Math.max(0, Math.round(Number(e.target.value) * 100)),
                  })
                }
                style={inputStyle}
              />
              <input
                type="number"
                min={15}
                max={240}
                step={15}
                value={b.durationMinutes}
                onChange={(e) =>
                  updateBand(i, { durationMinutes: Math.max(15, Math.min(240, Number(e.target.value))) })
                }
                style={inputStyle}
              />
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  justifyContent: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={b.active}
                  onChange={(e) => updateBand(i, { active: e.target.checked })}
                  style={{ accentColor: "#10b981" }}
                />
              </label>
              <button
                onClick={() => removeBand(i)}
                className="btn"
                title="Eliminar franja"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>
          <div
            className="mp-canchas-pricing-actions"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              paddingTop: 6,
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              onClick={addBand}
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
              <Icon name="plus" size={12} />
              Agregar franja
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={reset}
                disabled={!dirty || pending}
                className="btn"
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                  opacity: !dirty || pending ? 0.6 : 1,
                }}
              >
                Descartar
              </button>
              <button
                onClick={() => onSave(bands)}
                disabled={!dirty || pending}
                className="btn btn-primary"
                style={{ opacity: !dirty || pending ? 0.6 : 1 }}
              >
                <Icon name="check" size={12} color="#fff" />
                Guardar tarifas
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

