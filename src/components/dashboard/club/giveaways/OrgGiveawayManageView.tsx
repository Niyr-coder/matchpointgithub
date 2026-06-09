"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { MiniStat } from "@/components/giveaways";
import { SectionHead } from "@/components/giveaways/handoff";
import type { GiveawayOrgManageView } from "@/lib/schemas/giveaways";
import { reviewGiveawayManualSubmission } from "@/server/actions/giveaways";
import { orgGiveawayPath, type OrgGiveawayRole } from "./org-path";

type Props = {
  role: OrgGiveawayRole;
  data: GiveawayOrgManageView;
};

function closesInLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Cerrado";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function canDrawNow(drawAt: string | null, status: string): boolean {
  if (status === "drawn" || status === "closed" || status === "cancelled") return false;
  if (!drawAt) return true;
  return new Date(drawAt).getTime() <= Date.now();
}

/** OrgManage — gw-create-web.jsx */
export function OrgGiveawayManageView({ role, data }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [reviewing, startReview] = useTransition();
  const { giveaway, topParticipants, mechanicStats, participantCount, pendingManualReviews, pendingSubmissions } = data;
  const drawLabel = giveaway.drawAt ? new Date(giveaway.drawAt).toLocaleString("es-EC") : "Por confirmar";
  const drawReady = canDrawNow(giveaway.drawAt, giveaway.status);
  const isDrawn = giveaway.status === "drawn";

  const reviewSubmission = (submissionId: string, decision: "approved" | "rejected") => {
    startReview(async () => {
      const res = await reviewGiveawayManualSubmission({ submissionId, decision });
      if (!res.ok) {
        toast({ icon: "error", title: "No se pudo revisar", sub: res.error.message });
        return;
      }
      toast({
        icon: "check",
        title: decision === "approved" ? "Share aprobado" : "Share rechazado",
        sub: decision === "approved" ? "Se sumaron las entradas al jugador." : "El jugador puede volver a enviar captura.",
      });
      router.refresh();
    });
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>
        <Link href={`/dashboard/${role}/club-sorteos`} style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Icon name="arrow-left" size={11} /> Sorteos del club
        </Link>
        <Icon name="chevron-right" size={10} />
        <span style={{ color: "var(--fg)" }}>{giveaway.title}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <SectionHead
          kicker={`Gestión · ${isDrawn ? "sorteo finalizado" : "sorteo en vivo"}`}
          title={giveaway.title}
          sub={`Cierra en ${closesInLabel(giveaway.closesAt)} · sorteo ${drawLabel}`}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/dashboard/clubes/giveaways/${giveaway.id}`} className="btn btn-outline" style={{ textDecoration: "none" }}>
            <Icon name="external-link" size={12} /> Ver como jugador
          </Link>
          {isDrawn ? (
            <button type="button" className="btn btn-onyx" onClick={() => router.push(orgGiveawayPath(role, giveaway.id, "ganador"))}>
              <Icon name="trophy" size={12} color="#fff" /> Ver ganador
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-onyx"
              disabled={!drawReady}
              title={drawReady ? undefined : `Disponible ${drawLabel}`}
              onClick={() => router.push(orgGiveawayPath(role, giveaway.id, "sortear"))}
            >
              <Icon name="dices" size={12} color="#fff" /> {drawReady ? "Sortear ahora" : `Sortear (${drawLabel})`}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <div className="card" style={{ padding: 14 }}>
          <MiniStat label="Entradas totales" value={String(giveaway.totalEntryWeight)} hint={`${participantCount} participantes`} />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <MiniStat label="Participantes" value={String(participantCount)} hint="únicos inscritos" color="var(--primary-dark)" />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <MiniStat label="Seguidores" value={String(data.followerCount)} hint="del club" />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <MiniStat label="Mecánicas" value={String(giveaway.mechanics.length)} hint="activas en el sorteo" />
        </div>
        {pendingManualReviews > 0 && (
          <div className="card" style={{ padding: 14 }}>
            <MiniStat label="Pendientes" value={String(pendingManualReviews)} hint="validación manual" color="var(--warn-fg)" />
          </div>
        )}
      </div>

      <div className="mp-landing-split" style={{ gap: 18 }}>
        <div className="card mp-table-scroll" style={{ padding: 0 }}>
          <div style={{ minWidth: 480 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>
              Top participantes<span style={{ color: "var(--primary)" }}>.</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 90px 130px 100px", padding: "10px 18px", borderBottom: "1px solid var(--border)" }}>
            {["#", "Jugador", "Entradas", "Mecánicas", "Sigue"].map((h) => (
              <div key={h} className="label-mp">
                {h}
              </div>
            ))}
          </div>
          {topParticipants.length === 0 ? (
            <div style={{ padding: 24, color: "var(--muted-fg)", fontSize: 13 }}>Aún no hay participantes.</div>
          ) : (
            topParticipants.map((p, i) => (
              <div
                key={p.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px 1fr 90px 130px 100px",
                  padding: "11px 18px",
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  alignItems: "center",
                }}
              >
                <div className="font-heading tabular" style={{ fontSize: 13, fontWeight: 900, color: i < 3 ? "var(--primary-dark)" : "var(--muted-fg)" }}>
                  {(i + 1).toString().padStart(2, "0")}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.displayName}</div>
                <div className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900 }}>
                  {p.totalEntries}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted-fg)" }}>{p.breakdown}</div>
                <div>{p.followsClub && <span className="chip chip-emerald" style={{ fontSize: 8.5 }}>✓ Sigue</span>}</div>
              </div>
            ))
          )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>
              Entradas por mecánica<span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {mechanicStats.map((m) => (
                <div key={m.kind}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>
                      {m.label} <span style={{ color: "var(--muted-fg)", fontWeight: 500 }}>+{m.weight}</span>
                    </span>
                    <span className="tabular" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {m.completedCount}/{m.participantCount || "—"}
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--muted)", borderRadius: 9999 }}>
                    <div
                      style={{
                        width: `${participantCount > 0 ? (m.completedCount / participantCount) * 100 : 0}%`,
                        height: "100%",
                        background: "var(--primary)",
                        borderRadius: 9999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {pendingSubmissions.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>
                Validación manual<span style={{ color: "var(--warn-fg)" }}>.</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4, marginBottom: 12 }}>
                {pendingSubmissions.length} captura{pendingSubmissions.length !== 1 ? "s" : ""} pendiente{pendingSubmissions.length !== 1 ? "s" : ""} de revisar.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingSubmissions.map((sub) => (
                  <div key={sub.id} className="card" style={{ padding: 12, background: "var(--muted)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{sub.displayName}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>
                          Share · {new Date(sub.createdAt).toLocaleString("es-EC")}
                        </div>
                      </div>
                      <a href={sub.evidenceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm" style={{ textDecoration: "none", flexShrink: 0 }}>
                        <Icon name="image" size={11} /> Ver
                      </a>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1 }}
                        disabled={reviewing}
                        onClick={() => reviewSubmission(sub.id, "approved")}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ flex: 1 }}
                        disabled={reviewing}
                        onClick={() => reviewSubmission(sub.id, "rejected")}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
