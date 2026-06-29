"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  ensureTournamentDisplayToken,
  rotateTournamentDisplayToken,
} from "@/server/actions/tournament-live";

const TV_URL =
  process.env.NEXT_PUBLIC_TV_URL ?? "https://tv.matchpoint.top";

export function TournamentVenueDisplayPanel({
  tournamentId,
  slug,
  initialToken,
  readOnly,
  className,
}: {
  tournamentId: string;
  slug: string;
  initialToken: string | null;
  readOnly?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const fetchToken = useCallback(() => {
    setLinkError(null);
    startTx(async () => {
      const res = await ensureTournamentDisplayToken({ tournamentId });
      if (res.ok) setToken(res.data.token);
      else setLinkError(res.error.message);
    });
  }, [tournamentId]);

  useEffect(() => {
    if (token) return;
    fetchToken();
  }, [token, fetchToken]);

  const liveUrl = token ? `${TV_URL}/${slug}?k=${token}` : null;
  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://matchpoint.top"}/eventos/${slug}`;

  const copy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ icon: "check", title: `${label} copiado` });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", tone: "error" });
    }
  };

  const onRotate = async () => {
    const ok = await confirm({
      title: "Rotar link de pantalla",
      body: "El link anterior dejará de funcionar. ¿Generar uno nuevo?",
      confirmLabel: "Rotar",
    });
    if (!ok) return;
    setBusy(true);
    startTx(async () => {
      const res = await rotateTournamentDisplayToken({ tournamentId });
      setBusy(false);
      if (res.ok) {
        setToken(res.data.token);
        toast({ icon: "check", title: "Link actualizado" });
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message, tone: "error" });
      }
    });
  };

  return (
    <div className={`card mp-partner-torneo-rail-card mp-tv-rail-panel${className ? ` ${className}` : ""}`} style={{ padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="label-mp">Pantalla del venue</div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.5 }}>
          Abre este link en una TV o proyector. Se actualiza en tiempo real sin iniciar sesión.
        </div>
      </div>

      {liveUrl ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <code
            style={{
              display: "block",
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--muted)",
              fontSize: 11,
              wordBreak: "break-all",
              lineHeight: 1.45,
            }}
          >
            {liveUrl}
          </code>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary mp-tv-rail-btn"
              disabled={busy}
              onClick={() => copy(liveUrl, "Link TV")}
            >
              <Icon name="copy" size={12} color="#fff" />
              Copiar link TV
            </button>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn mp-tv-rail-btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
              <Icon name="external-link" size={12} />
              Abrir pantalla
            </a>
            {!readOnly && (
              <button
                type="button"
                className="btn mp-tv-rail-btn"
                disabled={busy}
                style={{ background: "#fff", border: "1px solid var(--border)" }}
                onClick={onRotate}
              >
                <Icon name="refresh-cw" size={12} />
                Rotar link
              </button>
            )}
          </div>
        </div>
      ) : linkError ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: "var(--error, #dc2626)" }}>{linkError}</div>
          {!readOnly && (
            <button type="button" className="btn" style={{ fontSize: 11 }} onClick={fetchToken}>
              Reintentar
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>Generando link…</div>
      )}

      <div
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <button
          type="button"
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
          onClick={() => copy(publicUrl, "Link público")}
        >
          <Icon name="share-2" size={12} />
          Copiar página pública
        </button>
      </div>
    </div>
  );
}
