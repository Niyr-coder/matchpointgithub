// Client view del EmployeeCheckinScreen — layout 1:1 del mock.
"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { checkInByCode, recordCheckIn } from "@/server/actions/walkins";
import { markReservationNoShow } from "@/server/actions/reservations";
import { usePromptModal } from "../widgets/PromptModal";
import type { ReceptionQueueItem } from "@/server/queries/reception-queue";
import { CheckInQrScanner } from "./CheckInQrScanner";

export type CheckinData = {
  clubId: string | null;
  queue: ReceptionQueueItem[];
  upcomingCount: number;
};

const ST_STYLES: Record<ReceptionQueueItem["st"], { bg: string; l: string }> = {
  arriving: { bg: "#fbbf24", l: "LLEGANDO" },
  "on-time": { bg: "var(--primary)", l: "A TIEMPO" },
  walkin: { bg: "#dc2626", l: "WALK-IN" },
};

const PLACEHOLDER_COUNT = 4;

function QueuePlaceholderCard() {
  return (
    <div
      style={{
        padding: 14,
        display: "grid",
        gridTemplateColumns: "60px 38px 1fr auto auto auto auto",
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) {
      setCodeInput(q.toUpperCase());
      codeRef.current?.focus();
    }
  }, [searchParams]);

  const finishCheckIn = useCallback(
    (res: { ok: true; data: { id: string; alreadyDone?: boolean } } | { ok: false; error: { message: string } }) => {
      if (res.ok) {
        toast({
          icon: "check",
          title: res.data.alreadyDone ? "Ya tenía check-in" : "Check-in registrado",
          sub: res.data.alreadyDone
            ? "Esta reserva ya estaba en cancha"
            : "La reserva pasó a «En cancha» y salió de la cola",
        });
        setCodeInput("");
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    },
    [router, toast],
  );

  const handleCheckIn = (reservationId: string) => {
    if (!data.clubId) return;
    startTransition(async () => {
      const res = await recordCheckIn({
        clubId: data.clubId!,
        reservationId,
        method: "manual",
      });
      finishCheckIn(res);
    });
  };

  const handleNoShow = async (reservationId: string, playerName: string) => {
    if (!data.clubId) return;
    const ok = await confirm({
      title: "Marcar no-show",
      body: `¿${playerName} no se presentó a la reserva?`,
      confirmLabel: "Marcar no-show",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await markReservationNoShow({
        id: reservationId,
        clubId: data.clubId!,
      });
      if (res.ok) {
        toast({
          icon: "check",
          title: "No-show registrado",
          sub: "La reserva salió de la cola de check-in",
        });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleCheckInPayload = (payload: string, method: "qr" | "manual") => {
    if (!data.clubId || !payload.trim()) return;
    startTransition(async () => {
      const res = await checkInByCode({
        clubId: data.clubId!,
        payload: payload.trim(),
        method,
      });
      finishCheckIn(res);
    });
  };

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
          { table: "check_ins", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId, debounceMs: 400 },
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
            <button
              type="button"
              className="btn btn-primary"
              disabled={!data.clubId || isPending}
              onClick={() => setScannerOpen(true)}
            >
              <Icon name="qr-code" size={13} color="#fff" />
              Escanear QR
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "#fff", border: RS_BORDER }}
              disabled={!data.clubId}
              onClick={() => codeRef.current?.focus()}
            >
              <Icon name="search" size={12} />
              Buscar código
            </button>
          </div>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        <div className="mp-table-scroll">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 560 }}>
          {hasQueue
            ? data.queue.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "60px 38px 1fr auto auto auto auto",
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
                    type="button"
                    className="btn"
                    style={{
                      fontSize: 10,
                      padding: "7px 10px",
                      background: "#fff",
                      border: RS_BORDER,
                      color: "#dc2626",
                    }}
                    onClick={() => handleNoShow(r.id, r.n)}
                    disabled={isPending}
                  >
                    No-show
                  </button>
                  <button
                    type="button"
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
            ref={codeRef}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCheckInPayload(codeInput, "manual");
            }}
            placeholder="RV-XXXXXX"
            disabled={!data.clubId || isPending}
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
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 10, width: "100%", fontSize: 11 }}
            disabled={!data.clubId || !codeInput.trim() || isPending}
            onClick={() => handleCheckInPayload(codeInput, "manual")}
          >
            Confirmar código
          </button>
          <button
            type="button"
            className="btn"
            style={{
              marginTop: 8,
              width: "100%",
              fontSize: 11,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
            }}
            disabled={!data.clubId || isPending}
            onClick={() => setScannerOpen(true)}
          >
            Abrir cámara
          </button>
        </div>
      </div>
      <CheckInQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(payload) => handleCheckInPayload(payload, "qr")}
        disabled={isPending}
      />
    </>
  );
}
