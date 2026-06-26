"use client";

// Composer del detalle admin de un evento. Solo orquesta: back link,
// realtime refresh, KPIs derivados y el grid de secciones. Cada sección
// vive en ./event-detail/* y es el extension point de un agente distinto.

import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { AdminEventDetail } from "@/server/actions/events";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { Kpi, fmtMoney } from "./event-detail/primitives";
import { EventHeaderCard } from "./event-detail/EventHeaderCard";
import { EventActionsBar } from "./event-detail/EventActionsBar";
import { EventRegistrationsTable } from "./event-detail/EventRegistrationsTable";
import { EventTransactionsTable } from "./event-detail/EventTransactionsTable";
import { EventAuditLog } from "./event-detail/EventAuditLog";

export function AdminEventDetailView({ data }: { data: AdminEventDetail }) {
  useRealtimeRefresh([
    { table: "events", filter: `id=eq.${data.event.id}` },
    { table: "event_registrations", filter: `event_id=eq.${data.event.id}` },
    { table: "transactions", filter: `ref_id=eq.${data.event.id}` },
  ], { debounceMs: 3000 });

  const activeRegs = data.registrations.filter(
    (r) => r.status === "registered" || r.status === "attended",
  );
  const capturedTxs = data.transactions.filter((t) => t.status === "captured");
  const totalRevenueCents = capturedTxs.reduce((s, t) => s + t.amountCents, 0);
  const currency = data.transactions[0]?.currency ?? data.event.currency ?? "USD";

  return (
    <>
      <Link
        href="/dashboard/admin/admin-events"
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--muted-fg)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <Icon name="arrow-left" size={12} /> Volver a eventos
      </Link>

      <div className="card" style={{ padding: 28, position: "relative", overflow: "hidden" }}>
        <div className="mp-admin-event-header">
          <EventHeaderCard data={data} />
          <EventActionsBar data={data} />
        </div>
      </div>

      <div className="mp-partner-torneo-kpis" style={{ marginTop: 16 }}>
        <Kpi
          label="Capacidad"
          value={data.event.capacity != null ? `${activeRegs.length}/${data.event.capacity}` : `${activeRegs.length}`}
        />
        <Kpi
          label="Cancelados"
          value={String(data.registrations.filter((r) => r.status === "cancelled").length)}
        />
        <Kpi label="Transacciones" value={String(capturedTxs.length)} color="#0ea5e9" />
        <Kpi label="Revenue" value={fmtMoney(totalRevenueCents, currency)} color="var(--primary)" />
      </div>

      <EventRegistrationsTable regs={data.registrations} eventId={data.event.id} />
      <EventTransactionsTable transactions={data.transactions} />
      <EventAuditLog eventId={data.event.id} />
    </>
  );
}
