// Panel de personalización por TEMAS curados (MP+ + bundles).
//
// El user elige UN tema cohesivo (no mezcla accent/card/banner). Al clickear un
// tema desbloqueado se aplica al instante (setTheme). Preview en vivo con
// ProfileHeaderCard. Sección "Bundles disponibles" igual que antes.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { setTheme } from "@/server/actions/profile-customization";
import { ProfileHeaderCard } from "./ProfileHeaderCard";
import { FriendCard, type FriendLite } from "../widgets/FriendCard";
import {
  PROFILE_THEMES,
  PROFILE_THEMES_BY_RARITY,
  themeFromState,
  rarityOf,
  RARITY_META,
  type ProfileTheme,
  type ThemeCardCss,
} from "@/lib/profile/customization-presets";
import {
  canUsePreset,
  priceLabel,
  bodyPatternForBundle,
} from "@/lib/profile/bundles";
import type { BundleCatalogRow } from "./PersonalizacionScreen";

type InitialState = {
  accentColor: string | null;
  bannerPreset: string | null;
  cardStyle: string | null;
};

const DEFAULT_ACCENT = "#10b981";

function themeIsOwned(t: ProfileTheme, args: { isPremium: boolean; myGrants: Set<string> }): boolean {
  if (t.bundleKey === "free") return true;
  return canUsePreset(t.bundleKey, args);
}

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

  const myGrantsSet = new Set(myGrants);
  const ownArgs = { isPremium, myGrants: myGrantsSet };
  const bundleByKey = new Map(bundles.map((b) => [b.key, b]));

  // Tema activo: matchea el estado actual; si es un combo viejo no-temático
  // (no debería tras la migración 126), cae a 'default'.
  const currentKey =
    themeFromState(initial?.accentColor ?? null, initial?.cardStyle ?? null, initial?.bannerPreset ?? null)?.key ??
    "default";
  const [selected, setSelected] = useState<string>(currentKey);

  const selectedTheme = PROFILE_THEMES.find((t) => t.key === selected) ?? PROFILE_THEMES[0];
  const accentHex = selectedTheme.accentHex ?? DEFAULT_ACCENT;

  const applyTheme = (t: ProfileTheme) => {
    if (pending) return;
    if (!themeIsOwned(t, ownArgs)) {
      if (t.bundleKey === "mp_plus") {
        toast({ icon: "lock", title: "Tema MatchPoint+", sub: "Actívalo desde Mi plan" });
      } else {
        const b = bundleByKey.get(t.bundleKey);
        toast({
          icon: "lock",
          title: `Requiere ${b?.label ?? t.bundleKey}`,
          sub: `${priceLabel(b?.priceCents ?? 0)} · pídelo a soporte`,
        });
      }
      return;
    }
    if (t.key === selected) return;
    const prev = selected;
    setSelected(t.key);
    startTransition(async () => {
      const res = await setTheme({ theme: t.key });
      if (!res.ok) {
        setSelected(prev);
        toast({ icon: "alert-triangle", title: "No se pudo aplicar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: `Tema "${t.label}" aplicado` });
      router.refresh();
    });
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
          Elige un <strong style={{ color: "#0a0a0a" }}>tema</strong>: define accent, banner y card de
          forma cohesiva, sin combinaciones raras. Los <strong style={{ color: "#0a0a0a" }}>MP+</strong> se
          desbloquean con MatchPoint+; los de <strong style={{ color: "#0a0a0a" }}>bundles</strong>, con
          compra única.
        </p>
      </header>

      {!isPremium && <UpgradeBanner />}

      <PreviewCard
        accentHex={accentHex}
        bannerCss={selectedTheme.bannerCss}
        bodyPattern={selectedTheme.bannerCss ? bodyPatternForBundle(selectedTheme.bundleKey) : null}
        bundleKey={selectedTheme.bannerCss ? selectedTheme.bundleKey : null}
        cardCss={selectedTheme.cardCss}
      />

      <section style={{ marginBottom: 28 }}>
        <h2 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.015em", margin: 0 }}>
          Temas
        </h2>
        <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "4px 0 14px" }}>
          Un toque y se aplica. Tu fila en ranking, roster y amigos usa el accent + card del tema.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {PROFILE_THEMES_BY_RARITY.map((t) => (
            <ThemeCard
              key={t.key}
              theme={t}
              selected={t.key === selected}
              owned={themeIsOwned(t, ownArgs)}
              bundleLabel={bundleByKey.get(t.bundleKey)?.label}
              disabled={pending}
              onClick={() => applyTheme(t)}
            />
          ))}
        </div>
      </section>

      <BundleStore bundles={bundles} myGrants={myGrantsSet} />
    </main>
  );
}

// ── ThemeCard ──────────────────────────────────────────────────────────
function ThemeCard({
  theme,
  selected,
  owned,
  bundleLabel,
  disabled,
  onClick,
}: {
  theme: ProfileTheme;
  selected: boolean;
  owned: boolean;
  bundleLabel?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const accentHex = theme.accentHex ?? "#10b981";
  // Preview del banner: gradiente del tema, o un fondo neutro para "Clásico".
  const bannerBg = theme.bannerCss ?? "linear-gradient(135deg, #f5f5f5, #e5e5e5)";
  const cardBg = theme.cardCss?.background ?? "#fff";
  const cardBorder = theme.cardCss?.border ?? "1px solid var(--border)";
  const cardColor = theme.cardCss?.color ?? "#0a0a0a";
  const rarity = RARITY_META[rarityOf(theme.key)];
  const locked = !owned;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={locked ? `${theme.label} — ${theme.bundleKey === "mp_plus" ? "Requiere MP+" : bundleLabel ?? ""}` : theme.label}
      style={{
        position: "relative",
        padding: 0,
        borderRadius: 14,
        overflow: "hidden",
        border: selected ? "2.5px solid #0a0a0a" : "1px solid var(--border)",
        boxShadow: selected ? "0 6px 18px rgba(0,0,0,0.16)" : "none",
        cursor: disabled ? "wait" : "pointer",
        background: "#fff",
        textAlign: "left",
        opacity: locked ? 0.62 : 1,
        transition: "transform 160ms var(--ease-out, ease), opacity 160ms",
      }}
    >
      {/* Banner strip */}
      <div style={{ height: 46, background: bannerBg }} />
      {/* Rareza (chip arriba-izquierda) */}
      <span
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          padding: "2px 7px",
          borderRadius: 6,
          background: rarity.color,
          color: "#fff",
          fontSize: 8.5,
          fontWeight: 900,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          pointerEvents: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      >
        {rarity.label}
      </span>
      {/* Card-style mini chip flotando sobre el borde */}
      <div style={{ padding: "0 12px 12px", marginTop: -16 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 11px",
            borderRadius: 10,
            background: cardBg,
            border: cardBorder,
            color: cardColor,
            // glow/boxShadow cosmético omitido en el chip mini para no recargar.
          }}
        >
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: accentHex, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 800 }}>{theme.label}</span>
        </div>
      </div>
      {locked && <LockBadge bundleKey={theme.bundleKey} bundleLabel={bundleLabel} />}
      {selected && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--primary)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={11} color="#fff" />
        </span>
      )}
    </button>
  );
}

function LockBadge({ bundleKey, bundleLabel }: { bundleKey: string; bundleLabel?: string }) {
  const isMpPlus = bundleKey === "mp_plus";
  const label = isMpPlus ? "MP+" : bundleLabel ?? bundleKey;
  return (
    <span
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        padding: "2px 6px",
        borderRadius: 6,
        background: isMpPlus ? "#fbbf24" : "#0a0a0a",
        color: isMpPlus ? "#0a0a0a" : "#fff",
        fontSize: 8.5,
        fontWeight: 900,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        pointerEvents: "none",
        maxWidth: "85%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </span>
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
            Los temas premium son MatchPoint+
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>
            Desbloquea los temas con la subscription. El tema Clásico es gratis.
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
  bodyPattern,
  bundleKey,
  cardCss,
}: {
  accentHex: string;
  bannerCss: string | null;
  bodyPattern: string | null;
  bundleKey: string | null;
  cardCss: ThemeCardCss | null;
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
        <span style={{ color: "#a3a3a3", textTransform: "none", letterSpacing: 0, fontSize: 10, fontWeight: 600 }}>
          1:1 con tu perfil real
        </span>
      </div>
      <div style={{ padding: 16, background: "#fafafa" }}>
        <ProfileHeaderCard
          name="Tu nombre"
          username="tu_user"
          city="Quito"
          bio="Esta es la bio que aparece en tu perfil. Elige un tema arriba para ver cómo lucirá."
          avatarUrl={null}
          primaryClub={{ name: "Tu club" }}
          memberSince={new Date().toISOString()}
          accentHex={accentHex}
          bannerCss={bannerCss}
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
            Cómo te ven en amigos, ranking y roster
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div style={{ width: 230 }}>
              <FriendCard f={previewFriend(accentHex, cardCss)} index={0} isSuggestion preview />
            </div>
            <StatsPreview accentHex={accentHex} cardCss={cardCss} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Friend mock para el preview: usa la FriendCard REAL (widget) con el accent +
// card-style del tema seleccionado.
function previewFriend(
  accentHex: string,
  cardCss: ThemeCardCss | null,
): FriendLite {
  return {
    id: "preview",
    name: "Tu nombre",
    username: null,
    city: "Manabí / Portoviejo",
    sport: "Pickleball",
    level: 4.2,
    isOfficial: false,
    isPremium: false,
    accentHex,
    cardStyleCss: cardCss,
  };
}

// Stat cards del preview: replican fielmente el StatCard real de ProfileScreenView
// (className "card" + "label-mp" + número "font-heading tabular" 36px tintado con
// el accent; el card-style del tema reemplaza bg/border/shadow del wrapper).
function StatsPreview({
  accentHex,
  cardCss,
}: {
  accentHex: string;
  cardCss: ThemeCardCss | null;
}) {
  const customBorder = cardCss?.border ?? (accentHex ? `1px solid ${accentHex}` : undefined);
  const stat = (label: string, value: string, sub: string) => (
    <div
      className="card"
      style={{
        flex: 1,
        minWidth: 130,
        padding: 20,
        background: cardCss?.background,
        border: customBorder,
        boxShadow: cardCss?.boxShadow,
        backdropFilter: cardCss?.backdropFilter,
        color: cardCss?.color,
      }}
    >
      <div className="label-mp" style={cardCss?.color ? { color: cardCss.color, opacity: 0.7 } : undefined}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
        <div
          className="font-heading tabular"
          style={{
            fontWeight: 900,
            fontSize: 36,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: accentHex ?? cardCss?.color,
          }}
        >
          {value}
        </div>
      </div>
      <div style={{ fontSize: 11, color: cardCss?.color ? `${cardCss.color}99` : "var(--muted-fg)", marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 250 }}>
      {stat("MP Rating", "4.20", "Oficial")}
      {stat("Win rate", "78%", "Singles")}
    </div>
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
          style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", margin: 0, textTransform: "uppercase" }}
        >
          Bundles disponibles<span style={{ color: "#fbbf24" }}>.</span>
        </h2>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Compra única · sin expiración</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "0 0 16px" }}>
        Cada bundle desbloquea su tema. Para adquirir uno, contacta a soporte vía WhatsApp o mensaje
        directo a MATCHPOINT — el equipo te confirma datos de transferencia y otorga el bundle al
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                  <span className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
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
