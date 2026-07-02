"use client";

// Composer del detalle admin de un torneo. Solo orquesta: back link,
// realtime refresh, KPIs y composición de secciones. Cada sección vive
// en ./tournament-detail/* y es extension point de un agente distinto.

import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { AdminTournamentDetail } from "@/server/actions/tournaments";
import { useScopedRealtimeRefresh, payloadId } from "../useScopedRealtimeRefresh";
import { Kpi, fmtMoney } from "./event-detail/primitives";
import { TournamentHeaderCard } from "./tournament-detail/TournamentHeaderCard";
import { TournamentActionsBar } from "./tournament-detail/TournamentActionsBar";
import { TournamentRegistrationsTable } from "./tournament-detail/TournamentRegistrationsTable";
import { TournamentTransactionsTable } from "./tournament-detail/TournamentTransactionsTable";
import { TournamentAuditLog } from "./tournament-detail/TournamentAuditLog";
import { TournamentBracketsPanel } from "./tournament-detail/TournamentBracketsPanel";
import { TournamentSubstitutionsTable } from "./tournament-detail/TournamentSubstitutionsTable";
import { AdminOverridesPanel } from "../partner/AdminOverridesPanel";

export function AdminTournamentDetailView({ data }: { data: AdminTournamentDetail }) {
  // bracket_matches no tiene tournament_id → relevancia client-side por los
  // brackets de ESTE torneo (sin esto, cada score de la plataforma refrescaba
  // esta pantalla — audit de costos 2026-07-01).
  const bracketIdSet = new Set(data.brackets.map((b) => b.id));
  useScopedRealtimeRefresh(
    [
      { table: "tournaments", filter: `id=eq.${data.tournament.id}` },
      { table: "registrations", filter: `tournament_id=eq.${data.tournament.id}` },
      { table: "transactions", filter: `ref_id=eq.${data.tournament.id}` },
      { table: "brackets", filter: `tournament_id=eq.${data.tournament.id}` },
      { table: "bracket_matches" },
    ],
    {
      isRelevant: (table, payload) => {
        if (table === "bracket_matches") {
          const bid = payloadId(payload, "bracket_id");
          return bid == null ? true : bracketIdSet.has(bid);
        }
        return true;
      },
    },
  );

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
        <div className="mp-admin-event-header">
          <TournamentHeaderCard data={data} currency={currency} />
          <TournamentActionsBar data={data} />
        </div>
      </div>

      <div
        className="card mp-admin-event-mgmt-banner"
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px dashed #7c3aed",
          background: "rgba(124,58,237,0.04)",
        }}
      >
        <div>
          <div className="label-mp">Gestión completa</div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.45 }}>
            Este detalle cubre soporte, auditoría y acciones administrativas puntuales. La operación
            completa vive en la vista de gestión: categorías, cronograma, premios, inscritos y
            bracket visual.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {["Categorías", "Cronograma", "Premios", "Inscripciones", "Brackets"].map((item) => (
              <span
                key={item}
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  color: "var(--muted-fg)",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <Link
          href={`/dashboard/partner/torneo/${data.tournament.id}`}
          className="btn btn-primary"
          style={{ whiteSpace: "nowrap", textDecoration: "none" }}
        >
          <Icon name="external-link" size={13} color="#fff" />
          Abrir gestión
        </Link>
      </div>

      <div style={{ marginTop: 16 }}>
        <AdminOverridesPanel
          tournamentId={data.tournament.id}
          status={data.tournament.status}
        />
      </div>

      <div className="mp-partner-torneo-kpis" style={{ marginTop: 16 }}>
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
      <TournamentBracketsPanel data={data} />
      <TournamentTransactionsTable transactions={data.transactions} />

      <div className="card" style={{ marginTop: 16, padding: 18 }}>
        <div className="label-mp" style={{ marginBottom: 12 }}>Sustituciones de jugadores</div>
        <TournamentSubstitutionsTable tournamentId={data.tournament.id} />
      </div>

      <TournamentAuditLog tournamentId={data.tournament.id} />
    </>
  );
}
