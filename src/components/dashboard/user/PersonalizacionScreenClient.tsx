// Panel de customización de perfil (MP+ + bundles pagos).
//
// 3 secciones de presets con badges según ownership (Owned / MP+ / Bundle).
// Preview en vivo usando ProfileHeaderCard compartido (drift-free).
// Sección "Bundles disponibles" con instrucciones para adquirir (admin grant).
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { setProfileCustomization } from "@/server/actions/profile-customization";
import { ProfileHeaderCard } from "./ProfileHeaderCard";
import {
  ACCENT_COLORS,
  BANNER_PRESETS,
  CARD_STYLES,
  findAccent,
  findBanner,
  findCardStyle,
} from "@/lib/profile/customization-presets";
import {
  canUsePreset,
  lockStateFor,
  priceLabel,
  bodyPatternForBundle,
  MP_PLUS_KEY,
} from "@/lib/profile/bundles";
import type { BundleCatalogRow } from "./PersonalizacionScreen";

type InitialState = {
  accentColor: string | null;
  bannerPreset: string | null;
  cardStyle: string | null;
};

const DEFAULT_ACCENT = "#10b981";

export function PersonalizacionScreenClient({
  isPremium,
  initial,
  myGrants,
  bundles,
}: {
  isPremium: boolean;
  initial: InitialState | null;
  myGrants: string[];
  bundles: BundleCatalogRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [accent, setAccent] = useState<string | null>(initial?.accentColor ?? null);
  const [banner, setBanner] = useState<string | null>(initial?.bannerPreset ?? null);
  const [card, setCard] = useState<string | null>(initial?.cardStyle ?? null);

  const myGrantsSet = new Set(myGrants);
  const ownArgs = { isPremium, myGrants: myGrantsSet };

  const accentObj = findAccent(accent);
  const bannerObj = findBanner(banner);
  const cardObj = findCardStyle(card);

  const accentHex = accentObj?.hex ?? DEFAULT_ACCENT;
  const bannerCss = bannerObj?.background ?? null;

  const dirty =
    accent !== (initial?.accentColor ?? null) ||
    banner !== (initial?.bannerPreset ?? null) ||
    card !== (initial?.cardStyle ?? null);

  // Mapa de bundles por key (para mostrar precio en tooltips).
  const bundleByKey = new Map(bundles.map((b) => [b.key, b]));

  const handleSave = () => {
    if (!dirty || pending) return;
    startTransition(async () => {
      const res = await setProfileCustomization({
        accentColor: accent,
        bannerPreset: banner,
        cardStyle: card,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Personalización guardada" });
      router.refresh();
    });
  };

  // Click handler para un preset. Permite clickear locked: si no es owned,
  // muestra toast con cómo adquirir. Si es owned, lo selecciona/deselecciona.
  const handlePresetClick = (
    bundleKey: string,
    isSelected: boolean,
    apply: (next: string | null) => void,
    key: string,
  ) => {
    if (canUsePreset(bundleKey, ownArgs)) {
      apply(isSelected ? null : key);
      return;
    }
    if (bundleKey === MP_PLUS_KEY) {
      toast({
        icon: "lock",
        title: "Requiere MatchPoint+",
        sub: "Activa el plan desde Mi plan",
      });
    } else {
      const b = bundleByKey.get(bundleKey);
      toast({
        icon: "lock",
        title: `Requiere ${b?.label ?? bundleKey}`,
        sub: `${priceLabel(b?.priceCents ?? 0)} · contacta a soporte para adquirirlo`,
      });
    }
  };

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--primary)",
            marginBottom: 6,
          }}
        >
          ● MatchPoint+ · Personaliza
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: "clamp(2rem, 4vw, 3rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 1,
          }}
        >
          Tu perfil, tu vibe<span style={{ color: accentHex }}>.</span>
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 8, maxWidth: 600 }}>
          Elige el accent color, banner y card style. Los presets con badge
          <strong style={{ color: "#0a0a0a" }}> MP+</strong> se desbloquean con MatchPoint+; los
          de <strong style={{ color: "#0a0a0a" }}>bundles</strong> requieren compra única.
        </p>
      </header>

      {!isPremium && <UpgradeBanner />}

      <PreviewCard
        accentHex={accentHex}
        bannerCss={bannerCss}
        bannerKey={banner}
        bodyPattern={bannerObj ? bodyPatternForBundle(bannerObj.bundleKey) : null}
        bundleKey={bannerObj?.bundleKey ?? null}
        cardObj={cardObj}
      />

      <Section title="Accent color" hint="Tinta acentos del perfil (badges, dots, hovers).">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
            gap: 10,
          }}
        >
          {ACCENT_COLORS.map((c) => {
            const selected = accent === c.key;
            const lock = lockStateFor(c.bundleKey, ownArgs);
            return (
              <PresetSwatch
                key={c.key}
                selected={selected}
                lock={lock}
                bundleLabel={bundleByKey.get(c.bundleKey)?.label}
                onClick={() =>
                  handlePresetClick(c.bundleKey, selected, setAccent, c.key)
                }
                ariaLabel={c.label}
                background={c.hex}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Banner del header" hint="Fondo del header de tu perfil.">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          {BANNER_PRESETS.map((b) => {
            const selected = banner === b.key;
            const lock = lockStateFor(b.bundleKey, ownArgs);
            return (
              <BannerSwatch
                key={b.key}
                selected={selected}
                lock={lock}
                bundleLabel={bundleByKey.get(b.bundleKey)?.label}
                onClick={() => handlePresetClick(b.bundleKey, selected, setBanner, b.key)}
                label={b.label}
                background={b.background}
              />
            );
          })}
        </div>
      </Section>

      <Section
        title="Card style"
        hint="Aplica a tu card en listados de amigos, roster del team y al wrapper de tus stats."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 12,
          }}
        >
          {CARD_STYLES.map((s) => {
            const selected = card === s.key;
            const lock = lockStateFor(s.bundleKey, ownArgs);
            return (
              <CardSwatch
                key={s.key}
                selected={selected}
                lock={lock}
                bundleLabel={bundleByKey.get(s.bundleKey)?.label}
                onClick={() => handlePresetClick(s.bundleKey, selected, setCard, s.key)}
                label={s.label}
                css={s.css}
              />
            );
          })}
        </div>
      </Section>

      <BundleStore bundles={bundles} myGrants={myGrantsSet} />

      <div
        style={{
          position: "sticky",
          bottom: 16,
          marginTop: 24,
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setAccent(initial?.accentColor ?? null);
            setBanner(initial?.bannerPreset ?? null);
            setCard(initial?.cardStyle ?? null);
          }}
          disabled={!dirty || pending}
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            opacity: !dirty || pending ? 0.5 : 1,
            cursor: !dirty || pending ? "not-allowed" : "pointer",
          }}
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || pending}
          className="btn btn-primary"
          style={{
            opacity: !dirty || pending ? 0.55 : 1,
            cursor: !dirty || pending ? "not-allowed" : "pointer",
          }}
        >
          <Icon name="check" size={13} color="#fff" />
          {pending ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </main>
  );
}

function UpgradeBanner() {
  return (
    <div
      style={{
        padding: "18px 22px",
        marginBottom: 24,
        borderRadius: 14,
        background: "linear-gradient(135deg, #0a0a0a 0%, #1f1f23 60%, #064e3b 100%)",
        color: "#fff",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1, minWidth: 240 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: "rgba(251,191,36,0.18)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="sparkles" size={20} color="#fbbf24" />
        </div>
        <div>
          <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" }}>
            La mayoría de presets son MatchPoint+
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>
            Desbloquea accent colors, banners y card styles premium con la subscription.
          </div>
        </div>
      </div>
      <Link
        href="/dashboard/user/mi-plan"
        className="btn"
        style={{ background: "#fbbf24", color: "#0a0a0a", fontWeight: 800 }}
      >
        Activar MatchPoint+
        <Icon name="arrow-right" size={12} />
      </Link>
    </div>
  );
}

function PreviewCard({
  accentHex,
  bannerCss,
  bannerKey,
  bodyPattern,
  bundleKey,
  cardObj,
}: {
  accentHex: string;
  bannerCss: string | null;
  bannerKey: string | null;
  bodyPattern: string | null;
  bundleKey: string | null;
  cardObj: ReturnType<typeof findCardStyle>;
}) {
  return (
    <div
      style={{
        marginBottom: 28,
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
          padding: "8px 14px",
          background: "var(--muted)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Preview</span>
        <span
          style={{
            color: "#a3a3a3",
            textTransform: "none",
            letterSpacing: 0,
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          1:1 con tu perfil real
        </span>
      </div>
      <div style={{ padding: 16, background: "#fafafa" }}>
        <ProfileHeaderCard
          name="Tu nombre"
          username="tu_user"
          city="Quito"
          bio="Esta es la bio que aparece en tu perfil. Cambia los presets de arriba para ver cómo lucirá."
          avatarUrl={null}
          primaryClub={{ name: "Tu club" }}
          memberSince={new Date().toISOString()}
          accentHex={accentHex}
          bannerCss={bannerKey ? bannerCss : null}
          bodyPattern={bodyPattern}
          bundleKey={bundleKey}
          coverButton={null}
          avatarEditButton={null}
          actions={null}
        />
        <div
          style={{
            marginTop: 14,
            padding: 14,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
              marginBottom: 8,
            }}
          >
            Card style en listados
          </div>
          <PreviewCardChip cardObj={cardObj} accentHex={accentHex} />
        </div>
      </div>
    </div>
  );
}

function PreviewCardChip({
  cardObj,
  accentHex,
}: {
  cardObj: ReturnType<typeof findCardStyle>;
  accentHex: string;
}) {
  const css = cardObj?.css;
  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 14px",
        borderRadius: 10,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: css?.background ?? "#fff",
        border: css?.border ?? "1px solid var(--border)",
        boxShadow: css?.boxShadow ?? "none",
        backdropFilter: css?.backdropFilter,
        color: css?.color ?? "#0a0a0a",
        transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: accentHex,
          display: "inline-block",
        }}
      />
      <span style={{ fontWeight: 800, fontSize: 12 }}>Tu nombre · MPR 4.20</span>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        className="font-heading"
        style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.015em", margin: 0 }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "4px 0 14px" }}>{hint}</p>
      {children}
    </section>
  );
}

// ── Badges helpers ─────────────────────────────────────────────────────
type LockState = ReturnType<typeof lockStateFor>;

function LockBadge({ lock, bundleLabel }: { lock: LockState; bundleLabel?: string }) {
  if (lock.kind === "owned") return null;
  const isMpPlus = lock.kind === "mp_plus";
  const label = isMpPlus ? "MP+" : bundleLabel ?? lock.bundleKey;
  return (
    <span
      style={{
        position: "absolute",
        top: 5,
        right: 5,
        padding: "2px 6px",
        borderRadius: 6,
        background: isMpPlus ? "#fbbf24" : "#0a0a0a",
        color: isMpPlus ? "#0a0a0a" : "#fff",
        fontSize: 8.5,
        fontWeight: 900,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        pointerEvents: "none",
        maxWidth: "90%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </span>
  );
}

function PresetSwatch({
  selected,
  lock,
  bundleLabel,
  onClick,
  ariaLabel,
  background,
}: {
  selected: boolean;
  lock: LockState;
  bundleLabel?: string;
  onClick: () => void;
  ariaLabel: string;
  background: string;
}) {
  const locked = lock.kind !== "owned";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      title={locked ? `${ariaLabel} — ${lock.kind === "mp_plus" ? "Requiere MP+" : bundleLabel ?? ""}` : ariaLabel}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1",
        borderRadius: 12,
        background,
        border: selected ? "3px solid #0a0a0a" : "2px solid var(--border)",
        boxShadow: selected ? "0 0 0 3px #fff inset, 0 4px 12px rgba(0,0,0,0.18)" : "none",
        cursor: "pointer",
        transition: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1), border 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms",
        padding: 0,
        opacity: locked ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.06)";
        if (locked) e.currentTarget.style.opacity = "0.85";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        if (locked) e.currentTarget.style.opacity = "0.6";
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1.06)";
      }}
    >
      <LockBadge lock={lock} bundleLabel={bundleLabel} />
    </button>
  );
}

function BannerSwatch({
  selected,
  lock,
  bundleLabel,
  onClick,
  label,
  background,
}: {
  selected: boolean;
  lock: LockState;
  bundleLabel?: string;
  onClick: () => void;
  label: string;
  background: string;
}) {
  const locked = lock.kind !== "owned";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={locked ? `${label} — ${lock.kind === "mp_plus" ? "Requiere MP+" : bundleLabel ?? ""}` : label}
      style={{
        position: "relative",
        background,
        borderRadius: 12,
        border: selected ? "3px solid #0a0a0a" : "1px solid var(--border)",
        boxShadow: selected ? "0 4px 16px rgba(0,0,0,0.2)" : "none",
        cursor: "pointer",
        padding: 0,
        height: 80,
        overflow: "hidden",
        transition: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms",
        opacity: locked ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.03)";
        if (locked) e.currentTarget.style.opacity = "0.85";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        if (locked) e.currentTarget.style.opacity = "0.6";
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1.03)";
      }}
    >
      <LockBadge lock={lock} bundleLabel={bundleLabel} />
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 8,
          right: 8,
          fontSize: 10,
          fontWeight: 800,
          color: "#fff",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          textAlign: "left",
          letterSpacing: "0.01em",
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
    </button>
  );
}

function CardSwatch({
  selected,
  lock,
  bundleLabel,
  onClick,
  label,
  css,
}: {
  selected: boolean;
  lock: LockState;
  bundleLabel?: string;
  onClick: () => void;
  label: string;
  css: {
    background: string;
    border?: string;
    boxShadow?: string;
    backdropFilter?: string;
    color?: string;
  };
}) {
  const locked = lock.kind !== "owned";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={locked ? `${label} — ${lock.kind === "mp_plus" ? "Requiere MP+" : bundleLabel ?? ""}` : label}
      style={{
        position: "relative",
        padding: 14,
        background: css.background,
        border: selected ? "2px solid #0a0a0a" : css.border ?? "1px solid var(--border)",
        boxShadow: selected
          ? "0 8px 24px rgba(0,0,0,0.18)"
          : css.boxShadow ?? "none",
        backdropFilter: css.backdropFilter,
        color: css.color ?? "#0a0a0a",
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms",
        opacity: locked ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        if (locked) e.currentTarget.style.opacity = "0.85";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        if (locked) e.currentTarget.style.opacity = "0.6";
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
      }}
    >
      <LockBadge lock={lock} bundleLabel={bundleLabel} />
      <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em" }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          opacity: 0.8,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.4,
          }}
        />
        Jugador · 4.20
      </div>
    </button>
  );
}

// ── Bundle store ───────────────────────────────────────────────────────
function BundleStore({
  bundles,
  myGrants,
}: {
  bundles: BundleCatalogRow[];
  myGrants: Set<string>;
}) {
  if (bundles.length === 0) return null;
  return (
    <section style={{ marginTop: 40, marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          Bundles disponibles<span style={{ color: "#fbbf24" }}>.</span>
        </h2>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          Compra única · sin expiración
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "0 0 16px" }}>
        Estos packs desbloquean los presets premium-extra. Para adquirir uno,
        contacta a soporte vía WhatsApp o mensaje directo a MATCHPOINT — el
        equipo te confirma datos de transferencia y otorga el bundle al
        recibir el pago.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {bundles.map((b) => {
          const owned = myGrants.has(b.key);
          return (
            <div
              key={b.key}
              style={{
                padding: 16,
                borderRadius: 14,
                background: owned ? "linear-gradient(135deg, #064e3b, #052e16)" : "#fff",
                color: owned ? "#ecfdf5" : "#0a0a0a",
                border: owned ? "1px solid #10b981" : "1px solid var(--border)",
                boxShadow: owned ? "0 8px 24px rgba(16,185,129,0.2)" : "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3
                  className="font-heading"
                  style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 }}
                >
                  {b.label}
                </h3>
                {owned ? (
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(16,185,129,0.25)",
                      color: "#a7f3d0",
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Owned
                  </span>
                ) : (
                  <span
                    className="font-heading"
                    style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
                  >
                    {priceLabel(b.priceCents)}
                  </span>
                )}
              </div>
              {b.description && (
                <p
                  style={{
                    fontSize: 12.5,
                    margin: 0,
                    color: owned ? "rgba(236,253,245,0.85)" : "var(--muted-fg)",
                    lineHeight: 1.4,
                  }}
                >
                  {b.description}
                </p>
              )}
              {!owned && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted-fg)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  <Icon name="message-circle" size={12} />
                  Pídelo a soporte
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
