"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { Countdown, OwnerBadge } from "@/components/giveaways";
import { StripedImg } from "@/components/giveaways/handoff";
import { formatGiveawayDrawAt, formatGiveawayHeroUser, isGiveawayUrgent } from "@/lib/giveaways/build-my-dashboard";
import type {
  MyGiveawayAdentro,
  MyGiveawayPending,
  MyGiveawayUnlockAction,
  MyGiveawayWon,
  MyGiveawayLost,
  MyGiveawaysDashboard,
} from "@/lib/schemas/giveaways";
import { getReferralShareUiCopy } from "@/lib/referrals/share";

function unlockActionButtonLabel(kind: string, done: boolean, compact = false): string {
  if (done) return "Hecho";
  if (kind === "invite") {
    return getReferralShareUiCopy({ surface: "giveaway", giveawayTitle: "", clubName: "" }).actionLabel;
  }
  return compact ? "Hacer" : "Hacer ahora";
}

type TabKey = "adentro" | "pendientes" | "ganados" | "pasados";

function closesInFromIso(iso: string | null): { days: number; hours: number } {
  if (!iso) return { days: 0, hours: 0 };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { days: 0, hours: 0 };
  const hours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hours / 24), hours: hours % 24 };
}

function probLabel(pct: number, decimals = 3): string {
  if (pct <= 0) return "0%";
  if (pct >= 1) return `${pct.toFixed(decimals === 2 ? 1 : 0)}%`;
  return `${pct.toFixed(decimals)}%`;
}

function PrizeThumb({
  label,
  imageUrl,
  size = 180,
  style,
}: {
  label: string;
  imageUrl: string | null;
  size?: number;
  style?: CSSProperties;
}) {
  if (imageUrl) {
    return (
      <div
        className="img-slot"
        style={{
          height: "100%",
          minHeight: size,
          borderRadius: 0,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          ...style,
        }}
      />
    );
  }
  return <StripedImg label={label} style={{ height: "100%", minHeight: size, borderRadius: 0, ...style }} />;
}

export function MyGiveawaysViewClient({ dashboard }: { dashboard: MyGiveawaysDashboard }) {
  const [tab, setTab] = useState<TabKey>("adentro");
  const lostCount = dashboard.pasados.length;
  const drawnTotal = dashboard.ganados.length + lostCount;
  const pendingClaims = dashboard.ganados.filter((g) => g.claimStatus === "pending").length;
  const unlockPending = dashboard.unlockActions.reduce(
    (s, a) => s + a.qualifiesFor.filter((q) => !q.already).length,
    0,
  );

  const heroUser = formatGiveawayHeroUser(dashboard.displayName, dashboard.username);
  const winRateValue = drawnTotal > 0 ? `${dashboard.stats.winRatePct}%` : "—";
  const winRateHint =
    drawnTotal > 0
      ? `${dashboard.stats.ganados} ganados de ${drawnTotal}`
      : "Sin sorteos cerrados";

  return (
    <div className="ms-root">
      {/* Web breadcrumb */}
      <div className="ms-breadcrumb">
        <Link href="/dashboard/user/perfil" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "inherit", textDecoration: "none" }}>
          <Icon name="arrow-left" size={11} /> Mi perfil
        </Link>
        <Icon name="chevron-right" size={10} />
        <span style={{ color: "var(--fg)" }}>Mis sorteos</span>
      </div>

      {/* Hero */}
      <div className="ms-hero hero-emerald">
        <div aria-hidden className="ms-hero-watermark">
          SORTEOS
        </div>

        <div className="ms-hero-body">
          <div className="ms-hero-copy">
            <div className="label-mp ms-hero-user">{heroUser}</div>
            <h1 className="font-heading ms-hero-title">
              Mis sorteos<span style={{ color: "var(--gw-accent)" }}>.</span>
            </h1>
            <p className="ms-hero-desc">
              1 entrada por jugador. Calificas → entras al pool. Mismas probabilidades para todos los que cumplen los requisitos.
            </p>
          </div>

          <div className="ms-hero-stats-row ms-hero-stats-row--mobile">
            <HeroStat label="Adentro" value={String(dashboard.stats.adentro)} hint="Entradas confirmadas" accent variant="glass" />
            <HeroStat label="Por calificar" value={String(dashboard.stats.pendientes)} hint="Te falta cumplir algo" variant="glass" />
            <HeroStat label="Ganados" value={String(dashboard.stats.ganados)} hint={pendingClaims > 0 ? `${pendingClaims} por reclamar` : "Premios ganados"} variant="glass" />
          </div>

          <div className="ms-hero-stats-row ms-hero-stats-row--desktop">
            <HeroStat label="Adentro" value={String(dashboard.stats.adentro)} hint="Entradas confirmadas" accent variant="solid" />
            <HeroStat label="Por calificar" value={String(dashboard.stats.pendientes)} hint="Te falta cumplir algo" variant="solid" />
            <HeroStat label="Ganados" value={String(dashboard.stats.ganados)} hint={pendingClaims > 0 ? `${pendingClaims} por reclamar` : "Premios ganados"} variant="solid" />
            <HeroStat label="Tasa de éxito" value={winRateValue} hint={winRateHint} variant="solid" />
          </div>
        </div>
      </div>

      {/* Tabs — mobile sticky bajo TopBar (mismo markup que v11 + Pasados) */}
      <div className="ms-mobile-tabs">
        {(
          [
            { k: "adentro" as TabKey, l: "Adentro", c: dashboard.stats.adentro },
            { k: "pendientes" as TabKey, l: "Califica", c: dashboard.stats.pendientes },
            { k: "ganados" as TabKey, l: "Ganados", c: dashboard.stats.ganados },
            { k: "pasados" as TabKey, l: "Pasados", c: lostCount },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "12px 0",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              alignItems: "center",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              borderBottom: `2px solid ${t.k === tab ? "var(--primary)" : "transparent"}`,
              color: t.k === tab ? "var(--fg)" : "var(--muted-fg)",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{t.l}</span>
            <span
              style={{
                padding: "0 6px",
                borderRadius: 9999,
                background: t.k === tab ? "var(--primary)" : "var(--muted)",
                color: t.k === tab ? "#fff" : "var(--muted-fg)",
                fontSize: 8.5,
                fontWeight: 900,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {t.c}
            </span>
          </button>
        ))}
      </div>

      <div className="ms-desktop-tabs">
        {(
          [
            { k: "adentro" as TabKey, l: "Adentro", icon: "ticket", count: dashboard.stats.adentro },
            { k: "pendientes" as TabKey, l: "Por calificar", icon: "circle-dashed", count: dashboard.stats.pendientes },
            { k: "ganados" as TabKey, l: "Ganados", icon: "trophy", count: dashboard.stats.ganados },
            { k: "pasados" as TabKey, l: "Pasados", icon: "history", count: lostCount },
          ] as const
        ).map((t) => (
          <button key={t.k} type="button" className="pv-tab" data-on={t.k === tab} onClick={() => setTab(t.k)}>
            <Icon name={t.icon} size={11} /> {t.l}
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 9999,
                background: t.k === tab ? "var(--primary)" : "var(--muted)",
                color: t.k === tab ? "#fff" : "var(--muted-fg)",
                fontSize: 9,
                fontWeight: 900,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="ms-panel-wrap">
        {tab === "adentro" && <AdentroPanel dashboard={dashboard} />}
        {tab === "pendientes" && <PendientesPanel dashboard={dashboard} unlockPending={unlockPending} />}
        {tab === "ganados" && <GanadosPanel items={dashboard.ganados} />}
        {tab === "pasados" && <PasadosPanel items={dashboard.pasados} />}
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  hint,
  accent,
  variant,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
  variant: "glass" | "solid";
}) {
  return (
    <div className={`card ms-hero-stat-tile ms-hero-stat-tile--${variant}`}>
      <div className="label-mp ms-hero-stat-label">{label}</div>
      <div className={`font-heading tabular ms-hero-stat-value${accent ? " ms-hero-stat-value--accent" : ""}`}>{value}</div>
      <div className="ms-hero-stat-hint">{hint}</div>
    </div>
  );
}

function AdentroPanel({ dashboard }: { dashboard: MyGiveawaysDashboard }) {
  const router = useRouter();
  const next = dashboard.nextDraw;

  if (dashboard.adentro.length === 0) {
    return (
      <EmptyState
        icon="ticket"
        title="Aún no calificas en ningún sorteo"
        text="Únete a un sorteo y cumple los requisitos para confirmar tu entrada."
      />
    );
  }

  return (
    <>
      <div className="md:grid md:grid-cols-[1fr_320px] md:gap-[18px] md:items-start flex flex-col gap-3 min-w-0">
        <div className="flex flex-col gap-3 min-w-0">
          {dashboard.adentro.map((g) => (
            <AdentroCard key={g.id} g={g} onOpen={() => router.push(`/dashboard/clubes/giveaways/${g.id}`)} />
          ))}
        </div>

        <div className="hidden md:flex flex-col gap-3.5 sticky top-4">
          {next ? <NextDrawSidebarCard next={next} onOpen={() => router.push(`/dashboard/clubes/giveaways/${next.giveawayId}`)} /> : null}
          <div className="card" style={{ padding: 18, background: "#0a0a0a", color: "#fff", borderColor: "#0a0a0a" }}>
            <Icon name="lightbulb" size={16} color="var(--primary)" />
            <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 8 }}>Por qué 1 entrada por jugador</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 4, lineHeight: 1.5 }}>
              Mismas probabilidades para todos los que califican. No depende de quién comparta más — depende de cumplir los requisitos antes del cierre.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AdentroCard({ g, onOpen }: { g: MyGiveawayAdentro; onOpen: () => void }) {
  const closesIn = closesInFromIso(g.closesAt);
  const urgent = g.urgent || isGiveawayUrgent(g.closesAt, g.drawAt);

  return (
    <>
      {/* Mobile card */}
      <button
        type="button"
        className="card md:hidden"
        style={{ padding: 12, borderColor: urgent ? "var(--destructive-border)" : "var(--border)", textAlign: "left", cursor: "pointer", width: "100%" }}
        onClick={onOpen}
      >
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 10 }}>
          <PrizeThumb label={g.prizeLabel} imageUrl={g.prizeImageUrl} size={56} style={{ height: 56, width: 56, borderRadius: 9, minHeight: 56 }} />
          <div style={{ minWidth: 0 }}>
            <OwnerBadge owner={g.ownerType} name={g.clubName} />
            <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>{g.title}</div>
          </div>
        </div>
        <div
          style={{
            marginTop: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: urgent ? "var(--destructive-bg)" : "var(--primary-light)",
            border: `1px solid ${urgent ? "var(--destructive-border)" : "var(--primary)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              gap: 5,
              alignItems: "center",
              fontSize: 11.5,
              fontWeight: 900,
              color: urgent ? "var(--destructive-fg)" : "var(--primary-dark)",
              minWidth: 0,
              flex: "1 1 auto",
              overflow: "hidden",
            }}
          >
            <Icon name="ticket" size={12} color={urgent ? "var(--destructive-fg)" : "var(--primary-dark)"} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              1 entrada · {probLabel(g.probabilityPct, 2)}
            </span>
          </span>
          <Countdown days={closesIn.days} hours={closesIn.hours} urgent={urgent} compact />
        </div>
      </button>

      {/* Web card */}
      <button
        type="button"
        className="card hidden md:grid"
        style={{
          padding: 0,
          overflow: "hidden",
          gridTemplateColumns: "180px 1fr",
          borderColor: urgent ? "var(--destructive-border)" : "var(--border)",
          textAlign: "left",
          cursor: "pointer",
          width: "100%",
        }}
        onClick={onOpen}
      >
        <PrizeThumb label={g.prizeLabel} imageUrl={g.prizeImageUrl} />
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <OwnerBadge owner={g.ownerType} name={g.clubName} />
              <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1.1 }}>
                {g.title}<span style={{ color: "var(--primary)" }}>.</span>
              </div>
              {g.subtitle ? <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3, fontWeight: 600 }}>{g.subtitle}</div> : null}
            </div>
            <Countdown days={closesIn.days} hours={closesIn.hours} urgent={urgent} />
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              alignSelf: "flex-start",
              padding: "8px 12px",
              borderRadius: 9,
              background: "var(--primary-light)",
              border: "1px solid var(--primary)",
            }}
          >
            <Icon name="ticket" size={14} color="var(--primary-dark)" />
            <span className="font-heading" style={{ fontSize: 13, fontWeight: 900, color: "var(--primary-dark)", textTransform: "uppercase" }}>
              1 entrada confirmada
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 6 }}>
            <div>
              <div className="label-mp">Califican</div>
              <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>
                {g.qualifierCount}
              </div>
            </div>
            <div>
              <div className="label-mp">Tu probabilidad</div>
              <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "var(--primary-dark)", marginTop: 4 }}>
                {probLabel(g.probabilityPct)}
              </div>
            </div>
            <div>
              <div className="label-mp">Sorteo</div>
              <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6 }}>{formatGiveawayDrawAt(g.drawAt)}</div>
            </div>
          </div>
        </div>
      </button>
    </>
  );
}

function PendientesPanel({ dashboard, unlockPending }: { dashboard: MyGiveawaysDashboard; unlockPending: number }) {
  const router = useRouter();

  if (dashboard.pendientes.length === 0) {
    return (
      <EmptyState
        icon="circle-dashed"
        title="No tienes sorteos por calificar"
        text="Cuando te unas a un sorteo y te falte algún requisito, aparecerá aquí."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="card ms-pendientes-banner">
        <div className="ms-pendientes-banner-body flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
          <div className="min-w-0">
            <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
              {unlockPending > 0 ? "Cómo funciona" : "Casi listo"}
            </div>
            <div className="font-heading" style={{ fontSize: "clamp(16px, 2.5vw, 18px)", fontWeight: 900, color: "var(--primary-dark)", textTransform: "uppercase", letterSpacing: "-0.02em", marginTop: 4, lineHeight: 1.1 }}>
              Una acción puede calificarte en varios sorteos<span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <p className="hidden md:block" style={{ fontSize: 12, color: "var(--primary-dark)", marginTop: 4, maxWidth: 600 }}>
              Si completas una acción compartida, puedes calificar en varios sorteos a la vez. Cada uno te da 1 entrada.
            </p>
          </div>
          {unlockPending > 0 ? (
            <div className="font-heading tabular ms-pendientes-banner-stat md:text-right">
              +{unlockPending}
              <div className="ms-pendientes-banner-stat-sub">SORTEOS POR DESBLOQUEAR</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="label-mp">Sorteos en los que te falta cumplir</div>
      {dashboard.pendientes.map((g) => (
        <PendingCard key={g.id} g={g} onOpen={() => router.push(`/dashboard/clubes/giveaways/${g.id}`)} />
      ))}

      {dashboard.unlockActions.length > 0 ? (
        <>
          <div className="label-mp" style={{ marginTop: 8 }}>
            Acciones que te califican en varios sorteos
          </div>
          {dashboard.unlockActions.map((a) => (
            <UnlockActionRow key={a.kind} action={a} onAction={() => {
              const target = a.qualifiesFor.find((q) => !q.already);
              if (target) router.push(`/dashboard/clubes/giveaways/${target.giveawayId}`);
            }} />
          ))}
        </>
      ) : null}
    </div>
  );
}

function PendingCard({ g, onOpen }: { g: MyGiveawayPending; onOpen: () => void }) {
  const closesIn = closesInFromIso(g.closesAt);
  const missing = g.totalReq - g.metCount;

  return (
    <>
      <button type="button" className="card md:hidden" style={{ padding: 12, textAlign: "left", cursor: "pointer", width: "100%" }} onClick={onOpen}>
        <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: 10 }}>
          <PrizeThumb label={g.prizeLabel} imageUrl={g.prizeImageUrl} size={50} style={{ height: 50, width: 50, borderRadius: 8, minHeight: 50 }} />
          <div style={{ minWidth: 0 }}>
            <OwnerBadge owner={g.ownerType} name={g.clubName} />
            <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>{g.title}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--warn-fg)" }}>
            {g.metCount}/{g.totalReq} requisitos
          </span>
          <Countdown days={closesIn.days} hours={closesIn.hours} />
        </div>
        <div style={{ marginTop: 6, height: 4, borderRadius: 9999, background: "var(--muted)" }}>
          <div style={{ width: `${g.totalReq ? (g.metCount / g.totalReq) * 100 : 0}%`, height: "100%", background: "var(--warn-fg)", borderRadius: 9999 }} />
        </div>
      </button>

      <div className="card hidden md:grid" style={{ padding: 0, overflow: "hidden", gridTemplateColumns: "160px 1fr 220px" }}>
        <PrizeThumb label={g.prizeLabel} imageUrl={g.prizeImageUrl} size={120} />
        <div style={{ padding: 16 }}>
          <OwnerBadge owner={g.ownerType} name={g.clubName} />
          <div className="font-heading" style={{ fontSize: 17, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1.1 }}>
            {g.title}<span style={{ color: "var(--primary)" }}>.</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
            {g.qualifierCount} ya califican · cierra en {closesIn.days}d {closesIn.hours}h
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
            {g.requirements.map((r) => (
              <div key={r.kind} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: r.met ? "var(--primary)" : "transparent",
                    border: `1.5px solid ${r.met ? "var(--primary)" : "var(--border)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {r.met ? <Icon name="check" size={9} color="#fff" /> : null}
                </span>
                <span style={{ fontWeight: r.met ? 500 : 800, color: r.met ? "var(--muted-fg)" : "var(--fg)", textDecoration: r.met ? "line-through" : "none" }}>
                  {r.label}
                  {r.pending ? " · En revisión" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", borderLeft: "1px dashed var(--border)" }}>
          <div className="label-mp">Te falta</div>
          <div className="font-heading tabular" style={{ fontSize: 28, fontWeight: 900, color: "var(--warn-fg)", letterSpacing: "-0.02em" }}>
            {missing}<span style={{ fontSize: 14, color: "var(--muted-fg)", fontWeight: 700 }}>/{g.totalReq}</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={onOpen}>
            Ver qué hacer
          </button>
        </div>
      </div>
    </>
  );
}

function UnlockActionRow({ action, onAction }: { action: MyGiveawayUnlockAction; onAction: () => void }) {
  const pending = action.qualifiesFor.filter((q) => !q.already);
  const done = pending.length === 0;

  return (
    <>
      <div
        className="card hidden md:grid"
        style={{
          padding: 14,
          gridTemplateColumns: "48px 1fr 120px 110px",
          gap: 14,
          alignItems: "center",
          opacity: done ? 0.5 : 1,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={action.icon} size={20} color="var(--primary-dark)" />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{action.label}</div>
            <span
              className="chip"
              style={{
                background: action.autoVerify ? "var(--primary-light)" : "var(--warn-bg)",
                color: action.autoVerify ? "var(--primary-light-fg)" : "var(--warn-fg)",
                fontSize: 8.5,
              }}
            >
              {action.autoVerify ? "✓ AUTO" : "⚠ MANUAL"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            {action.qualifiesFor.map((q) => (
              <span
                key={q.giveawayId}
                className="chip"
                style={{
                  background: q.already ? "var(--muted)" : "#fff",
                  color: q.already ? "var(--muted-fg)" : "var(--fg)",
                  border: q.already ? "1px solid var(--border)" : "1px solid var(--primary)",
                  fontSize: 9.5,
                  textDecoration: q.already ? "line-through" : "none",
                }}
              >
                {q.already ? "✓ " : ""}
                {q.sorteo}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="label-mp">Te califica en</div>
          <div className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900, color: "var(--primary-dark)", marginTop: 2 }}>
            {pending.length}
          </div>
          <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>sorteo{pending.length === 1 ? "" : "s"}</div>
        </div>
        <button type="button" className="btn btn-primary" disabled={done} onClick={onAction} style={done ? { background: "var(--muted)", color: "var(--muted-fg)" } : undefined}>
          {unlockActionButtonLabel(action.kind, done)}
        </button>
      </div>

      {!done ? (
        <div className="card md:hidden" style={{ padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 10, alignItems: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: 9, background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={action.icon} size={16} color="var(--primary-dark)" />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>{action.label}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                Te califica en {pending.length} sorteo{pending.length === 1 ? "" : "s"}
              </div>
            </div>
            <button type="button" className="btn btn-onyx btn-sm" onClick={onAction}>
              {unlockActionButtonLabel(action.kind, false, true)}
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
            {pending.map((q) => (
              <span key={q.giveawayId} style={{ fontSize: 9.5, padding: "3px 7px", borderRadius: 9999, background: "var(--primary-light)", color: "var(--primary-dark)", fontWeight: 700 }}>
                → {q.sorteo}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function GanadosPanel({ items }: { items: MyGiveawayWon[] }) {
  const router = useRouter();

  if (items.length === 0) {
    return <EmptyWon />;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => (
        <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="md:grid md:grid-cols-[180px_1fr_200px]">
            <div className="grid grid-cols-[72px_1fr] md:contents">
              <PrizeThumb label={p.prizeLabel} imageUrl={p.prizeImageUrl} size={72} style={{ height: 72, width: 72, minHeight: 72 }} />
              <div style={{ padding: "10px 12px 10px 0" }} className="md:p-[18px]">
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="chip" style={{ background: "var(--gw-accent)", color: "#052e22", fontSize: 9 }}>
                    <Icon name="trophy" size={9} color="#052e22" /> ★ GANASTE
                  </span>
                  <OwnerBadge owner={p.ownerType} name={p.clubName} />
                </div>
                <div className="font-heading hidden md:block" style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 2 }}>
                  {p.title}<span style={{ color: "var(--primary)" }}>.</span>
                </div>
                <div className="md:hidden" style={{ fontSize: 12.5, fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>
                  {p.title}
                </div>
                {p.subtitle ? <div className="hidden md:block" style={{ fontSize: 12, color: "var(--muted-fg)", fontWeight: 600 }}>{p.subtitle}</div> : null}
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
                  <Icon name="calendar" size={10} /> Sorteado {p.drawnAt ? formatGiveawayDrawAt(p.drawnAt) : "—"}
                </div>
              </div>
            </div>
            <div className="ms-ganado-actions md:border-t-0 md:border-l md:border-dashed md:p-[18px] md:flex-col md:items-stretch md:justify-center md:gap-2">
              {p.claimStatus === "pending" ? (
                <>
                  <div>
                    <span className="chip chip-warn" style={{ fontSize: 8.5 }}>
                      POR RECLAMAR
                    </span>
                    {p.claimHint ? <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4 }}>{p.claimHint}</div> : null}
                  </div>
                  <button type="button" className="btn btn-primary btn-sm md:mt-1" onClick={() => router.push(`/dashboard/clubes/giveaways/${p.id}`)}>
                    Reclamar
                  </button>
                </>
              ) : (
                <>
                  <span className="chip chip-emerald" style={{ fontSize: 8.5 }}>
                    ✓ ENTREGADO
                  </span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => router.push(`/dashboard/clubes/giveaways/${p.id}`)}>
                    Ver detalle
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PasadosPanel({ items }: { items: MyGiveawayLost[] }) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <EmptyState icon="history" title="Sin sorteos pasados" text="Cuando un sorteo termine, lo verás aquí." />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            className="card ms-pasado-mobile"
            onClick={() => router.push(`/dashboard/clubes/giveaways/${p.id}`)}
          >
            <PrizeThumb label={p.title} imageUrl={p.prizeImageUrl} size={50} style={{ height: 50, width: 50, borderRadius: 8, minHeight: 50 }} />
            <div style={{ minWidth: 0 }}>
              <OwnerBadge owner={p.ownerType} name={p.clubName} />
              <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>{p.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>
                {p.qualifierCount} jugadores{p.drawnAt ? ` · ${formatGiveawayDrawAt(p.drawnAt)}` : ""}
              </div>
            </div>
            <span className="chip" style={{ flexShrink: 0 }}>FIN</span>
          </button>
        ))}
      </div>
      <div className="hidden md:flex flex-col gap-3">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            className="card"
            style={{ padding: 14, display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 14, alignItems: "center", opacity: 0.75, textAlign: "left", cursor: "pointer", width: "100%" }}
            onClick={() => router.push(`/dashboard/clubes/giveaways/${p.id}`)}
          >
            <PrizeThumb label={p.title} imageUrl={p.prizeImageUrl} size={60} style={{ height: 60, width: 60, borderRadius: 9, minHeight: 60 }} />
            <div>
              <OwnerBadge owner={p.ownerType} name={p.clubName} />
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                {p.subtitle ?? "Finalizado"} · 1 entrada · {p.qualifierCount} jugadores
                {p.drawnAt ? ` · ${formatGiveawayDrawAt(p.drawnAt)}` : ""}
              </div>
            </div>
            <span className="chip">FINALIZADO</span>
          </button>
        ))}
      </div>
    </>
  );
}

function NextDrawSidebarCard({
  next,
  onOpen,
}: {
  next: NonNullable<MyGiveawaysDashboard["nextDraw"]>;
  onOpen: () => void;
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>
        Próximo sorteo<span style={{ color: "var(--primary)" }}>.</span>
      </div>
      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 10,
          background: next.urgent ? "var(--destructive-bg)" : "var(--primary-light)",
          border: `1px solid ${next.urgent ? "var(--destructive-border)" : "var(--primary)"}`,
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 800, color: next.urgent ? "var(--destructive-fg)" : "var(--primary-dark)" }}>
          {next.title}
        </div>
        <div style={{ fontSize: 11, color: next.urgent ? "var(--destructive-fg)" : "var(--primary-dark)", marginTop: 4 }}>
          {formatGiveawayDrawAt(next.drawAt)}
        </div>
        <div
          className="font-heading tabular"
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: next.urgent ? "var(--destructive-fg)" : "var(--primary-dark)",
            marginTop: 6,
            letterSpacing: "-0.02em",
          }}
        >
          1 entrada · {probLabel(next.probabilityPct)}
        </div>
        {next.drawChannel ? (
          <button type="button" className="btn btn-onyx" style={{ marginTop: 10, width: "100%" }} onClick={onOpen}>
            <Icon name="video" size={11} color="#fff" /> Ver sorteo
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyWon() {
  return (
    <div className="card" style={{ padding: 40, textAlign: "center" }}>
      <Icon name="trophy" size={36} color="var(--muted-fg)" />
      <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", marginTop: 12 }}>
        Aún no has ganado<span style={{ color: "var(--primary)" }}>.</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted-fg)", marginTop: 6 }}>Sigue calificando en más sorteos. Tu turno va a llegar.</div>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="card" style={{ padding: 32, textAlign: "center" }}>
      <Icon name={icon} size={32} color="var(--muted-fg)" />
      <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase", marginTop: 10 }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted-fg)", marginTop: 6, maxWidth: 360, marginInline: "auto" }}>{text}</div>
    </div>
  );
}
