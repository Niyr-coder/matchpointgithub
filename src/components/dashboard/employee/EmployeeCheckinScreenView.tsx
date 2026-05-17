// Client view del EmployeeCheckinScreen — layout 1:1 del mock.
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { recordCheckIn } from "@/server/actions/walkins";

export type Status = "arriving" | "on-time" | "class" | "walkin";
export type CheckinQueueRow = {
  id: string;
  t: string;
  n: string;
  c: string;
  d: string;
  code: string;
  sport: string;
  st: Status;
  players: number;
};
export type CheckinData = {
  clubId: string | null;
  queue: CheckinQueueRow[];
  upcomingCount: number;
};

const ST_STYLES: Record<Status, { bg: string; l: string }> = {
  arriving: { bg: "#fbbf24", l: "LLEGANDO" },
  "on-time": { bg: "var(--primary)", l: "A TIEMPO" },
  class: { bg: "#7c3aed", l: "CLASE" },
  walkin: { bg: "#dc2626", l: "WALK-IN" },
};

const PLACEHOLDER_COUNT = 4;

function QueuePlaceholderCard() {
  return (
    <div
      style={{
        padding: 14,
        display: "grid",
        gridTemplateColumns: "60px 38px 1fr auto auto auto",
        gap: 14,
        alignItems: "center",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div
        className="font-heading"
        style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--muted-fg)" }}
      >
        —
      </div>
      <span
        style={{
          padding: "4px 9px",
          borderRadius: 6,
          background: "var(--muted)",
          fontSize: 11,
          fontWeight: 900,
          textAlign: "center",
          color: "var(--muted-fg)",
        }}
      >
        —
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--muted-fg)" }}>Sin check-ins próximos</div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>— · — · —</div>
      </div>
      <RSPill bg="var(--muted-fg)">—</RSPill>
      <button
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "var(--muted)",
          border: 0,
          cursor: "not-allowed",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.6,
        }}
        disabled
      >
        <Icon name="phone" size={12} />
      </button>
      <button className="btn" style={{ fontSize: 10.5, padding: "7px 14px", opacity: 0.6 }} disabled>
        <Icon name="check" size={12} />
        Check-in
      </button>
    </div>
  );
}

export function EmployeeCheckinScreenView({ data }: { data: CheckinData }) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const handleCheckIn = (reservationId: string) => {
    if (!data.clubId) return;
    startTransition(async () => {
      const res = await recordCheckIn({
        clubId: data.clubId!,
        reservationId,
        method: "manual",
      });
      if (res.ok) toast({ icon: "check", title: "Check-in registrado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
          { table: "check_ins", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const hasQueue = data.queue.length > 0;

  return (
    <>
      <RSHeader
        label="Recepción · Check-in"
        title={
          <>
            Check-in <span className="dot">●</span> {data.upcomingCount} próximos
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!hasQueue} style={{ opacity: hasQueue ? 1 : 0.5 }}>
              <Icon name="qr-code" size={13} color="#fff" />
              Escanear QR
            </button>
            <button className="btn" style={{ background: "#fff", border: RS_BORDER }}>
              <Icon name="search" size={12} />
              Buscar código
            </button>
          </div>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hasQueue
            ? data.queue.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "60px 38px 1fr auto auto auto",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <div
                    className="font-heading"
                    style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em" }}
                  >
                    {r.t}
                  </div>
                  <span
                    style={{
                      padding: "4px 9px",
                      borderRadius: 6,
                      background: "var(--muted)",
                      fontSize: 11,
                      fontWeight: 900,
                      textAlign: "center",
                    }}
                  >
                    {r.c}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{r.n}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                      {r.sport} · {r.d} · {r.players}p ·{" "}
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>{r.code}</span>
                    </div>
                  </div>
                  <RSPill bg={ST_STYLES[r.st].bg}>{ST_STYLES[r.st].l}</RSPill>
                  <button
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: "var(--muted)",
                      border: 0,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="phone" size={12} />
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 10.5, padding: "7px 14px" }}
                    onClick={() => handleCheckIn(r.id)}
                    disabled={isPending}
                  >
                    <Icon name="check" size={12} color="#fff" />
                    Check-in
                  </button>
                </div>
              ))
            : Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => <QueuePlaceholderCard key={i} />)}
        </div>
        <div
          className="card"
          style={{
            padding: 22,
            textAlign: "center",
            alignSelf: "flex-start",
            background: "#0a0a0a",
            color: "#fff",
          }}
        >
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>
            Scanner
          </div>
          <div
            style={{
              width: 180,
              height: 180,
              margin: "20px auto",
              borderRadius: 14,
              background: "#1a1a1a",
              border: "2px dashed rgba(255,255,255,0.2)",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="qr-code" size={60} color="rgba(255,255,255,0.3)" />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: "var(--primary)",
                boxShadow: "0 0 10px var(--primary)",
                animation: "mp-pulse 2s infinite",
              }}
            />
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: "-0.015em",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            Acerca el QR del cliente<span style={{ color: "#fbbf24" }}>.</span>
          </div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
            O escribe el código manualmente
          </div>
          <input
            placeholder="RV-XXXX"
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
              width: "100%",
              textAlign: "center",
              letterSpacing: "0.1em",
            }}
          />
        </div>
      </div>
    </>
  );
}
