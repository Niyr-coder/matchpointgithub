// Client view de ClubMarketingScreen — layout 1:1 (RoleScreensPolish.jsx 182-277).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { createBroadcast } from "@/server/actions/marketing";
import { ClubFeaturingPanel } from "./ClubFeaturingPanel";

export type CampaignCard = {
  id: string;
  n: string;
  kind: string;
  code: string;
  uses: number;
  max: number;
  end: string;
  img: string;
  tag: string;
  accent: string;
};
export type ChannelStat = {
  code: string;
  label: string;
  icon: string;
  color: string;
  value: string;
  pct: number;
};
export type MarketingData = {
  clubId: string | null;
  clubName: string;
  campaigns: CampaignCard[];
  reachMonth: number;
  sentCount: number;
  channels: ChannelStat[];
};

function fmtReach(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const PLACEHOLDER_PROMO_COUNT = 3;
const PLACEHOLDER_CHANNEL_COUNT = 4;

function PromoCard({ p }: { p: CampaignCard }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          height: 140,
          background: p.img,
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 110,
            color: "rgba(255,255,255,0.08)",
            letterSpacing: "-0.06em",
            transform: "rotate(-6deg) translate(15%, -10%)",
            textTransform: "uppercase",
            lineHeight: 0.8,
          }}
        >
          {p.kind.slice(0, 4)}
        </div>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <RSPill bg={p.accent}>{p.tag}</RSPill>
        </div>
        <div style={{ position: "relative", color: "#fff" }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            ● {p.kind}
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              lineHeight: 1.05,
              marginTop: 4,
            }}
          >
            {p.n}
            <span style={{ color: "#fbbf24" }}>.</span>
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 10px",
            background: "var(--muted)",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "var(--muted-fg)",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Código
          </span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 900 }}>
            {p.code}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10.5,
            marginBottom: 5,
          }}
        >
          <span style={{ color: "var(--muted-fg)" }}>Usos</span>
          <b>
            {p.uses} / {p.max}
          </b>
        </div>
        <div
          style={{
            height: 5,
            background: "var(--muted)",
            borderRadius: 9999,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              height: "100%",
              width: (p.uses / Math.max(p.max, 1)) * 100 + "%",
              background: p.accent,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-primary" style={{ flex: 1, fontSize: 10.5 }}>
            <Icon name="share-2" size={11} color="#fff" />
            Compartir
          </button>
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
          >
            <Icon name="bar-chart-3" size={11} />
          </button>
        </div>
        <div
          style={{
            fontSize: 9.5,
            color: "var(--muted-fg)",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          Vence: <b style={{ color: "#0a0a0a" }}>{p.end}</b>
        </div>
      </div>
    </div>
  );
}

function PromoPlaceholder() {
  return (
    <div
      style={{
        padding: 0,
        overflow: "hidden",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div
        style={{
          height: 140,
          background: "var(--muted)",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: 16,
        }}
      >
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <RSPill bg="var(--muted-fg)">—</RSPill>
        </div>
        <div style={{ position: "relative", color: "var(--muted-fg)" }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            ● —
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              lineHeight: 1.05,
              marginTop: 4,
            }}
          >
            Sin campañas
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 10px",
            background: "var(--muted)",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "var(--muted-fg)",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Código
          </span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 900 }}>
            —
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10.5,
            marginBottom: 5,
          }}
        >
          <span style={{ color: "var(--muted-fg)" }}>Usos</span>
          <b>0 / 0</b>
        </div>
        <div
          style={{
            height: 5,
            background: "var(--muted)",
            borderRadius: 9999,
            overflow: "hidden",
            marginBottom: 12,
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-primary" style={{ flex: 1, fontSize: 10.5 }} disabled>
            <Icon name="share-2" size={11} color="#fff" />
            Compartir
          </button>
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
            disabled
          >
            <Icon name="bar-chart-3" size={11} />
          </button>
        </div>
        <div
          style={{
            fontSize: 9.5,
            color: "var(--muted-fg)",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          Vence: <b style={{ color: "var(--muted-fg)" }}>—</b>
        </div>
      </div>
    </div>
  );
}

function ChannelTile({ ch }: { ch: ChannelStat }) {
  return (
    <div
      style={{
        padding: 16,
        background: "rgba(255,255,255,0.05)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Icon name={ch.icon} size={16} color={ch.color} />
        <span style={{ fontSize: 11, fontWeight: 900, color: ch.color }}>{ch.pct}%</span>
      </div>
      <div
        className="font-heading tabular"
        style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em" }}
      >
        {ch.value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.5)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        {ch.label}
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 9999,
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: ch.pct + "%", background: ch.color }} />
      </div>
    </div>
  );
}

function ChannelPlaceholder() {
  return (
    <div
      style={{
        padding: 16,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 12,
        border: "1px dashed rgba(255,255,255,0.15)",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Icon name="bell" size={16} color="rgba(255,255,255,0.4)" />
        <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.4)" }}>0%</span>
      </div>
      <div
        className="font-heading tabular"
        style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.4)" }}
      >
        —
      </div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.4)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        Sin canal
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 9999,
          marginTop: 10,
          overflow: "hidden",
        }}
      />
    </div>
  );
}

export function ClubMarketingScreenView({ data }: { data: MarketingData }) {
  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "broadcasts", filter: `club_id=eq.${data.clubId}` },
          { table: "broadcast_recipients" },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleNewCampaign = async () => {
    if (!data.clubId) return;
    const title = await ask({
      title: "Nueva campaña · 1/2",
      label: "Título de la campaña",
      placeholder: "ej. Promo de invierno",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (title == null) return;
    const body = await ask({
      title: "Nueva campaña · 2/2",
      label: "Mensaje",
      placeholder: "Cuerpo de la campaña",
      multiline: true,
      required: true,
      confirmLabel: "Crear campaña",
    });
    if (body == null) return;
    startTransition(async () => {
      const res = await createBroadcast({
        scope: "club",
        clubId: data.clubId!,
        title: title.trim(),
        body: body.trim(),
        channels: ["inapp"],
        targetFilter: {},
      });
      if (res.ok) toast({ icon: "check", title: "Campaña creada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const hasPromos = data.campaigns.length > 0;
  const hasChannels = data.channels.length > 0;

  const liveCount = data.campaigns.filter(
    (p) => p.tag === "EN VIVO" || p.tag === "PROGRAMADA" || p.tag === "ENVIADA",
  ).length;
  const pausedCount = data.campaigns.filter(
    (p) => p.tag === "BORRADOR" || p.tag === "CANCELADA",
  ).length;

  // KPIs: solo alcance + nº enviadas tienen modelo real. Los otros tres
  // (Nuevos socios, CTR, Revenue de promos) quedan en `—` hasta tener tracking.
  const KPIS: { l: string; v: string; sub: string; icon: string; accent?: string }[] = [
    {
      l: "Alcance · mes",
      v: data.reachMonth > 0 ? fmtReach(data.reachMonth) : "0",
      sub: `${data.sentCount} campañas enviadas`,
      icon: "megaphone",
    },
    { l: "Nuevos socios", v: "—", sub: "sin tracking aún", icon: "user-plus", accent: "var(--primary)" },
    { l: "CTR promedio", v: "—", sub: "sin tracking aún", icon: "mouse-pointer-click" },
    { l: "Revenue · promos", v: "—", sub: "sin tracking aún", icon: "wallet", accent: "#fbbf24" },
  ];

  return (
    <>
      <PolHero
        tone="dark"
        wm="PROMO"
        label="Club · Marketing"
        accent="#fbbf24"
        title="Atrae y retén"
        sub="Tus promociones, audiencia y canales en un solo lugar. Boost los eventos que más te importan."
        right={
          <button className="btn btn-primary" onClick={handleNewCampaign} disabled={isPending || !data.clubId}>
            <Icon name="plus" size={13} color="#fff" />
            {isPending ? "Creando…" : "Nueva campaña"}
          </button>
        }
      />

      {data.clubId && (
        <ClubFeaturingPanel clubId={data.clubId} clubName={data.clubName} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {KPIS.map((k) => (
          <div
            key={k.l}
            className="card"
            style={{ padding: 16, position: "relative", overflow: "hidden" }}
          >
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 30,
                height: 30,
                borderRadius: 8,
                background: k.accent || "#0a0a0a",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <Icon name={k.icon} size={14} color="#fff" />
            </div>
            <div className="label-mp">{k.l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 30,
                fontWeight: 900,
                marginTop: 10,
                letterSpacing: "-0.035em",
                color: k.accent || "#0a0a0a",
              }}
            >
              {k.v}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--muted-fg)",
                marginTop: 4,
                fontWeight: 700,
              }}
            >
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            margin: "8px 0 14px",
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Campañas activas<span className="dot">.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {liveCount} en vivo · {pausedCount} pausada{pausedCount === 1 ? "" : "s"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {hasPromos
            ? data.campaigns.map((p) => <PromoCard key={p.id} p={p} />)
            : Array.from({ length: PLACEHOLDER_PROMO_COUNT }).map((_, k) => (
                <PromoPlaceholder key={k} />
              ))}
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 24,
          background: "#0a0a0a",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 180,
            color: "rgba(255,255,255,0.04)",
            letterSpacing: "-0.06em",
            transform: "rotate(-6deg) translate(20%, -25%)",
          }}
        >
          REACH
        </div>
        <div style={{ position: "relative" }}>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>
            Canales · alcance esta semana
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              margin: "6px 0 20px",
            }}
          >
            De dónde vienen<span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {hasChannels
              ? data.channels.map((ch) => <ChannelTile key={ch.code} ch={ch} />)
              : Array.from({ length: PLACEHOLDER_CHANNEL_COUNT }).map((_, k) => (
                  <ChannelPlaceholder key={k} />
                ))}
          </div>
        </div>
      </div>
    </>
  );
}
