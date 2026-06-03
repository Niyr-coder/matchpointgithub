"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { SectionHead } from "@/components/giveaways/handoff";
import type { GiveawayOrgWinnerView } from "@/lib/schemas/giveaways";
import { orgGiveawayPath, type OrgGiveawayRole } from "./org-path";

type Props = {
  role: OrgGiveawayRole;
  data: GiveawayOrgWinnerView;
};

/** OrgWinner — gw-create-web.jsx */
export function OrgGiveawayWinnerView({ role, data }: Props) {
  const { giveaway, winner, totalEntries, participantCount } = data;
  const finishedAt = giveaway.drawAt ? new Date(giveaway.drawAt).toLocaleString("es-EC") : "Recién";

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionHead
        kicker={`Sorteo finalizado · ${finishedAt}`}
        title="Tenemos ganador"
        sub="Notifica al ganador, comparte el resultado y cierra el sorteo."
      />

      <div className="card" style={{ padding: 28, display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 22, alignItems: "center" }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 18,
            background: "var(--primary-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 44,
            color: "var(--primary-dark)",
            letterSpacing: "-0.04em",
          }}
        >
          {winner.initials}
        </div>
        <div>
          <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
            ★ Ganador
          </div>
          <h2 className="font-heading" style={{ fontSize: 32, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: "4px 0 6px", lineHeight: 1 }}>
            {winner.displayName}
            <span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <div style={{ fontSize: 12.5, color: "var(--muted-fg)", fontWeight: 600 }}>
            {winner.totalEntries} entradas válidas
            {winner.followsClub ? " · sigue al club" : ""}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {winner.username && <span className="chip chip-emerald">@{winner.username}</span>}
            {winner.phone && <span className="chip">{winner.phone}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link href="/dashboard/user/chat" className="btn btn-primary" style={{ textDecoration: "none", justifyContent: "center" }}>
            <Icon name="message-circle" size={12} color="#fff" /> Enviar DM
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>
            Siguientes pasos<span style={{ color: "var(--primary)" }}>.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {[
              ["Enviar DM con instrucciones de entrega", true],
              ["Postear ganador en feed del club", false],
              ["Coordinar entrega del premio físico", false],
              ["Cerrar sorteo y mover a histórico", false],
            ].map(([l, done]) => (
              <div key={l as string} style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, background: "var(--muted)", borderRadius: 9 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `1.5px solid ${done ? "var(--primary)" : "var(--border)"}`,
                    background: done ? "var(--primary)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {done && <Icon name="check" size={10} color="#fff" />}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: done ? 500 : 700,
                    textDecoration: done ? "line-through" : "none",
                    color: done ? "var(--muted-fg)" : "var(--fg)",
                  }}
                >
                  {l as string}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>
            Reporte del sorteo<span style={{ color: "var(--primary)" }}>.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, fontSize: 12.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Entradas totales</span>
              <b className="tabular">{totalEntries}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Participantes únicos</span>
              <b className="tabular">{participantCount}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Premio</span>
              <b>{giveaway.title}</b>
            </div>
          </div>
          <Link href={orgGiveawayPath(role, giveaway.id)} className="btn btn-outline" style={{ width: "100%", marginTop: 14, textDecoration: "none", justifyContent: "center" }}>
            <Icon name="bar-chart-3" size={12} /> Volver a gestión
          </Link>
        </div>
      </div>

      <Link href={`/dashboard/${role}/club-sorteos`} className="btn btn-ghost" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
        <Icon name="arrow-left" size={12} /> Dashboard de sorteos
      </Link>
    </div>
  );
}
