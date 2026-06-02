"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { cancelReservation } from "@/server/actions/reservations";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";

export type AdminReservationRow = {
  id: string;
  clubName: string;
  courtName: string;
  organizerName: string;
  sport: string;
  status: string;
  source: string;
  startsAt: string;
  endsAt: string;
  cancellationReason: string | null;
};

const STATUS: Record<string, { label: string; color: string }> = {
  booked: { label: "Reservada", color: "#f59e0b" },
  confirmed: { label: "Confirmada", color: "var(--primary)" },
  checked_in: { label: "Check-in", color: "#0ea5e9" },
  no_show: { label: "No show", color: "#dc2626" },
  cancelled: { label: "Cancelada", color: "#dc2626" },
  completed: { label: "Completada", color: "var(--muted-fg)" },
};

function dateLabel(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function canCancel(status: string): boolean {
  return !["cancelled", "no_show", "completed"].includes(status);
}

export function AdminReservasScreenView({ rows }: { rows: AdminReservationRow[] }) {
  useRealtimeRefresh([{ table: "reservations" }], { debounceMs: 1000 });
  const router = useRouter();
  const toast = useToast();
  const { ask } = usePromptModal();
  const [pending, startTransition] = useTransition();

  const activeCount = rows.filter((r) => canCancel(r.status)).length;

  const handleCancel = async (row: AdminReservationRow) => {
    const reason = await ask({
      title: "Cancelar reserva",
      label: "Motivo",
      placeholder: "Ej: cancelación solicitada por soporte",
      required: false,
      multiline: true,
      confirmLabel: "Cancelar reserva",
      destructive: true,
    });
    if (reason == null) return;
    startTransition(async () => {
      const res = await cancelReservation({
        id: row.id,
        body: { reason: reason.trim() || "Cancelada por soporte MATCHPOINT" },
      });
      if (res.ok) {
        toast({ icon: "check", title: "Reserva cancelada", sub: row.clubName });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div className="label-mp">Plataforma · Reservas</div>
          <h1
            className="font-heading"
            style={{
              margin: "6px 0 0",
              fontSize: 28,
              fontWeight: 950,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
            }}
          >
            Reservas globales<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            {rows.length} reservas recientes · {activeCount} activas o en curso.
          </p>
        </div>
        <div className="card" style={{ padding: "10px 12px", minWidth: 150 }}>
          <div className="label-mp">Acción admin</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 12 }}>
            <Icon name="calendar-x" size={14} />
            Cancelación soporte
          </div>
        </div>
      </header>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1.1fr 1.2fr 1fr 110px 120px",
            gap: 12,
            padding: "11px 14px",
            borderBottom: "1px solid var(--border)",
            color: "var(--muted-fg)",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>Club / cancha</span>
          <span>Organizador</span>
          <span>Horario</span>
          <span>Origen</span>
          <span>Estado</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
            No hay reservas recientes para revisar.
          </div>
        ) : (
          rows.map((row, idx) => {
            const status = STATUS[row.status] ?? { label: row.status, color: "var(--muted-fg)" };
            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1.1fr 1.2fr 1fr 110px 120px",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 14px",
                  borderBottom: idx < rows.length - 1 ? "1px solid var(--border)" : undefined,
                  fontSize: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.clubName}
                  </div>
                  <div style={{ color: "var(--muted-fg)", marginTop: 2 }}>
                    {row.courtName} · {row.sport}
                  </div>
                </div>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.organizerName}
                </span>
                <span style={{ color: "var(--muted-fg)" }}>
                  {dateLabel(row.startsAt)} → {dateLabel(row.endsAt)}
                </span>
                <span style={{ color: "var(--muted-fg)", textTransform: "capitalize" }}>{row.source}</span>
                <span style={{ color: status.color, fontWeight: 900 }}>{status.label}</span>
                <button
                  className="btn"
                  disabled={pending || !canCancel(row.status)}
                  onClick={() => handleCancel(row)}
                  style={{ justifyContent: "center" }}
                >
                  Cancelar
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
