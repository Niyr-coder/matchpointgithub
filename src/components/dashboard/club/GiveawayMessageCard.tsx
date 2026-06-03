"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { enterClubGiveaway, getClubGiveaway } from "@/server/actions/club-comms";
import type { ClubGiveawayView } from "@/lib/schemas/club-comms";
import { giveawayEligibilityLabel } from "@/lib/clubs/comms-eligibility";

type Props = {
  giveawayId: string;
  title: string;
  prizeLabel: string;
  initial?: ClubGiveawayView | null;
};

export function GiveawayMessageCard({ giveawayId, title, prizeLabel, initial }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setView] = useState<ClubGiveawayView | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial || view) return;
    let cancelled = false;
    void getClubGiveaway({ giveawayId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setView(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [giveawayId, initial, view]);

  const g = view;
  const isOpen = g?.status === "open";
  const isDrawn = g?.status === "drawn";

  const onEnter = () => {
    start(async () => {
      const res = await enterClubGiveaway({ giveawayId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo participar", sub: res.error.message });
        return;
      }
      toast({ icon: "gift", title: "¡Estás participando!", sub: "Te avisaremos si ganas." });
      const refreshed = await getClubGiveaway({ giveawayId });
      if (refreshed.ok) setView(refreshed.data);
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "6px 8px" }}>
      <div
        style={{
          width: "min(100%, 420px)",
          borderRadius: 16,
          border: "1px solid rgba(212,175,55,0.35)",
          background: "linear-gradient(145deg, rgba(212,175,55,0.08), rgba(255,255,255,0.98))",
          padding: "14px 16px",
          boxShadow: "0 8px 24px rgba(10,10,10,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "linear-gradient(135deg,#92400e,#d4af37)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="gift" size={16} color="#fff" />
          </span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#92400e" }}>
              Sorteo del club
            </div>
            <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.2 }}>
              {g?.title ?? title}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: "var(--fg)", marginBottom: 6 }}>
          Premio: <b>{g?.prizeLabel ?? prizeLabel}</b>
        </div>

        {g?.description ? (
          <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 10px", lineHeight: 1.45 }}>{g.description}</p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, color: "var(--muted-fg)", marginBottom: 12 }}>
          {g ? <span>{giveawayEligibilityLabel(g.eligibility)}</span> : null}
          {g ? <span>· {g.entryCount} participantes</span> : null}
          {g?.closesAt ? (
            <span>
              · Cierra{" "}
              {new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
                new Date(g.closesAt),
              )}
            </span>
          ) : null}
        </div>

        {isDrawn && g && g.winners.length > 0 ? (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(16,185,129,0.1)",
              fontSize: 12,
              color: "#047857",
              marginBottom: 8,
            }}
          >
            Ganador(es): {g.winners.map((w) => w.displayName).join(", ")}
          </div>
        ) : null}

        {isOpen && g && !g.hasEntered ? (
          <button
            type="button"
            disabled={pending}
            onClick={onEnter}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 9999,
              border: 0,
              background: "var(--primary)",
              color: "#fff",
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: pending ? "wait" : "pointer",
              opacity: pending ? 0.7 : 1,
            }}
          >
            Participar
          </button>
        ) : null}

        {g?.hasEntered && isOpen ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary-active)", textAlign: "center" }}>
            Ya estás participando
          </div>
        ) : null}

        {g?.status === "closed" ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)", textAlign: "center" }}>Sorteo cerrado</div>
        ) : null}
      </div>
    </div>
  );
}
