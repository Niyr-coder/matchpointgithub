"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { StripedImg } from "@/components/giveaways/handoff";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";
import { getGiveawayDetail } from "@/server/actions/giveaways";

const FAKE_NAMES = ["Lucía V.", "Mateo R.", "Andrea C.", "Carlos M.", "Sofía L.", "Diego P."];

/** Sorteo en vivo — 1:1 con JoinLive (gw-join-mobile.jsx) */
export function GiveawayLiveViewClient({ giveawayId }: { giveawayId: string }) {
  const router = useRouter();
  const [data, setData] = useState<GiveawayDetailView | null>(null);
  const [phase, setPhase] = useState<"countdown" | "spinning" | "revealed">("countdown");
  const [fakeName, setFakeName] = useState(FAKE_NAMES[0]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    getGiveawayDetail({ giveawayId }).then((res) => {
      if (res.ok) setData(res.data);
    });
  }, [giveawayId]);

  useEffect(() => {
    if (phase !== "spinning") return;
    let i = 0;
    const interval = setInterval(() => {
      setFakeName(FAKE_NAMES[i % FAKE_NAMES.length]);
      setProgress((p) => Math.min(p + 12, 95));
      i += 1;
    }, 120);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPhase("revealed");
      setProgress(100);
    }, 3000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase]);

  useEffect(() => {
    if (!data) return;
    if (data.status === "drawn") {
      setPhase("revealed");
      return;
    }
    const t = setTimeout(() => setPhase("spinning"), 1500);
    return () => clearTimeout(t);
  }, [data]);

  if (!data) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--muted-fg)" }}>
        Cargando sorteo en vivo…
      </div>
    );
  }

  const winner = data.winners[0];
  const iWon = data.won === true;
  const imageLabel = data.prizeLabel.slice(0, 20).toUpperCase();
  const drawLabel = data.drawAt
    ? new Date(data.drawAt).toLocaleString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Por confirmar";

  return (
    <div
      style={{
        minHeight: "100dvh",
        position: "relative",
        overflow: "hidden",
        background: "#0a0a0a",
        color: "#fff",
        margin: "-28px",
      }}
    >
      <div className="hero-emerald" style={{ position: "absolute", inset: 0, opacity: 0.55 }} />
      <div style={{ position: "relative", height: "100%", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <button
            type="button"
            style={{ padding: 6, background: "rgba(255,255,255,0.14)", borderRadius: 9999, border: 0, cursor: "pointer" }}
            onClick={() => router.push(`/dashboard/clubes/giveaways/${giveawayId}`)}
          >
            <Icon name="x" size={12} color="#fff" />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".06em" }}>
              EN VIVO · {data.entryCount.toLocaleString("es-EC")}
            </div>
          </div>
          <Icon name="more-horizontal" size={14} color="#fff" />
        </div>

        <div
          style={{
            flex: 1,
            padding: "20px 18px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            textAlign: "center",
            gap: 20,
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--gw-accent-soft)" }}>
              Sorteo · {drawLabel}
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.03em",
                margin: "6px 0 4px",
                lineHeight: 1,
              }}
            >
              {data.title}
              <span style={{ color: "var(--gw-accent)" }}>.</span>
            </h1>
          </div>

          {data.prizeImageUrl ? (
            <div
              style={{
                height: 120,
                borderRadius: 12,
                backgroundImage: `url(${data.prizeImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                maxWidth: 320,
                margin: "0 auto",
                width: "100%",
              }}
            />
          ) : (
            <StripedImg label={imageLabel} height={120} dark style={{ borderRadius: 12, maxWidth: 320, margin: "0 auto", width: "100%" }} />
          )}

          <div
            style={{
              padding: 18,
              borderRadius: 14,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.18)",
              maxWidth: 360,
              margin: "0 auto",
              width: "100%",
            }}
          >
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
              {phase === "revealed" && winner
                ? "Ganador"
                : `Eligiendo entre ${data.entryCount.toLocaleString("es-EC")} entradas`}
            </div>
            <div className="font-heading" style={{ marginTop: 12, fontWeight: 900, fontSize: 28, letterSpacing: "-0.02em" }}>
              {phase === "revealed" && winner ? winner.displayName : fakeName}
            </div>
            <div style={{ marginTop: 10, height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "var(--gw-accent)", transition: phase === "spinning" ? "none" : "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              {phase === "countdown" && "Empieza en un momento…"}
              {phase === "spinning" && "Sorteando · 3 segundos"}
              {phase === "revealed" && "Resultado final"}
            </div>
          </div>

          {data.hasJoined && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(255,255,255,0.08)",
                borderRadius: 12,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                maxWidth: 360,
                margin: "0 auto",
                width: "100%",
              }}
            >
              <span>
                Tus entradas: <b className="tabular">{data.myEntries}</b>
              </span>
              <span>
                Probabilidad:{" "}
                <b className="tabular" style={{ color: "var(--gw-accent)" }}>
                  {data.myProbabilityPct.toFixed(2)}%
                </b>
              </span>
            </div>
          )}

          {phase === "revealed" && winner && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ maxWidth: 360, margin: "0 auto", width: "100%" }}
              onClick={() =>
                router.push(
                  iWon
                    ? `/dashboard/clubes/giveaways/${giveawayId}?result=won`
                    : `/dashboard/clubes/giveaways/${giveawayId}?result=lost`,
                )
              }
            >
              Ver resultado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
