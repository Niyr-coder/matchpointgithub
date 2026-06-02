"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (payload: string) => void;
  disabled?: boolean;
};

export function CheckInQrScanner({ open, onClose, onScan, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const titleId = useId();

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setError(null);
      return;
    }

    const BarcodeDetectorCtor = (
      globalThis as typeof globalThis & { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }
    ).BarcodeDetector;

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      setError("Tu navegador no soporta escaneo con cámara. Usa el código manual.");
      return;
    }

    let cancelled = false;
    const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (cancelled || !videoRef.current || disabled) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue?.trim();
            if (raw) {
              stopCamera();
              onScan(raw);
              onClose();
              return;
            }
          } catch {
            /* frame sin lectura */
          }
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        };
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        setError("No pudimos abrir la cámara. Revisa permisos o usa el código manual.");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, disabled, onClose, onScan, stopCamera]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: "100%", padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div id={titleId} className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
            Escanear QR
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={14} />
          </button>
        </div>
        {supported ? (
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: "100%",
              marginTop: 14,
              borderRadius: 12,
              background: "#0a0a0a",
              aspectRatio: "1",
              objectFit: "cover",
            }}
          />
        ) : null}
        {error ? (
          <p style={{ fontSize: 12, color: "#dc2626", marginTop: 12 }}>{error}</p>
        ) : (
          <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 10 }}>
            Apunta al QR de la app del jugador (Mis reservas).
          </p>
        )}
      </div>
    </div>
  );
}
