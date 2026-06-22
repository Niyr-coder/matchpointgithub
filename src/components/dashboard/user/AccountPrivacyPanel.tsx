"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import {
  cancelAccountClosure,
  getAccountPrivacyStatus,
  requestAccountClosure,
} from "@/server/actions/account-privacy";

/** Panel LOPDP: exportar datos y cerrar cuenta (pantalla /dashboard/user/cuenta). */
export function AccountPrivacyPanel() {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState<string | null>(null);
  const [scheduledDeletionAt, setScheduledDeletionAt] = useState<string | null>(null);
  const [graceDays, setGraceDays] = useState(30);
  const [confirmUser, setConfirmUser] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getAccountPrivacyStatus().then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setUsername(r.data.username);
        setScheduledDeletionAt(r.data.scheduledDeletionAt);
        setGraceDays(r.data.graceDays);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exportData = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/me/export", { credentials: "include" });
        if (!res.ok) {
          toast({ icon: "alert-triangle", title: "No se pudo exportar", sub: "Intenta de nuevo o escribe a privacidad@matchpoint.top" });
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `matchpoint-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ icon: "check", title: "Export listo", sub: "Descargamos un JSON con tus datos." });
      } catch {
        toast({ icon: "alert-triangle", title: "Error de red", sub: "Revisa tu conexión e intenta otra vez." });
      }
    });
  };

  const scheduleClose = async () => {
    if (!username) return;
    const ok = await confirm({
      title: "¿Cerrar tu cuenta?",
      body: `Tu cuenta se eliminará en ${graceDays} días. Puedes cancelar antes de esa fecha. Los datos financieros anonimizados pueden conservarse por ley.`,
      confirmLabel: "Sí, cerrar cuenta",
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const r = await requestAccountClosure({
        confirmUsername: confirmUser.trim(),
        reason: reason.trim() || undefined,
      });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo programar el cierre", sub: r.error.message });
        return;
      }
      setScheduledDeletionAt(r.data.scheduledDeletionAt);
      toast({
        icon: "check",
        title: "Cierre programado",
        sub: `Eliminaremos tu cuenta el ${formatDate(r.data.scheduledDeletionAt)}.`,
      });
      setConfirmUser("");
      setReason("");
    });
  };

  const undoClose = () => {
    startTransition(async () => {
      const r = await cancelAccountClosure();
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: r.error.message });
        return;
      }
      setScheduledDeletionAt(null);
      toast({ icon: "check", title: "Cierre cancelado", sub: "Tu cuenta sigue activa." });
    });
  };

  if (loading) {
    return (
      <div style={{ fontSize: 13, color: "var(--muted-fg)", padding: "8px 0" }}>
        Cargando opciones de privacidad…
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <span className="label-mp" style={{ color: "var(--muted-fg)" }}>
          PRIVACIDAD · LOPDP
        </span>
        <h2
          className="font-heading"
          style={{ margin: "4px 0 6px", fontSize: 20, fontWeight: 900, letterSpacing: "-0.025em" }}
        >
          Tus datos y tu cuenta
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5, maxWidth: 640 }}>
          Puedes descargar una copia de tus datos o solicitar el cierre de cuenta. También puedes escribir a{" "}
          <a href="mailto:privacidad@matchpoint.top" style={{ color: "inherit", fontWeight: 700 }}>
            privacidad@matchpoint.top
          </a>
          .
        </p>
      </div>

      {scheduledDeletionAt ? (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.25)",
            fontSize: 13,
            lineHeight: 1.45,
            color: "#991b1b",
          }}
        >
          <strong>Cierre programado.</strong> Eliminaremos tu cuenta el{" "}
          <strong>{formatDate(scheduledDeletionAt)}</strong>. Si cambiaste de opinión, puedes cancelarlo.
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={undoClose}
            style={{ display: "block", marginTop: 10, fontSize: 12 }}
          >
            Cancelar cierre
          </button>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn" disabled={pending} onClick={exportData}>
          <Icon name="download" size={13} />
          {pending ? "Preparando…" : "Descargar mis datos"}
        </button>
        <Link href="/legal/privacidad" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700 }}>
          Política de privacidad
        </Link>
        <Link href="/legal/terminos" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700 }}>
          Términos
        </Link>
      </div>

      {!scheduledDeletionAt ? (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800 }}>Cerrar cuenta</div>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
            Tras confirmar, tienes {graceDays} días para cambiar de opinión. Después borramos tu perfil y datos
            personales; el historial deportivo público puede quedar anonimizado.
          </p>
          <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
            Escribe tu usuario (@{username}) para confirmar
          </label>
          <input
            value={confirmUser}
            onChange={(e) => setConfirmUser(e.target.value)}
            placeholder={username ?? "tu_usuario"}
            autoComplete="off"
            style={{
              maxWidth: 280,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              fontSize: 14,
            }}
          />
          <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
            Motivo (opcional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Cuéntanos por qué te vas (opcional)"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              fontSize: 13,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={pending || !confirmUser.trim() || confirmUser.trim() !== username}
            onClick={() => void scheduleClose()}
            style={{
              alignSelf: "flex-start",
              fontSize: 12,
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.35)",
              color: "#dc2626",
            }}
          >
            <Icon name="user-x" size={13} color="#dc2626" />
            {pending ? "Procesando…" : "Cerrar mi cuenta"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-EC", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
