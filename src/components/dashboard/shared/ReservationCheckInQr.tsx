"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { buildCheckInQrPayload, formatCheckInLabel } from "@/lib/checkin/code";

type Props = {
  clubId: string;
  reservationId: string;
  source: string;
  checkInCode: string | null;
  compact?: boolean;
};

export function ReservationCheckInQr({ clubId, source, checkInCode, compact }: Props) {
  const [open, setOpen] = useState(false);
  if (!checkInCode) return null;

  const label = formatCheckInLabel(source, checkInCode);
  const payload = buildCheckInQrPayload(clubId, checkInCode);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(payload)}`;

  if (compact) {
    return (
      <>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 10.5, padding: "6px 12px" }}
          onClick={() => setOpen(true)}
        >
          <Icon name="qr-code" size={12} />
          {label}
        </button>
        {open ? <QrOverlay label={label} qrSrc={qrSrc} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }

  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
      <button type="button" className="btn btn-primary" style={{ fontSize: 10.5 }} onClick={() => setOpen(true)}>
        <Icon name="qr-code" size={12} color="#fff" />
        Mostrar QR · {label}
      </button>
      {open ? <QrOverlay label={label} qrSrc={qrSrc} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function QrOverlay({
  label,
  qrSrc,
  onClose,
}: {
  label: string;
  qrSrc: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: 24, textAlign: "center", maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
        <div className="font-heading" style={{ fontSize: 15, fontWeight: 900 }}>
          Código de check-in
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: "ui-monospace, monospace",
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </div>
        <img src={qrSrc} alt={`QR ${label}`} width={220} height={220} style={{ marginTop: 16, borderRadius: 12 }} />
        <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 12 }}>
          Muestra esto en recepción para escanear o dictar el código.
        </p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={onClose}>
          Listo
        </button>
      </div>
    </div>
  );
}
