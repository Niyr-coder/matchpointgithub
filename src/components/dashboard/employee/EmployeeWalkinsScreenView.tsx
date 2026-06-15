// Client view del EmployeeWalkinsScreen — layout 1:1 del mock.
"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  assignWalkinCourt,
  createWalkin,
  removeWalkin,
  rescheduleWalkin,
} from "@/server/actions/walkins";
import type { CourtOccupancyRow, CourtOccupancySnapshot } from "@/server/queries/court-occupancy";

export type WalkinRow = {
  id: string;
  n: string;
  t: string;
  sport: string;
  sportRaw: string | null;
  players: number;
  dur: string;
  durationMinutes: number;
  phone: string;
  notes: string;
};

export type CourtRow = CourtOccupancyRow;
export type CourtStatus = CourtOccupancyRow["status"];

type PickItem = { id: string; label: string; sub?: string };

function PickOverlay({
  title,
  items,
  onPick,
  onClose,
}: {
  title: string;
  items: PickItem[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 75,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 400, maxHeight: "70vh", overflow: "auto", padding: 18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, marginBottom: 12 }}>
          {title}
        </div>
        {items.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--muted-fg)" }}>No hay opciones disponibles.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  textAlign: "left",
                  padding: "12px 14px",
                  background: "#fff",
                  border: RS_BORDER,
                }}
                onClick={() => onPick(it.id)}
              >
                <span style={{ fontWeight: 900, fontSize: 13 }}>{it.label}</span>
                {it.sub ? (
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                    {it.sub}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn" style={{ marginTop: 12, width: "100%" }} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export type WalkinsData = {
  clubId: string | null;
  queue: WalkinRow[];
  courts: CourtRow[];
  occupancy: CourtOccupancySnapshot | null;
};

const COURT_VISUAL: Record<
  CourtStatus,
  { bg: string; color: string; icon: string; label: (c: { until: string }) => string }
> = {
  free: { bg: "#ecfdf5", color: "var(--primary)", icon: "check", label: () => "Disponible ahora" },
  busy: { bg: "#fef3c7", color: "#92400e", icon: "clock", label: (c) => "Ocupada hasta " + c.until },
  class: { bg: "#ede9fe", color: "#6b21a8", icon: "graduation-cap", label: (c) => "Clase hasta " + c.until },
};

const PLACEHOLDER_WALKINS = 3;
const PLACEHOLDER_COURTS = 4;

function WalkinPlaceholderCard() {
  return (
    <div
      style={{
        padding: 14,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <div
          className="font-heading"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--muted)",
            color: "var(--muted-fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          —
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "var(--muted-fg)" }}>Sin walk-ins en cola</div>
            <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 800 }}>—</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            — · — · — · —
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button className="btn" style={{ fontSize: 10.5, opacity: 0.6 }} disabled>
              <Icon name="check" size={11} />
              Asignar cancha
            </button>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, fontSize: 10.5, opacity: 0.6 }}
              disabled
            >
              Reagendar
            </button>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, fontSize: 10.5, color: "#dc2626", opacity: 0.6 }}
              disabled
            >
              Quitar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CourtPlaceholderCard() {
  return (
    <div
      style={{
        padding: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: "var(--muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="circle" size={16} color="var(--muted-fg)" />
      </div>
      <div style={{ flex: 1 }}>
        <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, color: "var(--muted-fg)" }}>
          Sin canchas
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>— · —</div>
      </div>
    </div>
  );
}

export function EmployeeWalkinsScreenView({ data }: { data: WalkinsData }) {
  const toast = useToast();
  const router = useRouter();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [pickWalkinId, setPickWalkinId] = useState<string | null>(null);
  const [pickCourtId, setPickCourtId] = useState<string | null>(null);

  const freeCourts = useMemo(
    () => data.courts.filter((c) => c.status === "free"),
    [data.courts],
  );

  const runAssign = (walkinId: string, courtId: string) => {
    if (!data.clubId) return;
    startTransition(async () => {
      const res = await assignWalkinCourt({ clubId: data.clubId!, walkinId, courtId });
      if (res.ok) {
        toast({
          icon: "check",
          title: "Cancha asignada",
          sub: "El walk-in pasó a reserva y aparece en check-in",
        });
        setPickWalkinId(null);
        setPickCourtId(null);
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo asignar", sub: res.error.message });
      }
    });
  };

  const handleNew = async () => {
    if (!data.clubId) return;
    const name = await ask({
      title: "Nuevo walk-in · 1/5",
      label: "Nombre del cliente",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (name == null) return;
    const phone = await ask({
      title: "Nuevo walk-in · 2/5",
      label: "Teléfono (opcional)",
      placeholder: "+593 99 999 9999",
      confirmLabel: "Siguiente",
    });
    if (phone == null) return;
    const partyStr = await ask({
      title: "Nuevo walk-in · 3/5",
      label: "Número de jugadores",
      initialValue: "2",
      required: true,
      validate: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? null : "Solo enteros mayores que 0"),
      confirmLabel: "Siguiente",
    });
    if (partyStr == null) return;
    const durStr = await ask({
      title: "Nuevo walk-in · 4/6",
      label: "Duración (minutos)",
      initialValue: "60",
      required: true,
      validate: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? null : "Solo enteros mayores que 0"),
      confirmLabel: "Siguiente",
    });
    if (durStr == null) return;
    const sportStr = await ask({
      title: "Nuevo walk-in · 5/6",
      label: "Deporte (pickleball, padel o tennis)",
      initialValue: "pickleball",
      required: true,
      validate: (v) => {
        const s = v.trim().toLowerCase();
        return ["pickleball", "padel", "tennis"].includes(s) ? null : "Usa: pickleball, padel o tennis";
      },
      confirmLabel: "Siguiente",
    });
    if (sportStr == null) return;
    const notes = await ask({
      title: "Nuevo walk-in · 6/6",
      label: "Notas (opcional)",
      placeholder: "Preferencias, cancha, etc.",
      multiline: true,
      confirmLabel: "Registrar",
    });
    if (notes == null) return;
    startTransition(async () => {
      const res = await createWalkin({
        clubId: data.clubId!,
        customerName: name.trim(),
        customerPhone: phone || undefined,
        partySize: Number(partyStr) || 2,
        durationMinutes: Number(durStr) || 60,
        sport: sportStr.trim().toLowerCase() as "pickleball" | "padel" | "tennis",
        notes: notes || undefined,
      });
      if (res.ok) toast({ icon: "check", title: "Walk-in registrado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const handleReschedule = async (w: WalkinRow) => {
    if (!data.clubId) return;
    const durStr = await ask({
      title: "Reagendar walk-in",
      label: "Nueva duración (minutos)",
      initialValue: String(w.durationMinutes),
      required: true,
      validate: (v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 15 && n <= 240 ? null : "Entre 15 y 240 minutos";
      },
      confirmLabel: "Guardar",
    });
    if (durStr == null) return;
    startTransition(async () => {
      const res = await rescheduleWalkin({
        clubId: data.clubId!,
        walkinId: w.id,
        durationMinutes: Number(durStr),
      });
      if (res.ok) toast({ icon: "check", title: "Duración actualizada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      router.refresh();
    });
  };

  const handleAssignWalkin = (w: WalkinRow) => {
    const courts = freeCourts.filter(
      (c) => !w.sportRaw || c.sportRaw === w.sportRaw,
    );
    if (courts.length === 0) {
      toast({
        icon: "alert-triangle",
        title: "Sin canchas libres",
        sub: w.sportRaw
          ? `No hay canchas libres de ${w.sport} ahora`
          : "Espera a que se libere una cancha",
      });
      return;
    }
    if (courts.length === 1) {
      runAssign(w.id, courts[0]!.id);
      return;
    }
    setPickWalkinId(w.id);
  };

  const handleAssignCourt = (c: CourtRow) => {
    const walkins = data.queue.filter((w) => !w.sportRaw || w.sportRaw === c.sportRaw);
    if (walkins.length === 0) {
      toast({ icon: "alert-triangle", title: "Cola vacía", sub: "No hay walk-ins para esta cancha" });
      return;
    }
    if (walkins.length === 1) {
      runAssign(walkins[0]!.id, c.id);
      return;
    }
    setPickCourtId(c.id);
  };

  const handleRemove = async (id: string) => {
    if (!data.clubId) return;
    const ok = await confirm({
      title: "Quitar de la cola",
      body: "¿Quitar este walk-in de la cola?",
      confirmLabel: "Quitar",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await removeWalkin({ id, clubId: data.clubId! });
      if (res.ok) toast({ icon: "check", title: "Quitado de la cola" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "walkins", filter: `club_id=eq.${data.clubId}` },
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const hasQueue = data.queue.length > 0;
  const hasCourts = data.courts.length > 0;
  const queueCount = data.queue.length;
  const occ = data.occupancy;

  return (
    <>
      {occ && occ.total > 0 ? (
        <div
          className="card"
          style={{
            padding: "16px 18px",
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
            background: occ.free > 0 ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${occ.free > 0 ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="label-mp" style={{ marginBottom: 4 }}>
              ¿Hay canchas disponibles?
            </div>
            <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.25 }}>
              {occ.answerLine}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                background: "#fff",
                fontSize: 12,
                fontWeight: 900,
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ color: "var(--primary)" }}>{occ.free}</span> libres
            </span>
            <span
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                background: "#fff",
                fontSize: 12,
                fontWeight: 900,
                border: "1px solid var(--border)",
              }}
            >
              {occ.busy} ocupadas
            </span>
            {occ.classCount > 0 ? (
              <span
                style={{
                  padding: "8px 14px",
                  borderRadius: 9999,
                  background: "#fff",
                  fontSize: 12,
                  fontWeight: 900,
                  border: "1px solid var(--border)",
                }}
              >
                {occ.classCount} en clase
              </span>
            ) : null}
            <span
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                background: "#0a0a0a",
                color: "#fff",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {occ.total} canchas
            </span>
          </div>
        </div>
      ) : null}
      <RSHeader
        label="Recepción · Walk-ins"
        title={
          <>
            Cola walk-ins <span className="dot">●</span> {queueCount}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/dashboard/employee/e-calendario"
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, fontSize: 11 }}
            >
              <Icon name="calendar" size={12} />
              Calendario hoy
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!data.clubId || isPending}
              style={{ opacity: data.clubId ? 1 : 0.5 }}
              onClick={handleNew}
            >
              <Icon name="user-plus" size={13} color="#fff" />
              Nuevo walk-in
            </button>
          </div>
        }
      />
      <div className="mp-grid-form-2 gap-4">
        <div>
          <div className="label-mp" style={{ marginBottom: 10 }}>
            En cola · ordenado por tiempo de espera
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hasQueue
              ? data.queue.map((w, i) => (
                  <div key={w.id} className="card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                      <div
                        className="font-heading"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: i === 0 ? "#dc2626" : "#0a0a0a",
                          color: "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 900 }}>{w.n}</div>
                          <span
                            style={{
                              fontSize: 11,
                              color: i === 0 ? "#dc2626" : "var(--muted-fg)",
                              fontWeight: 800,
                            }}
                          >
                            {w.t}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                          {w.sport} · {w.players}p · {w.dur} · {w.phone}
                        </div>
                        {w.notes !== "—" && (
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "#0a0a0a",
                              marginTop: 6,
                              padding: "5px 10px",
                              background: "var(--muted)",
                              borderRadius: 6,
                              fontStyle: "italic",
                            }}
                          >
                            &quot;{w.notes}&quot;
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: 10.5 }}
                            disabled={isPending}
                            onClick={() => handleAssignWalkin(w)}
                          >
                            <Icon name="check" size={11} color="#fff" />
                            Asignar cancha
                          </button>
                          <button
                            type="button"
                            className="btn"
                            style={{ background: "#fff", border: RS_BORDER, fontSize: 10.5 }}
                            disabled={isPending}
                            onClick={() => handleReschedule(w)}
                          >
                            Reagendar
                          </button>
                          <button
                            className="btn"
                            style={{
                              background: "#fff",
                              border: RS_BORDER,
                              fontSize: 10.5,
                              color: "#dc2626",
                            }}
                            onClick={() => handleRemove(w.id)}
                            disabled={isPending}
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              : Array.from({ length: PLACEHOLDER_WALKINS }).map((_, i) => <WalkinPlaceholderCard key={i} />)}
          </div>
        </div>
        <div>
          <div className="label-mp" style={{ marginBottom: 10 }}>
            Disponibilidad de canchas · libres primero
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 520,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {hasCourts
              ? data.courts.map((c) => {
                  const v = COURT_VISUAL[c.status];
                  return (
                    <div
                      key={c.id}
                      className="card"
                      style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          background: v.bg,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={v.icon} size={16} color={v.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>
                          {c.n}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                          {c.sport} · {v.label(c)}
                        </div>
                      </div>
                      {c.status === "free" && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: 10.5 }}
                          disabled={isPending || queueCount === 0}
                          onClick={() => handleAssignCourt(c)}
                        >
                          Asignar
                        </button>
                      )}
                    </div>
                  );
                })
              : Array.from({ length: PLACEHOLDER_COURTS }).map((_, i) => <CourtPlaceholderCard key={i} />)}
          </div>
        </div>
      </div>
      {pickWalkinId ? (
        <PickOverlay
          title="Elige cancha libre"
          items={freeCourts
            .filter((c) => {
              const w = data.queue.find((x) => x.id === pickWalkinId);
              return !w?.sportRaw || c.sportRaw === w.sportRaw;
            })
            .map((c) => ({ id: c.id, label: c.n, sub: c.sport }))}
          onPick={(courtId) => runAssign(pickWalkinId, courtId)}
          onClose={() => setPickWalkinId(null)}
        />
      ) : null}
      {pickCourtId ? (
        <PickOverlay
          title="Elige walk-in de la cola"
          items={data.queue
            .filter((w) => {
              const c = data.courts.find((x) => x.id === pickCourtId);
              return !c || !w.sportRaw || w.sportRaw === c.sportRaw;
            })
            .map((w) => ({
              id: w.id,
              label: w.n,
              sub: `${w.sport} · ${w.players}p · ${w.dur}`,
            }))}
          onPick={(walkinId) => runAssign(walkinId, pickCourtId)}
          onClose={() => setPickCourtId(null)}
        />
      ) : null}
    </>
  );
}
