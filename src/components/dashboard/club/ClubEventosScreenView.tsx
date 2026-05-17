// Client view de ClubEventosScreen — layout del mock 1:1 (RoleScreens2.jsx 149-178).
"use client";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type EvStatus = "HOY" | "PRÓXIMO" | "ABIERTO" | "BORRADOR";
export type EventRow = {
  id: string;
  d: string;
  m: string;
  n: string;
  sport: string;
  insc: string;
  revenue: string;
  st: EvStatus;
};
export type EventosData = { clubId: string | null; events: EventRow[] };

const ST_COLOR: Record<EvStatus, string> = {
  HOY: "#dc2626",
  "PRÓXIMO": "#fbbf24",
  ABIERTO: "var(--primary)",
  BORRADOR: "var(--muted-fg)",
};

const PLACEHOLDER_COUNT = 4;

function EventRowCard({ e }: { e: EventRow }) {
  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "70px 1fr 100px 100px 110px 110px",
        alignItems: "stretch",
      }}
    >
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
        <button className="btn btn-primary" style={{ fontSize: 10.5 }}>
          Gestionar
        </button>
      </div>
    </div>
  );
}

function EventPlaceholderCard({ k }: { k: number }) {
  return (
    <div
      style={{
        padding: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "70px 1fr 100px 100px 110px 110px",
        alignItems: "stretch",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
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
  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "events", filter: `club_id=eq.${data.clubId}` },
          { table: "event_registrations" },
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
                  detail: { clubId: data.clubId },
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hasReal
          ? data.events.map((e) => <EventRowCard key={e.id} e={e} />)
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => (
              <EventPlaceholderCard key={k} k={k} />
            ))}
      </div>
    </>
  );
}
