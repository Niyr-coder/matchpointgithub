// FriendCard — card de jugador reutilizable (amigos, sugerencias, descubrir).
// Extraída de AmigosScreenView para reusarla también en previews de flair
// sin recrearla. Self-contained: no importa nada de AmigosScreenView.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { NameplateMark } from "@/components/dashboard/widgets/NameplateMark";
import { resolveNameplateKey, type NameplateKey } from "@/lib/profile/nameplates";
import { useToast } from "../ToastProvider";
import { startConversation } from "@/server/actions/messaging";
import { sendFriendRequest } from "@/server/actions/friends";

export type FriendLite = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl?: string | null;
  city: string;
  sport: string;
  level: number;
  isOfficial: boolean;
  nameplateKey?: NameplateKey | null;
  isPremium: boolean;
  friendSince?: string | null;
  matchesTogether?: number;
  h2hWins?: number;
  h2hLosses?: number;
  teamWins?: number;
  teamLosses?: number;
  lastPlayedAt?: string | null;
};

export const REQ_AVATARS = [
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

export function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function FriendCard({
  f,
  index,
  isSuggestion,
  preview = false,
}: {
  f: FriendLite;
  index: number;
  isSuggestion: boolean;
  // Preview no interactiva: botones inertes y nombre sin link.
  preview?: boolean;
}) {
  // Hooks SIEMPRE antes de cualquier return (rules-of-hooks).
  const router = useRouter();
  const toast = useToast();
  const [msgPending, startMsg] = useTransition();
  const [addPending, startAdd] = useTransition();
  const [addState, setAddState] = useState<"idle" | "sent">("idle");

  if (f.isOfficial) {
    return <OfficialFriendCard f={f} />;
  }

  const profileHref = !preview && f.username ? `/dashboard/user/players/${f.username}` : null;
  const headerBg = "linear-gradient(135deg, #064e3b, #10b981)";

  const nameEl = (
    <div
      className="font-heading"
      style={{
        fontSize: 14,
        fontWeight: 900,
        letterSpacing: "-0.01em",
        lineHeight: 1.15,
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        maxWidth: "100%",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
      <NameplateMark nameplateKey={resolveNameplateKey(f.isOfficial, f.nameplateKey)} size="sm" />
    </div>
  );

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ position: "relative", height: 76, background: headerBg, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 70% 40%, rgba(255,255,255,0.15), transparent 60%)",
          }}
        />
      </div>
      <div style={{ padding: "0 16px 16px", position: "relative" }}>
        <div style={{ marginTop: -34, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: REQ_AVATARS[index % REQ_AVATARS.length],
                border: "4px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>
                {initials(f.name)}
              </span>
            </div>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 800,
              marginBottom: 6,
            }}
          >
            <Icon name="zap" size={10} color="#fbbf24" />
            {f.level.toFixed(1)}
          </div>
        </div>
        {profileHref ? (
          <Link href={profileHref} className="mp-friend-name-link" style={{ color: "inherit", textDecoration: "none", display: "block" }}>
            {nameEl}
          </Link>
        ) : (
          nameEl
        )}
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="map-pin" size={10} />
          {f.city} · {f.sport}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, pointerEvents: preview ? "none" : "auto" }}>
          {isSuggestion ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={preview || addPending || addState === "sent"}
              onClick={() => {
                if (preview || addPending || addState === "sent") return;
                startAdd(async () => {
                  const r = await sendFriendRequest({ toUserId: f.id });
                  if (!r.ok) {
                    toast({ icon: "alert-triangle", title: r.error.message });
                    return;
                  }
                  setAddState("sent");
                  toast({ icon: "check-circle-2", title: `Solicitud enviada a ${f.name}` });
                });
              }}
              style={{
                flex: 1,
                fontSize: 10.5,
                padding: "8px 10px",
                opacity: addPending ? 0.6 : 1,
                cursor: addPending || addState === "sent" ? "default" : "pointer",
              }}
            >
              <Icon name={addState === "sent" ? "check" : "user-plus"} size={12} />
              {addState === "sent" ? "Enviada" : addPending ? "Enviando..." : "Agregar"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={msgPending || preview}
                onClick={() => {
                  if (preview) return;
                  startMsg(async () => {
                    const r = await startConversation({ kind: "dm", memberIds: [f.id] });
                    if (!r.ok) {
                      toast({ icon: "alert-triangle", title: r.error.message });
                      return;
                    }
                    router.push(`/dashboard/user/chat?conv=${r.data.id}`);
                  });
                }}
                style={{
                  flex: 1,
                  fontSize: 10.5,
                  padding: "8px 10px",
                  background: "#fff",
                  border: "1px solid var(--border)",
                  opacity: msgPending ? 0.6 : 1,
                  cursor: msgPending ? "wait" : "pointer",
                }}
              >
                <Icon name="message-square" size={12} />
                {msgPending ? "Abriendo..." : "Mensaje"}
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, fontSize: 10.5, padding: "8px 10px" }}
                onClick={() => {
                  if (preview) return;
                  window.dispatchEvent(
                    new CustomEvent("mp-open-retar", {
                      detail: {
                        name: f.name,
                        level: f.level,
                        sport: f.sport,
                        city: f.city,
                        av: initials(f.name),
                        avBg: REQ_AVATARS[index % REQ_AVATARS.length],
                      },
                    }),
                  );
                }}
              >
                <Icon name="swords" size={12} />
                Retar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Variante para el perfil oficial MATCHPOINT.
function OfficialFriendCard({ f }: { f: FriendLite }) {
  const href = f.username ? `/dashboard/user/players/${f.username}` : null;
  const inner = (
    <>
      <div
        style={{
          position: "relative",
          height: 76,
          background: "#0a0a0a",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.32), transparent 55%), radial-gradient(ellipse at 15% 85%, rgba(16,185,129,0.18), transparent 60%)",
            pointerEvents: "none",
          }}
        />
        <span className="font-heading" style={{ position: "relative", fontWeight: 900, letterSpacing: "-0.02em", fontSize: 16, color: "#fff" }}>
          MATCHPOINT
        </span>
      </div>
      <div style={{ padding: "0 16px 16px", position: "relative" }}>
        <div style={{ marginTop: -34, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#0a0a0a",
              border: "4px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="dot" style={{ fontSize: 28, lineHeight: 1 }}>
              ●
            </span>
          </div>
        </div>
        <div
          className="font-heading"
          style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.15, display: "inline-flex", alignItems: "center", gap: 0 }}
        >
          {f.name}
          <NameplateMark nameplateKey={resolveNameplateKey(f.isOfficial, f.nameplateKey)} size="sm" />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 6, lineHeight: 1.45 }}>
          Cuenta oficial de MATCHPOINT EC. Te enviamos novedades y recordatorios. El chat oficial es solo informativo.
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card mp-friend-official-card"
        style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", color: "inherit", textDecoration: "none" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {inner}
    </div>
  );
}
