// Badge informativo que muestra si el match va a contar para el ranking
// según el plan del usuario actual. Premium → "RANKED" verde con corona;
// Free → "CASUAL" gris con link a /dashboard/user/mi-plan.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { getCurrentPlan } from "@/server/actions/player-subscriptions";

type Status = "loading" | "ranked" | "casual";

export function RankedBadge() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getCurrentPlan();
      if (cancelled) return;
      if (res.ok && res.data.tier === "premium" && res.data.active) {
        setStatus("ranked");
      } else {
        setStatus("casual");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 9999,
          background: "var(--muted)",
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
        }}
      >
        …
      </div>
    );
  }

  if (status === "ranked") {
    return (
      <div
        title="Este partido cuenta para tu MP Rating"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 11px",
          borderRadius: 9999,
          background: "#ecfdf5",
          border: "1px solid #10b981",
          fontSize: 10.5,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#047857",
        }}
      >
        <Icon name="crown" size={11} color="#047857" />
        Ranked · cuenta para tu MP Rating
      </div>
    );
  }

  return (
    <Link
      href="/dashboard/user/mi-plan"
      title="Activa MATCHPOINT+ para que tus matches cuenten para el ranking"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        borderRadius: 9999,
        background: "#fff",
        border: "1px dashed var(--border)",
        fontSize: 10.5,
        fontWeight: 900,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--muted-fg)",
        textDecoration: "none",
      }}
    >
      <Icon name="info" size={11} />
      Casual · activa MATCHPOINT+ para sumar ranking
    </Link>
  );
}
