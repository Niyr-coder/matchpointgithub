"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";
import { orgGiveawayPath, type OrgGiveawayRole } from "./org-path";

type Props = {
  role: OrgGiveawayRole;
  giveaway: GiveawayDetailView;
  followerCount: number;
};

function closesInLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Cerrado";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** PublishedConfirm — gw-create-web.jsx */
export function OrgGiveawayPublishedView({ role, giveaway, followerCount }: Props) {
  const router = useRouter();
  const drawLabel = giveaway.drawAt ? new Date(giveaway.drawAt).toLocaleString("es-EC") : "Por confirmar";
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/dashboard/clubes/giveaways/${giveaway.id}` : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>
      <div
        style={{
          background: "var(--primary-light)",
          border: "1px solid var(--primary)",
          borderRadius: 14.4,
          padding: 28,
          display: "flex",
          gap: 22,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 8px rgba(16,185,129,0.18)",
          }}
        >
          <Icon name="check" size={36} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
            Sorteo publicado
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              color: "var(--primary-dark)",
              margin: "4px 0",
              lineHeight: 1,
            }}
          >
            {giveaway.title}
            <span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <div style={{ fontSize: 12.5, color: "var(--primary-dark)", fontWeight: 600 }}>
            Notificación enviada a {followerCount.toLocaleString("es-EC")} seguidores · cierra en {closesInLabel(giveaway.closesAt)} · sorteo {drawLabel}
          </div>
        </div>
        <button type="button" className="btn btn-onyx" onClick={() => router.push(orgGiveawayPath(role, giveaway.id))}>
          <Icon name="bar-chart-3" size={12} color="#fff" /> Ver gestión
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>
            Compartir<span style={{ color: "var(--primary)" }}>.</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4 }}>
            Materiales listos para difundir. Más vistas = más entradas.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <div className="card" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <Icon name="link" size={14} color="var(--muted-fg)" />
              <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shareUrl.replace(/^https?:\/\//, "")}
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void copyLink()}>
                Copiar
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                ["Instagram Story", "instagram"],
                ["Story Reel", "video"],
                ["WhatsApp", "message-circle"],
                ["Banner web", "image"],
              ].map(([l, i]) => (
                <div key={l} className="card" style={{ padding: 12, textAlign: "center", cursor: "default" }}>
                  <Icon name={i as "share-2"} size={18} color="var(--fg)" />
                  <div style={{ fontSize: 10, fontWeight: 800, marginTop: 6 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20, background: "#fafafa" }}>
          <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>
            Qué pasa ahora<span style={{ color: "var(--primary)" }}>.</span>
          </div>
          <ol style={{ margin: "12px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["ahora", "Tu sorteo aparece en el feed del club y en el feed global de MATCHPOINT"],
              ["+1h", "Push a tus seguidores que tengan notificaciones activadas"],
              ["cada día", "Te enviamos resumen de entradas nuevas y participantes"],
              ["24h antes", "Recordatorio a participantes y a quienes no han completado todas sus entradas"],
              [drawLabel, "Sorteo automático en vivo y notificación al ganador"],
            ].map(([when, what], i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 12 }}>
                <span className="label-mp" style={{ color: "var(--primary-dark)" }}>
                  {when}
                </span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{what}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Link href={`/dashboard/${role}/club-sorteos`} className="btn btn-ghost" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
        <Icon name="arrow-left" size={12} /> Volver al dashboard
      </Link>
    </div>
  );
}
