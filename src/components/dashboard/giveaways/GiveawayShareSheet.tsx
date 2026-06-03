"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { getBrowserClient } from "@/lib/db/client.browser";
import { STORAGE_BUCKETS, UPLOAD_LIMITS } from "@/lib/storage/buckets";
import { submitGiveawayShareClaim } from "@/server/actions/giveaways";

const BUCKET = STORAGE_BUCKETS.PAYMENT_PROOFS;
const MAX_BYTES = UPLOAD_LIMITS[BUCKET].maxBytes;
const ALLOWED_PREFIXES = UPLOAD_LIMITS[BUCKET].mimePrefix;

type Props = {
  giveawayId: string;
  clubName: string;
  pending?: boolean;
  onClose: () => void;
  onSubmitted: () => void;
};

/** Sheet para enviar captura de share en stories (validación manual). */
export function GiveawayShareSheet({ giveawayId, clubName, pending, onClose, onSubmitted }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleFile = async (file: File) => {
    setError(null);
    if (!ALLOWED_PREFIXES.some((p) => file.type.startsWith(p))) {
      setError("Formato no permitido. Sube una imagen (JPG/PNG/WEBP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Archivo muy grande. Máximo ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }

    setBusy(true);
    try {
      const supabase = getBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sesión expirada. Vuelve a iniciar sesión.");
        return;
      }

      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${user.id}/giveaways/${giveawayId}/share-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(`No se pudo subir la captura: ${upErr.message}`);
        return;
      }

      startTransition(async () => {
        const res = await submitGiveawayShareClaim({ giveawayId, evidenceUrl: path });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        toast({
          icon: "check",
          title: "Captura enviada",
          sub: "El club revisará tu share y sumará las entradas si todo está bien.",
        });
        onSubmitted();
        onClose();
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="gw-prereq-mobile-only"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 120,
          display: "flex",
          alignItems: "flex-end",
        }}
        onClick={onClose}
      >
        <div
          className="card"
          style={{ width: "100%", borderRadius: "16px 16px 0 0", padding: 20, maxHeight: "85vh", overflow: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="label-mp">Compartir en stories</div>
          <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", margin: "6px 0" }}>
            Sube tu captura<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <p style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 14, lineHeight: 1.5 }}>
            Comparte el sorteo de {clubName} en tus stories y sube una captura. El staff validará manualmente.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", padding: 14 }}
            disabled={busy || pending}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size={13} color="#fff" /> {busy ? "Subiendo…" : "Elegir captura"}
          </button>
          {error && <p style={{ fontSize: 11.5, color: "var(--danger-fg)", marginTop: 10 }}>{error}</p>}
          <button type="button" className="btn btn-outline" style={{ width: "100%", marginTop: 10 }} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>

      <div
        className="gw-prereq-desktop-only"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 16 }}
        onClick={onClose}
      >
        <div className="card" style={{ width: "100%", maxWidth: 440, padding: 22, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
          <div className="label-mp">Compartir en stories</div>
          <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", margin: "6px 0" }}>
            Sube tu captura<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <p style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 14, lineHeight: 1.5 }}>
            Comparte el sorteo de {clubName} en tus stories y sube una captura. El staff validará manualmente.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", padding: 14 }}
            disabled={busy || pending}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size={13} color="#fff" /> {busy ? "Subiendo…" : "Elegir captura"}
          </button>
          {error && <p style={{ fontSize: 11.5, color: "var(--danger-fg)", marginTop: 10 }}>{error}</p>}
          <button type="button" className="btn btn-outline" style={{ width: "100%", marginTop: 10 }} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
