// Client view de ClubMarketingScreen — layout 1:1 (RoleScreensPolish.jsx 182-277).
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast, type ToastPayload } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { activateBroadcast, cancelBroadcast, createBroadcast } from "@/server/actions/marketing";
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

const PLACEHOLDER_CHANNEL_COUNT = 4;

function PromoMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 14px",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        color: danger ? "#dc2626" : "#0a0a0a",
        fontWeight: 700,
        textAlign: "left",
      }}
    >
      <Icon name={icon} size={13} color={danger ? "#dc2626" : "var(--muted-fg)"} />
      {label}
    </button>
  );
}

function PromoCardMenu({
  p,
  isPaused,
  isPending,
  onActivate,
  onCancel,
  onShare,
  onStats,
  onCopyCode,
}: {
  p: CampaignCard;
  isPaused: boolean;
  isPending: boolean;
  onActivate: () => void;
  onCancel: () => void;
  onShare: () => void;
  onStats: () => void;
  onCopyCode: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const canCancel = p.tag === "BORRADOR" || p.tag === "PROGRAMADA";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div style={{ display: "inline-flex", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Más acciones"
        aria-expanded={open}
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 37,
          height: 37,
          borderRadius: "50%",
          background: "#fff",
          border: "1px solid var(--border)",
          cursor: isPending ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          opacity: isPending ? 0.5 : 1,
        }}
      >
        <Icon name="more-horizontal" size={14} />
      </button>
      {open && mounted && pos &&
        createPortal(
          <>
            <div
              role="presentation"
              onClick={close}
              style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            />
            <div
              role="menu"
              style={{
                position: "fixed",
                top: pos.top,
                right: pos.right,
                zIndex: 9999,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
                overflow: "hidden",
                width: 220,
                fontSize: 12,
              }}
            >
              <PromoMenuItem
                icon="bar-chart-3"
                label="Ver estadísticas"
                onClick={() => {
                  close();
                  onStats();
                }}
              />
              <PromoMenuItem
                icon="copy"
                label="Copiar código"
                onClick={() => {
                  close();
                  onCopyCode();
                }}
              />
              {!isPaused && (
                <PromoMenuItem
                  icon="share-2"
                  label="Compartir"
                  onClick={() => {
                    close();
                    onShare();
                  }}
                />
              )}
              {isPaused && (
                <PromoMenuItem
                  icon="play"
                  label="Activar campaña"
                  onClick={() => {
                    close();
                    onActivate();
                  }}
                />
              )}
              {canCancel && (
                <>
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                  <PromoMenuItem
                    icon="pause-circle"
                    danger
                    label="Pausar campaña"
                    onClick={() => {
                      close();
                      onCancel();
                    }}
                  />
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function PromoCard({
  p,
  onActivate,
  onCancel,
  isPending,
  toast,
}: {
  p: CampaignCard;
  onActivate: (id: string) => void;
  onCancel: (id: string) => void;
  isPending: boolean;
  toast: (t: ToastPayload) => void;
}) {
  const isPaused = p.tag === "PAUSADA";

  const sharePromo = async () => {
    const text = `${p.n} · Código: ${p.code}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: p.n, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ icon: "check", title: "Texto copiado", sub: "Pégalo donde quieras compartir la promo." });
    } catch {
      /* usuario canceló share nativo */
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(p.code);
      toast({ icon: "check", title: "Código copiado" });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", sub: "Intenta de nuevo." });
    }
  };

  const showStats = () => {
    toast({
      icon: "bar-chart-3",
      title: "Estadísticas",
      sub: `${p.uses} de ${p.max} usos · Vence ${p.end}`,
    });
  };
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
          {isPaused ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 10.5, opacity: isPending ? 0.5 : 1, cursor: isPending ? "not-allowed" : "pointer" }}
              disabled={isPending}
              onClick={() => onActivate(p.id)}
            >
              <Icon name="play" size={11} color="#fff" />
              Activar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 10.5 }}
              onClick={() => void sharePromo()}
            >
              <Icon name="share-2" size={11} color="#fff" />
              Compartir
            </button>
          )}
          <PromoCardMenu
            p={p}
            isPaused={isPaused}
            isPending={isPending}
            onActivate={() => onActivate(p.id)}
            onCancel={() => onCancel(p.id)}
            onShare={() => void sharePromo()}
            onStats={showStats}
            onCopyCode={() => void copyCode()}
          />
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
  const router = useRouter();
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
      if (res.ok) {
        toast({ icon: "check", title: "Campaña creada" });
        // broadcasts no está en la realtime publication, así que forzamos
        // refresh del server component para que aparezca en el listado.
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleActivate = (id: string) => {
    startTransition(async () => {
      const res = await activateBroadcast({ id });
      if (res.ok) {
        toast({ icon: "check", title: "Campaña activada" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleCancel = (id: string) => {
    startTransition(async () => {
      const res = await cancelBroadcast({ id });
      if (res.ok) {
        toast({ icon: "check", title: "Campaña pausada" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const hasChannels = data.channels.length > 0;

  const liveCount = data.campaigns.filter(
    (p) => p.tag === "EN VIVO" || p.tag === "PROGRAMADA" || p.tag === "ENVIADA" || p.tag === "MÁS USADA" || p.tag === "NUEVA",
  ).length;
  const pausedCount = data.campaigns.filter(
    (p) => p.tag === "BORRADOR" || p.tag === "CANCELADA" || p.tag === "PAUSADA",
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

      <div className="mp-partner-torneo-kpis">
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
        <div className="mp-tournament-form-grid-3">
          {data.campaigns.map((p) => (
            <PromoCard
              key={p.id}
              p={p}
              onActivate={handleActivate}
              onCancel={handleCancel}
              isPending={isPending}
              toast={toast}
            />
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
          <div className="mp-partner-torneo-kpis" style={{ gap: 12 }}>
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
