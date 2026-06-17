"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { MechanicRow, OwnerBadge } from "@/components/giveaways";
import { GiveawayJoinConfirmation } from "@/components/giveaways/GiveawayJoinConfirmation";
import { GiveawayPrereqSheet } from "@/components/giveaways/GiveawayPrereqSheet";
import { HeroStat, StripedImg } from "@/components/giveaways/handoff";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";
import type { MechanicKind } from "@/components/giveaways/types";
import {
  createGiveawayPayEntry,
  enterGiveawayWithPrereqs,
  getGiveawayDetail,
  syncGiveawayMechanicsForUser,
} from "@/server/actions/giveaways";
import { GiveawayDetailMobile } from "./GiveawayDetailMobile";
import { GiveawayResultOverlay } from "./GiveawayResultOverlay";
import { GiveawayShareSheet } from "./GiveawayShareSheet";
import { ReferralInviteSheet } from "@/components/referrals/ReferralInviteSheet";
import { getReferralShareUiCopy } from "@/lib/referrals/share";

function closesInLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Cerrado";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function GiveawayDetailViewClient({
  initial,
  resultVariant,
}: {
  initial: GiveawayDetailView;
  resultVariant?: "won" | "lost";
}) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [showPrereq, setShowPrereq] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [followClub, setFollowClub] = useState(true);
  const [acceptRules, setAcceptRules] = useState(false);
  const [phase, setPhase] = useState<"detail" | "confirmation">("detail");
  const [pending, startTransition] = useTransition();

  const participating = data.hasJoined;
  const ended = data.status === "drawn" || data.status === "closed";
  const urgent = data.status === "closing";
  const isOpen = data.status === "open" || data.status === "closing";

  const imageLabel = data.prizeLabel.slice(0, 24).toUpperCase() || "PREMIO";

  const refreshDetail = () => {
    startTransition(async () => {
      const detailRes = await getGiveawayDetail({ giveawayId: data.id });
      if (detailRes.ok) setData(detailRes.data);
    });
  };

  const refreshMechanics = () => {
    startTransition(async () => {
      const res = await syncGiveawayMechanicsForUser({ giveawayId: data.id });
      if (!res.ok) return;
      refreshDetail();
    });
  };

  const mechanicActionLabel = (kind: MechanicKind): string | undefined => {
    if (kind === "pay") return "Pagar $1";
    if (kind === "share") return "Subir captura";
    if (kind === "invite") return getReferralShareUiCopy({ surface: "giveaway", giveawayTitle: data.title, clubName: data.clubName, prizeLabel: data.prizeLabel }).actionLabel;
    return undefined;
  };

  const handleMechanicAction = (kind: MechanicKind) => {
    if (kind === "share") {
      setShowShare(true);
      return;
    }
    if (kind === "invite") {
      if (!data.viewerUsername) {
        toast({
          icon: "alert-circle",
          title: "Configura tu username",
          sub: "Necesitas un username en tu perfil para invitar amigos",
        });
        return;
      }
      setShowInvite(true);
      return;
    }
    if (kind === "pay") {
      startTransition(async () => {
        const res = await createGiveawayPayEntry({ giveawayId: data.id });
        if (!res.ok) {
          toast({ icon: "error", title: "No se pudo iniciar el pago", sub: res.error.message });
          return;
        }
        router.push(res.data.checkoutUrl);
      });
      return;
    }
    refreshMechanics();
  };

  const mechanicActionFor = (m: GiveawayDetailView["mechanics"][number]) => {
    if (!participating || m.done || m.pending || ended) return undefined;
    if (m.kind === "share" || m.kind === "pay" || m.kind === "invite") {
      return () => handleMechanicAction(m.kind);
    }
    if (m.autoVerify) {
      return () => handleMechanicAction(m.kind);
    }
    return undefined;
  };

  useEffect(() => {
    if (!initial.hasJoined) return;
    void syncGiveawayMechanicsForUser({ giveawayId: initial.id }).then(async (res) => {
      if (!res.ok) return;
      const detailRes = await getGiveawayDetail({ giveawayId: initial.id });
      if (detailRes.ok) setData(detailRes.data);
    });
  }, [initial.id, initial.hasJoined]);

  const onJoin = () => {
    if (!acceptRules) {
      toast({ icon: "error", title: "Acepta las reglas", sub: "Debes aceptar las reglas para participar." });
      return;
    }
    startTransition(async () => {
      const res = await enterGiveawayWithPrereqs({ giveawayId: data.id, followClub, acceptRules: true });
      if (!res.ok) {
        toast({ icon: "error", title: "No pudiste entrar", sub: res.error.message });
        return;
      }
      setShowPrereq(false);
      const next = {
        ...data,
        hasJoined: true,
        myEntries: res.data.myEntries,
        maxEntriesPerUser: res.data.maxEntries,
        myProbabilityPct: data.entryCount > 0 ? (res.data.myEntries / data.entryCount) * 100 : 0,
        mechanics: data.mechanics.map((m) => (m.kind === "follow" ? { ...m, done: true } : m)),
      };
      setData(next);
      const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
      if (mobile) setPhase("confirmation");
    });
  };

  return (
    <>
      {resultVariant && (
        <GiveawayResultOverlay
          data={data}
          variant={resultVariant}
          onClose={() => router.push(`/dashboard/clubes/giveaways/${data.id}`)}
        />
      )}

      {phase === "confirmation" ? (
        <div className="gw-detail-mobile-only">
          <GiveawayJoinConfirmation
            data={data}
            onRefreshMechanics={refreshMechanics}
            onMechanicAction={handleMechanicAction}
            mechanicActionLabel={mechanicActionLabel}
            onBackToDetail={() => setPhase("detail")}
            pending={pending}
          />
        </div>
      ) : (
        <>
          <GiveawayDetailMobile
            data={data}
            participating={participating}
            ended={ended}
            isOpen={isOpen}
            closesLabel={closesInLabel(data.closesAt)}
            imageLabel={imageLabel}
            pending={pending}
            onParticipate={() => setShowPrereq(true)}
            onRefreshMechanics={refreshMechanics}
            onMechanicAction={handleMechanicAction}
            mechanicActionLabel={mechanicActionLabel}
          />

          <div className="gw-detail-shell gw-detail-desktop-only" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>
        <Link href={`/dashboard/clubes/${data.clubSlug}`} style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Icon name="arrow-left" size={11} /> Giveaways
        </Link>
        <Icon name="chevron-right" size={10} />
        <span style={{ color: "var(--fg)" }}>{data.title}</span>
      </div>

      {/* HERO — gw-detail-web.jsx */}
      <div className="hero-emerald pv-rise" style={{ position: "relative", borderRadius: 14.4, overflow: "hidden", color: "#fff" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 240,
            color: "rgba(255,255,255,0.04)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(8%, -28%)",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          SORTEO
        </div>

        <div className="gw-detail-hero-grid">
          {data.prizeImageUrl ? (
            <div style={{ height: 210, borderRadius: 10, backgroundImage: `url(${data.prizeImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : (
            <StripedImg label={imageLabel} height={210} dark style={{ borderRadius: 10 }} />
          )}

          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <OwnerBadge owner={data.ownerType} name={data.clubName} />
              {urgent && (
                <span className="chip" style={{ background: "rgba(220,38,38,0.18)", color: "#fecaca", border: "1px solid rgba(220,38,38,0.35)" }}>
                  <Icon name="flame" size={10} /> Cierra hoy
                </span>
              )}
              {ended && <span className="chip chip-onyx" style={{ background: "#fff", color: "#0a0a0a" }}>Finalizado</span>}
            </div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
              El premio
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                margin: "4px 0 8px",
                lineHeight: 0.98,
              }}
            >
              {data.title}
              <span style={{ color: "var(--gw-accent)" }}>.</span>
            </h1>
            {data.subtitle && (
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.82)", margin: 0, maxWidth: 480, lineHeight: 1.55 }}>
                {data.subtitle}.
              </p>
            )}
            <div style={{ display: "flex", gap: 22, marginTop: 18, flexWrap: "wrap" }}>
              <HeroStat label="Participantes" value={data.entryCount} />
              <HeroStat label={ended ? "Sorteo" : "Cierra en"} value={ended ? (data.drawAt ? new Date(data.drawAt).toLocaleString("es-EC") : "—") : closesInLabel(data.closesAt)} urgent={urgent} />
              <HeroStat label="Tus entradas" value={participating ? data.myEntries : 0} accent={participating} />
              <HeroStat label="Probabilidad" value={participating ? `${data.myProbabilityPct.toFixed(2)}%` : "—"} />
            </div>
          </div>

          {/* CTA card */}
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 14,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              backdropFilter: "blur(8px)",
            }}
          >
            {!participating && !ended && isOpen && (
              <>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
                  Suma <b style={{ color: "#fff" }}>hasta {data.maxEntriesPerUser} entradas</b> haciendo acciones simples.
                </div>
                <button type="button" className="btn btn-primary" style={{ padding: "13px 16px" }} disabled={pending} onClick={() => setShowPrereq(true)}>
                  <Icon name="ticket" size={13} color="#fff" /> Participar gratis
                </button>
                <button type="button" className="btn" style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }} onClick={() => document.getElementById("gw-rules")?.scrollIntoView({ behavior: "smooth" })}>
                  Ver reglas
                </button>
              </>
            )}
            {participating && !ended && (
              <>
                <div className="label-mp" style={{ color: "var(--gw-accent-soft)" }}>
                  Estás dentro
                </div>
                <div className="font-heading tabular" style={{ fontSize: 36, fontWeight: 900, color: "var(--gw-accent)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {data.myEntries}
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 18 }}> / {data.maxEntriesPerUser}</span>
                </div>
                <div style={{ height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.15)" }}>
                  <div style={{ width: `${(data.myEntries / Math.max(data.maxEntriesPerUser, 1)) * 100}%`, height: "100%", background: "var(--gw-accent)", borderRadius: 9999 }} />
                </div>
                <button type="button" className="btn btn-primary" style={{ padding: "12px 16px", marginTop: 6 }} onClick={refreshMechanics} disabled={pending}>
                  Sumar más entradas
                </button>
              </>
            )}
            {ended && (
              <>
                <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Ganador(a)
                </div>
                <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>
                  {data.winners[0]?.displayName ?? "Por anunciar"}
                </div>
                <button type="button" className="btn" style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }} onClick={() => router.push(`/dashboard/clubes/${data.clubSlug}`)}>
                  Ver siguiente sorteo
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="gw-detail-body-grid">
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div className="font-heading" style={{ fontSize: 17, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
              Cómo sumar entradas<span style={{ color: "var(--primary)" }}>.</span>
            </div>
            {participating && (
              <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, letterSpacing: ".06em" }}>
                {data.mechanics.filter((m) => m.done).length} DE {data.mechanics.length} HECHAS
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.mechanics.map((m) => (
              <MechanicRow
                key={m.kind}
                kind={m.kind}
                label={m.label}
                weight={m.weight}
                done={participating ? m.done : false}
                pending={participating ? m.pending : false}
                disabled={ended}
                actionLabel={mechanicActionLabel(m.kind)}
                onAction={mechanicActionFor(m)}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 18 }}>
            <div className="label-mp">Organizador</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900 }}>
                <span style={{ color: "var(--primary)" }}>●</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{data.clubName}</div>
                <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>Club verificado en MATCHPOINT</div>
              </div>
              <Link href={`/dashboard/clubes/${data.clubSlug}`} className="btn btn-outline btn-sm" style={{ textDecoration: "none" }}>
                Ver perfil
              </Link>
            </div>
          </div>

          <div id="gw-rules" className="card" style={{ padding: 18 }}>
            <div className="label-mp">Reglas</div>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {data.rules.map((r) => (
                <li key={r} style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45 }}>
                  <Icon name="check" size={11} color="var(--primary)" style={{ marginTop: 2, flexShrink: 0 }} />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div className="label-mp">Sorteo en vivo</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6 }}>
              {data.drawAt ? new Date(data.drawAt).toLocaleString("es-EC") : "Por confirmar"}
            </div>
            {data.drawChannel && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{data.drawChannel}</div>}
            {participating && data.drawAt && (
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={() => router.push(`/dashboard/clubes/giveaways/${data.id}/live`)}>
                <Icon name="radio" size={11} /> Ver sorteo en vivo
              </button>
            )}
          </div>
        </div>
      </div>
          </div>
        </>
      )}

      {showShare && (
        <GiveawayShareSheet
          giveawayId={data.id}
          clubName={data.clubName}
          pending={pending}
          onClose={() => setShowShare(false)}
          onSubmitted={refreshDetail}
        />
      )}

      {showInvite && data.viewerUsername ? (
        <ReferralInviteSheet
          referralSlug={data.viewerUsername}
          referrerDisplayName={data.viewerDisplayName}
          context={{
            surface: "giveaway",
            giveawayTitle: data.title,
            clubName: data.clubName,
            prizeLabel: data.prizeLabel,
          }}
          onClose={() => setShowInvite(false)}
        />
      ) : null}

      {showPrereq && (
        <>
          <div className="gw-prereq-mobile-only">
            <GiveawayPrereqSheet
              clubName={data.clubName}
              followClub={followClub}
              acceptRules={acceptRules}
              pending={pending}
              onFollowChange={setFollowClub}
              onAcceptChange={setAcceptRules}
              onCancel={() => setShowPrereq(false)}
              onConfirm={onJoin}
            />
          </div>
          <div
            className="gw-prereq-desktop-only"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", alignItems: "flex-end", justifyContent: "center", zIndex: 100, padding: 16 }}
            onClick={() => setShowPrereq(false)}
          >
            <div className="card" style={{ width: "100%", maxWidth: 480, padding: 20, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
              <div className="label-mp">Antes de participar</div>
              <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", margin: "6px 0" }}>
                Casi listo<span style={{ color: "var(--primary)" }}>.</span>
              </h2>
              <p style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 14 }}>
                Sigue a {data.clubName} y acepta las reglas. Después entras con tu primera entrada.
              </p>
              <label className="card" style={{ display: "grid", gridTemplateColumns: "1fr 44px", gap: 10, padding: 12, marginBottom: 8, alignItems: "center", borderColor: "var(--primary)" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>Seguir a {data.clubName}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>Para verlos en tu feed y recibir avisos</div>
                </div>
                <input type="checkbox" checked={followClub} onChange={(e) => setFollowClub(e.target.checked)} />
              </label>
              <label className="card" style={{ display: "grid", gridTemplateColumns: "1fr 44px", gap: 10, padding: 12, marginBottom: 16, alignItems: "center", borderColor: "var(--primary)" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>Acepto las reglas del sorteo</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>Sorteo válido según términos del club</div>
                </div>
                <input type="checkbox" checked={acceptRules} onChange={(e) => setAcceptRules(e.target.checked)} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowPrereq(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" style={{ flex: 2 }} disabled={pending} onClick={onJoin}>
                  <Icon name="check" size={12} color="#fff" /> Seguir y participar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
