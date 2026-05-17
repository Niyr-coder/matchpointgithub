// Client view del EmployeeWalkinsScreen — layout 1:1 del mock.
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { createWalkin, removeWalkin } from "@/server/actions/walkins";

export type WalkinRow = {
  id: string;
  n: string;
  t: string;
  sport: string;
  players: number;
  dur: string;
  phone: string;
  notes: string;
};

export type CourtStatus = "free" | "busy" | "class";
export type CourtRow = {
  id: string;
  n: string;
  sport: string;
  status: CourtStatus;
  until: string;
};

export type WalkinsData = {
  clubId: string | null;
  queue: WalkinRow[];
  courts: CourtRow[];
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
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();

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
      title: "Nuevo walk-in · 4/5",
      label: "Duración (minutos)",
      initialValue: "60",
      required: true,
      validate: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? null : "Solo enteros mayores que 0"),
      confirmLabel: "Siguiente",
    });
    if (durStr == null) return;
    const notes = await ask({
      title: "Nuevo walk-in · 5/5",
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
        notes: notes || undefined,
      });
      if (res.ok) toast({ icon: "check", title: "Walk-in registrado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
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

  return (
    <>
      <RSHeader
        label="Recepción · Walk-ins"
        title={
          <>
            Cola walk-ins <span className="dot">●</span> {queueCount}
          </>
        }
        action={
          <button
            className="btn btn-primary"
            disabled={!data.clubId || isPending}
            style={{ opacity: data.clubId ? 1 : 0.5 }}
            onClick={handleNew}
          >
            <Icon name="user-plus" size={13} color="#fff" />
            Nuevo walk-in
          </button>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                          <button className="btn btn-primary" style={{ fontSize: 10.5 }}>
                            <Icon name="check" size={11} color="#fff" />
                            Asignar cancha
                          </button>
                          <button
                            className="btn"
                            style={{ background: "#fff", border: RS_BORDER, fontSize: 10.5 }}
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
            Disponibilidad de canchas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                        <button className="btn btn-primary" style={{ fontSize: 10.5 }}>
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
    </>
  );
}
