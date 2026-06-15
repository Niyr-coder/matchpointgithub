"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";
import { startGiveawayDraw } from "@/server/actions/giveaways";
import { orgGiveawayPath, type OrgGiveawayRole } from "./org-path";

const SPIN_NAMES = ["Lucía V.", "Mateo R.", "Carolina M.", "Andrés C.", "Sofía C.", "Esteban P."];

type Props = {
  role: OrgGiveawayRole;
  giveaway: GiveawayDetailView;
};

/** OrgDrawing — gw-create-web.jsx */
export function OrgGiveawayDrawingView({ role, giveaway }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [highlightIdx, setHighlightIdx] = useState(2);
  const [secondsLeft, setSecondsLeft] = useState(3);
  const [done, setDone] = useState(giveaway.status === "drawn");
  const startedRef = useRef(false);

  const drawLabel = giveaway.drawAt
    ? new Date(giveaway.drawAt).toLocaleString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Ahora";

  useEffect(() => {
    if (done || startedRef.current) return;
    startedRef.current = true;
    const spin = setInterval(() => {
      setHighlightIdx((i) => (i + 1) % SPIN_NAMES.length);
    }, 120);
    const countdown = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const finish = setTimeout(() => {
      clearInterval(spin);
      clearInterval(countdown);
      startTransition(async () => {
        const res = await startGiveawayDraw({ giveawayId: giveaway.id });
        if (!res.ok) {
          toast({ icon: "error", title: "Sorteo fallido", sub: res.error.message });
          router.push(orgGiveawayPath(role, giveaway.id));
          return;
        }
        setDone(true);
        router.push(orgGiveawayPath(role, giveaway.id, "ganador"));
      });
    }, 3000);
    return () => {
      clearInterval(spin);
      clearInterval(countdown);
      clearTimeout(finish);
    };
  }, [done, giveaway.id, role, router, toast]);

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 120px)", background: "#0a0a0a", color: "#fff", margin: -28 }}>
      <div className="hero-emerald" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />
      <div className="relative flex flex-col items-center gap-8 px-4 py-10 md:px-10 md:py-15">
        <div className="label-mp" style={{ color: "var(--gw-accent-soft)" }}>
          {drawLabel} · transmitiendo
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: "clamp(36px, 6vw, 54px)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 0.95,
            textAlign: "center",
          }}
        >
          Sorteando<span style={{ color: "var(--gw-accent)" }}>.</span>
        </h1>

        <div
          style={{
            width: "min(720px, 100%)",
            padding: 32,
            borderRadius: 18,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
            Eligiendo entre {giveaway.totalEntryWeight.toLocaleString("es-EC")} entradas válidas…
          </div>
          <div
            style={{
              marginTop: 18,
              height: 120,
              overflow: "hidden",
              position: "relative",
              borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 32,
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: "clamp(24px, 4vw, 42px)",
                letterSpacing: "-0.03em",
                whiteSpace: "nowrap",
              }}
            >
              {SPIN_NAMES.map((n, i) => (
                <span key={n} style={{ color: i === highlightIdx ? "#fff" : "rgba(255,255,255,0.25)" }}>
                  {n}
                </span>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "50%",
                width: 4,
                background: "var(--gw-accent)",
                boxShadow: "0 0 20px var(--gw-accent)",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <div>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
                Participantes
              </div>
              <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900 }}>
                {giveaway.entryCount}
              </div>
            </div>
            <div>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
                Tiempo restante
              </div>
              <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, color: "var(--gw-accent)" }}>
                {secondsLeft} s
              </div>
            </div>
          </div>
        </div>

        {giveaway.drawChannel && (
          <button type="button" className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }} disabled={pending}>
            <Icon name="video" size={12} color="#fff" /> {giveaway.drawChannel}
          </button>
        )}
      </div>
    </div>
  );
}
