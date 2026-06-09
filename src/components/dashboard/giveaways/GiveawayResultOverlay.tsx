"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { StripedImg } from "@/components/giveaways/handoff";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";

type Props = {
  data: GiveawayDetailView;
  variant: "won" | "lost";
  onClose: () => void;
};

/** Pantallas 08a/08b — ganaste / no fue esta vez (sin beneficio consolación) */
export function GiveawayResultOverlay({ data, variant, onClose }: Props) {
  const router = useRouter();
  const winner = data.winners[0];
  const imageLabel = data.prizeLabel.slice(0, 20).toUpperCase();

  if (variant === "won") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#0a0a0a", color: "#fff", overflow: "auto" }}>
        <div className="hero-hype" style={{ position: "absolute", inset: 0 }} />
        <div className="confetti" aria-hidden>
          {Array.from({ length: 24 }).map((_, i) => (
            <i
              key={i}
              className="pulse-glow"
              style={{
                left: `${(i * 6) % 100}%`,
                top: `${(i * 11) % 90 + 5}%`,
                background: i % 4 === 0 ? "#a7f3d0" : i % 4 === 1 ? "#fbbf24" : i % 4 === 2 ? "#34d399" : "#fff",
                transform: `rotate(${i * 31}deg) scale(${1 + (i % 3) * 0.4})`,
                animationDelay: `${i * 80}ms`,
              }}
            />
          ))}
        </div>
        <div className="relative flex min-h-full flex-col pt-12 px-5 pb-5 md:px-6 md:pb-6">
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-end", color: "#fff" }} onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--gw-accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(52,211,153,0.6)" }}>
              <Icon name="trophy" size={36} color="#052e22" />
            </div>
            <div>
              <div className="label-mp" style={{ color: "var(--gw-accent-soft)" }}>
                ¡Felicidades!
              </div>
              <h1 className="font-heading" style={{ fontSize: "clamp(36px, 8vw, 48px)", fontWeight: 900, letterSpacing: "-0.035em", textTransform: "uppercase", margin: "6px 0 0", lineHeight: 0.95 }}>
                Ganaste<span style={{ color: "var(--gw-accent)" }}>.</span>
              </h1>
            </div>
            <div style={{ padding: 18, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, width: "100%", maxWidth: 360 }}>
              {data.prizeImageUrl ? (
                <div style={{ height: 110, borderRadius: 10, backgroundImage: `url(${data.prizeImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              ) : (
                <StripedImg label={imageLabel} height={110} dark style={{ borderRadius: 10 }} />
              )}
              <div className="label-mp" style={{ color: "var(--gw-accent-soft)", marginTop: 12 }}>
                Tu premio
              </div>
              <div className="font-heading" style={{ fontSize: 19, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: "4px 0 6px", lineHeight: 1.1 }}>
                {data.title}
                <span style={{ color: "var(--gw-accent)" }}>.</span>
              </div>
              {data.subtitle && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>{data.subtitle}</div>}
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", maxWidth: 290, lineHeight: 1.6 }}>
              {data.clubName} te contactará por mensaje para coordinar la entrega del premio.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360, width: "100%", margin: "0 auto" }}>
            <Link href="/dashboard/user/chat" className="btn" style={{ background: "var(--gw-accent)", color: "#052e22", padding: 13, textDecoration: "none", justifyContent: "center" }}>
              <Icon name="message-circle" size={12} color="#052e22" /> Abrir mensajes
            </Link>
            <button type="button" className="btn btn-outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.28)" }} onClick={() => router.push("/dashboard/user/mis-sorteos")}>
              Mis sorteos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#fafafa", overflow: "auto" }}>
      <div className="hero-onyx" style={{ color: "#fff", padding: "36px 20px 28px", textAlign: "center" }}>
        <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)" }}>
          Sorteo finalizado
        </div>
        <h1 className="font-heading" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "8px 0 6px", lineHeight: 1.1 }}>
          No fue esta vez<span style={{ color: "var(--primary)" }}>.</span>
        </h1>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", maxWidth: 270, margin: "0 auto", lineHeight: 1.5 }}>
          Tuviste {data.myEntries} entrada{data.myEntries !== 1 ? "s" : ""} válida{data.myEntries !== 1 ? "s" : ""}.
          {winner ? (
            <>
              {" "}
              La ganadora fue <b style={{ color: "#fff" }}>{winner.displayName}</b>
            </>
          ) : null}
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, margin: "0 auto" }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="label-mp">Tu participación</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12 }}>
            <span>Entradas conseguidas</span>
            <b className="tabular">
              {data.myEntries} / {data.maxEntriesPerUser}
            </b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
            <span>Probabilidad</span>
            <b className="tabular">{data.myProbabilityPct.toFixed(2)}%</b>
          </div>
        </div>
        <div className="label-mp">Otros sorteos activos</div>
        <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={() => router.push(`/dashboard/clubes/${data.clubSlug}`)}>
          Ver sorteos del club
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
