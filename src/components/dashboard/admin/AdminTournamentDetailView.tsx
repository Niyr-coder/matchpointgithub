"use client";

// Composer del detalle admin de un torneo. Solo orquesta: back link,
// realtime refresh, KPIs y composición de secciones. Cada sección vive
// en ./tournament-detail/* y es extension point de un agente distinto.

import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { AdminTournamentDetail } from "@/server/actions/tournaments";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { Kpi, fmtMoney } from "./event-detail/primitives";
import { TournamentHeaderCard } from "./tournament-detail/TournamentHeaderCard";
import { TournamentActionsBar } from "./tournament-detail/TournamentActionsBar";
import { TournamentRegistrationsTable } from "./tournament-detail/TournamentRegistrationsTable";
import { TournamentTransactionsTable } from "./tournament-detail/TournamentTransactionsTable";
import { TournamentAuditLog } from "./tournament-detail/TournamentAuditLog";

export function AdminTournamentDetailView({ data }: { data: AdminTournamentDetail }) {
  useRealtimeRefresh([
    { table: "tournaments", filter: `id=eq.${data.tournament.id}` },
    { table: "registrations", filter: `tournament_id=eq.${data.tournament.id}` },
    { table: "transactions", filter: `ref_id=eq.${data.tournament.id}` },
  ]);

  const acceptedRegs = data.registrations.filter(
    (r) => r.status === "accepted" || r.status === "pending",
  );
  const capturedTxs = data.transactions.filter((t) => t.status === "captured");
  const totalRevenueCents = capturedTxs.reduce((s, t) => s + t.amountCents, 0);
  const currency = data.transactions[0]?.currency ?? data.tournament.currency ?? "USD";

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

      <div className="card" style={{ padding: 28, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <TournamentHeaderCard data={data} currency={currency} />
          <TournamentActionsBar data={data} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 16 }}>
        <Kpi
          label="Inscripciones"
          value={
            data.tournament.maxParticipants != null
              ? `${acceptedRegs.length}/${data.tournament.maxParticipants}`
              : `${acceptedRegs.length}`
          }
        />
        <Kpi
          label="Rechazadas/Retiradas"
          value={String(
            data.registrations.filter((r) => r.status === "rejected" || r.status === "withdrawn").length,
          )}
        />
        <Kpi label="Transacciones" value={String(capturedTxs.length)} color="#0ea5e9" />
        <Kpi label="Revenue" value={fmtMoney(totalRevenueCents, currency)} color="var(--primary)" />
      </div>

      <TournamentRegistrationsTable regs={data.registrations} />
      <TournamentTransactionsTable transactions={data.transactions} />
      <TournamentAuditLog tournamentId={data.tournament.id} />
    </>
  );
}
