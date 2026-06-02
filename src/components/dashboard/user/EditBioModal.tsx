// Modal dedicado para editar la bio del perfil propio. Se abre desde el botón
// "Editar bio" del header. Guarda vía updateProfile({ bio }).
"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { updateProfile } from "@/server/actions/auth";

const MAX = 280;

export function EditBioModal({ initialBio, onClose }: { initialBio: string | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [bio, setBio] = useState(initialBio ?? "");

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (pending) return;
    startTransition(async () => {
      const trimmed = bio.trim();
      const res = await updateProfile({ bio: trimmed === "" ? null : trimmed });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Bio actualizada" });
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
        animation: "mp-bio-fade 160ms var(--ease-out, ease)",
      }}
    >
      <style>{`@keyframes mp-bio-fade{from{opacity:0}to{opacity:1}}
        @keyframes mp-bio-pop{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="card"
        style={{
          width: "100%",
          maxWidth: 460,
          padding: 22,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
          animation: "mp-bio-pop 180ms var(--ease-out, ease)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
            Editar bio
          </h2>
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <textarea
          autoFocus
          value={bio}
          maxLength={MAX}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Cuéntale a la comunidad sobre tu juego…"
          style={{
            width: "100%",
            minHeight: 110,
            resize: "vertical",
            padding: "12px 14px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            color: "#0a0a0a",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {bio.length}/{MAX}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} className="btn btn-outline" disabled={pending}>
              Cancelar
            </button>
            <button onClick={save} className="btn btn-primary" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
              {!pending && <Icon name="check" size={13} />}
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
