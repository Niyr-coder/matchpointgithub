"use client";

import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  buildEmailShareUrl,
  buildReferralShareMessage,
  buildReferralUrl,
  buildWhatsAppShareUrl,
  copyShareText,
  getReferralShareUiCopy,
  shareReferralNative,
  type ReferralShareContext,
} from "@/lib/referrals/share";

type Props = {
  referralSlug: string;
  referrerDisplayName?: string | null;
  context?: ReferralShareContext;
  onClose: () => void;
};

function SheetBody({
  referralSlug,
  referrerDisplayName,
  context,
  onClose,
}: Props) {
  const toast = useToast();
  const origin = typeof window !== "undefined" ? window.location.origin : "https://matchpoint.top";
  const url = buildReferralUrl(origin, referralSlug);
  const message = useMemo(
    () => buildReferralShareMessage({ url, referrerDisplayName, context }),
    [url, referrerDisplayName, context],
  );
  const canNativeShare = typeof navigator !== "undefined" && Boolean(navigator.share);
  const copy = getReferralShareUiCopy(context);

  const handleWhatsApp = () => {
    window.open(buildWhatsAppShareUrl(message), "_blank", "noopener,noreferrer");
  };

  const handleEmail = () => {
    window.open(buildEmailShareUrl(copy.emailSubject, message), "_blank");
  };

  const handleCopyMessage = async () => {
    const ok = await copyShareText(message);
    toast({
      icon: ok ? "copy" : "alert-circle",
      title: ok ? "Mensaje copiado" : "No se pudo copiar",
      sub: ok ? "Pégalo en WhatsApp, Telegram o donde quieras" : "Intenta de nuevo",
    });
  };

  const handleCopyLink = async () => {
    const ok = await copyShareText(url);
    toast({
      icon: ok ? "copy" : "alert-circle",
      title: ok ? "Link copiado" : "No se pudo copiar",
      sub: ok ? url : "Intenta de nuevo",
    });
  };

  const handleNativeShare = async () => {
    const result = await shareReferralNative({
      title: copy.nativeShareTitle,
      text: message,
      url,
    });
    if (result === "shared") onClose();
  };

  return (
    <>
      <div className="label-mp">{copy.sheetEyebrow}</div>
      <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", margin: "6px 0" }}>
        {copy.sheetTitle}<span style={{ color: "var(--primary)" }}>.</span>
      </h2>
      <p style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 12, lineHeight: 1.5 }}>
        {copy.sheetHint}
      </p>

      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 14,
          background: "var(--muted)",
          border: "1px solid var(--border)",
          fontSize: 12,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" className="btn btn-primary" style={{ width: "100%", padding: 14 }} onClick={handleWhatsApp}>
          <Icon name="message-circle" size={14} color="#fff" /> {copy.whatsappButtonLabel}
        </button>
        {canNativeShare ? (
          <button type="button" className="btn btn-outline" style={{ width: "100%", padding: 12 }} onClick={() => void handleNativeShare()}>
            <Icon name="share-2" size={13} /> Compartir…
          </button>
        ) : null}
        <button type="button" className="btn btn-outline" style={{ width: "100%", padding: 12 }} onClick={() => void handleCopyMessage()}>
          <Icon name="copy" size={13} /> Copiar mensaje
        </button>
        <button type="button" className="btn btn-outline" style={{ width: "100%", padding: 12 }} onClick={() => void handleCopyLink()}>
          <Icon name="link" size={13} /> Copiar solo el link
        </button>
        <button type="button" className="btn btn-outline" style={{ width: "100%", padding: 12 }} onClick={handleEmail}>
          <Icon name="mail" size={13} /> Email
        </button>
        <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </>
  );
}

/** Sheet para compartir invitación con mensaje prellenado (estilo WhatsApp). */
export function ReferralInviteSheet(props: Props) {
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
        onClick={props.onClose}
      >
        <div
          className="card"
          style={{ width: "100%", borderRadius: "16px 16px 0 0", padding: 20, maxHeight: "90vh", overflow: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <SheetBody {...props} />
        </div>
      </div>

      <div
        className="gw-prereq-desktop-only"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 120,
          padding: 16,
        }}
        onClick={props.onClose}
      >
        <div className="card" style={{ width: "100%", maxWidth: 440, padding: 22, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
          <SheetBody {...props} />
        </div>
      </div>
    </>
  );
}
