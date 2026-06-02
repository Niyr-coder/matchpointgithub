"use client";

import { ImageUploader } from "@/components/ImageUploader";

export function AvatarOverlay({
  userId,
  currentUrl,
  onClose,
  onUploaded,
}: {
  userId: string;
  currentUrl: string | null;
  onClose: () => void;
  onUploaded: (publicUrl: string) => Promise<void> | void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ padding: 24, maxWidth: 400, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading" style={{ margin: "0 0 12px", fontWeight: 900 }}>
          Cambiar foto
        </h3>
        <ImageUploader
          bucket="avatars"
          folder={userId}
          filenamePrefix="avatar"
          currentUrl={currentUrl}
          shape="circle"
          onUploaded={onUploaded}
        />
        <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
