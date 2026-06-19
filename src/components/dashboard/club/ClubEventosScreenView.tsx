// Client view de ClubEventosScreen — layout del mock 1:1 (RoleScreens2.jsx 149-178).
"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import {
  AssignTournamentPartnerModal,
  type VerifiedPartnerOption,
} from "./AssignTournamentPartnerModal";

export type EvStatus = "HOY" | "PRÓXIMO" | "ABIERTO" | "BORRADOR";
export type EventRow = {
  id: string;
  kind: "event" | "tournament";
  d: string;
  m: string;
  n: string;
  sport: string;
  insc: string;
  revenue: string;
  st: EvStatus;
  startsAt: string;
  partnerId?: string | null;
  partnerName?: string | null;
};
export type EventosData = {
  clubId: string | null;
  clubName: string | null;
  events: EventRow[];
  verifiedPartners: VerifiedPartnerOption[];
};

const ST_COLOR: Record<EvStatus, string> = {
  HOY: "#dc2626",
  "PRÓXIMO": "#fbbf24",
  ABIERTO: "var(--primary)",
  BORRADOR: "var(--muted-fg)",
};

const PLACEHOLDER_COUNT = 4;

function EventRowCard({
  e,
  clubId,
  onAssign,
}: {
  e: EventRow;
  clubId: string | null;
  onAssign: (tournament: { id: string; name: string }) => void;
}) {
  const isTournament = e.kind === "tournament";
  const hasPartner = isTournament && !!e.partnerId;

  return (
    <div className="card mp-club-event-row">
      <div
        style={{
          background: "var(--muted)",
          padding: 14,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          className="font-heading"
          style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.9 }}
        >
          {e.d}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 900,
            color: "var(--muted-fg)",
            letterSpacing: "0.16em",
            marginTop: 3,
          }}
        >
          {e.m}
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          className="font-heading"
          style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.015em" }}
        >
          {e.n}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{e.sport}</div>
      </div>
      <div
        style={{
          padding: 14,
          textAlign: "right",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div className="label-mp">Inscritos</div>
        <div className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>
          {e.insc}
        </div>
      </div>
      <div
        style={{
          padding: 14,
          textAlign: "right",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div className="label-mp">Revenue</div>
        <div
          className="font-heading"
          style={{ fontSize: 13, fontWeight: 900, color: "var(--primary)" }}
        >
          {e.revenue}
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <RSPill bg={ST_COLOR[e.st]}>{e.st}</RSPill>
      </div>
      <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {isTournament && hasPartner ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "var(--muted-fg)",
              textAlign: "right",
              lineHeight: 1.35,
              maxWidth: 120,
            }}
          >
            Asignado
            <br />
            <span style={{ color: "var(--fg)", fontWeight: 900 }}>{e.partnerName ?? "Partner"}</span>
          </span>
        ) : isTournament && clubId ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: 10.5 }}
            onClick={() => onAssign({ id: e.id, name: e.n })}
          >
            Asignar
          </button>
        ) : (
          <button className="btn btn-primary" style={{ fontSize: 10.5 }} disabled title="Próximamente">
            Gestionar
          </button>
        )}
      </div>
    </div>
  );
}

function EventPlaceholderCard({ k }: { k: number }) {
  return (
    <div className="mp-club-event-row" style={{ background: "#fafafa", border: "1px dashed var(--border)", borderRadius: 12, opacity: 0.6 }}>
      <div
        style={{
          background: "var(--muted)",
          padding: 14,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          className="font-heading"
          style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.9 }}
        >
          —
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 900,
            color: "var(--muted-fg)",
            letterSpacing: "0.16em",
            marginTop: 3,
          }}
        >
          —
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          className="font-heading"
          style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.015em" }}
        >
          Sin eventos
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>—</div>
      </div>
      <div
        style={{
          padding: 14,
          textAlign: "right",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div className="label-mp">Inscritos</div>
        <div className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>
          —
        </div>
      </div>
      <div
        style={{
          padding: 14,
          textAlign: "right",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div className="label-mp">Revenue</div>
        <div
          className="font-heading"
          style={{ fontSize: 13, fontWeight: 900, color: "var(--muted-fg)" }}
        >
          $—
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <RSPill bg="var(--muted-fg)">—</RSPill>
      </div>
      <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" style={{ fontSize: 10.5 }} disabled>
          Gestionar
        </button>
      </div>
    </div>
  );
}

export function ClubEventosScreenView({ data }: { data: EventosData }) {
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string } | null>(null);

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "events", filter: `club_id=eq.${data.clubId}` },
          { table: "tournaments", filter: `club_id=eq.${data.clubId}` },
          { table: "event_registrations" },
          { table: "registrations" },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const hasReal = data.events.length > 0;
  const count = hasReal ? data.events.length : 0;

  return (
    <>
      <RSHeader
        label="Club · Eventos"
        title={
          <>
            Eventos del club <span className="dot">●</span> {count}
          </>
        }
        action={
          <button
            className="btn btn-primary"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("mp-open-crear-evento", {
                  detail: { clubId: data.clubId, clubName: data.clubName },
                }),
              )
            }
            disabled={!data.clubId}
          >
            <Icon name="plus" size={13} color="#fff" />
            Crear evento
          </button>
        }
      />
      <div className="mp-table-scroll">
        <div style={{ minWidth: 620, display: "flex", flexDirection: "column", gap: 8 }}>
        {hasReal
          ? data.events.map((e) => (
              <EventRowCard
                key={e.id}
                e={e}
                clubId={data.clubId}
                onAssign={setAssignTarget}
              />
            ))
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => (
              <EventPlaceholderCard key={k} k={k} />
            ))}
        </div>
      </div>
      {assignTarget && data.clubId ? (
        <AssignTournamentPartnerModal
          clubId={data.clubId}
          tournamentId={assignTarget.id}
          tournamentName={assignTarget.name}
          partners={data.verifiedPartners}
          onClose={() => setAssignTarget(null)}
        />
      ) : null}
    </>
  );
}
