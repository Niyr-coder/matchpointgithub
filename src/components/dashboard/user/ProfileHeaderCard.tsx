// Header visual del perfil de usuario. Componente PRESENTACIONAL compartido
// entre dos consumidores:
//  - ProfileScreenView (la card real en /dashboard/user/perfil y /players/[u]).
//  - PersonalizacionScreenClient (el preview en vivo del picker MP+).
//
// Toda la interactividad (camera button, edit avatar, action buttons como
// Editar/Compartir/Agregar amigo) llega vía slots (`coverButton`,
// `avatarEditButton`, `actions`). Mantener la lógica fuera permite que esta
// chrome sea idéntica byte-a-byte entre la card real y el preview, evitando
// drift cuando agreguemos features (estado fundamental para que MP+ vea el
// cambio antes de guardar y no se lleve sorpresas).
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/Icon";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function memberLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

const DEFAULT_BANNER = "linear-gradient(135deg, #064e3b 0%, #0a0a0a 50%, #000 100%)";
const DEFAULT_ACCENT = "#10b981";

export type ProfileHeaderCardProps = {
  name: string;
  username: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  primaryClub: { name: string } | null;
  memberSince: string;
  accentHex: string | null;
  bannerCss: string | null;
  // CSS overlay (doodle/pattern) que se aplica al body del header debajo
  // del banner. Lo define el bundle del banner activo (ver
  // bodyPatternForBundle en src/lib/profile/bundles.ts). null = sin overlay.
  bodyPattern: string | null;
  // Bundle key del banner activo. Cuando está seteado y matchea un bundle
  // pago (pack_neon/gold/sakura), agrega la clase CSS .mp-body-<bundleKey>
  // que activa la animación ambient definida en globals.css. null o
  // 'mp_plus' = sin animación.
  bundleKey?: string | null;
  // Slots: el caller los pasa cuando aplique (variant 'live' los usa,
  // 'preview' los deja null).
  coverButton?: ReactNode;
  avatarEditButton?: ReactNode;
  actions?: ReactNode;
};

export function ProfileHeaderCard({
  name,
  username,
  city,
  bio,
  avatarUrl,
  primaryClub,
  memberSince,
  accentHex,
  bannerCss,
  bodyPattern,
  bundleKey,
  coverButton,
  avatarEditButton,
  actions,
}: ProfileHeaderCardProps) {
  const animatedClass =
    bundleKey && bundleKey !== "mp_plus" ? `mp-body-${bundleKey}` : undefined;
  const accent = accentHex ?? DEFAULT_ACCENT;
  const banner = bannerCss ?? DEFAULT_BANNER;
  // Glow del accent solo si el user NO tiene banner custom (con banner el
  // preset ya define el mood y el glow ensuciaría la composición).
  const showGlow = !bannerCss;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          height: 140,
          background: banner,
          position: "relative",
          transition: "background 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {showGlow && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at 75% 30%, ${accent}4d, transparent 60%)`,
              transition: "background 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        )}
        {coverButton}
      </div>
      <div
        className={animatedClass}
        style={{
          padding: "0 28px 24px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          // Body pattern del bundle activo. Usamos `backgroundImage` (no el
          // shorthand `background`) específicamente para NO resetear
          // `background-position` — la animación del bundle activa anima
          // esa propiedad, y el shorthand la sobreescribiría en cada paint.
          backgroundImage: bodyPattern ?? undefined,
          backgroundBlendMode: bodyPattern ? "multiply" : undefined,
          transition: "background-image 240ms cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
          <div style={{ position: "relative", marginTop: -52 }}>
            <div
              style={{
                width: 112,
                height: 112,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981, #047857)",
                border: "5px solid #fff",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                overflow: "hidden",
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={name}
                  width={112}
                  height={112}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span className="font-heading" style={{ fontSize: 36, fontWeight: 900 }}>
                  {name
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase() || "?"}
                </span>
              )}
            </div>
            {avatarEditButton}
          </div>
          <div style={{ paddingBottom: 8, paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div
                className="font-heading"
                style={
                  {
                    fontWeight: 900,
                    fontSize: 32,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    textTransform: "uppercase",
                  } as CSSProperties
                }
              >
                {name}
                {/* Override del color del `.dot` global cuando hay accent custom.
                    Sin override, `.dot` sigue var(--primary) verde por default. */}
                <span
                  className="dot"
                  style={accentHex ? { color: accentHex, transition: "color 200ms" } : undefined}
                >
                  .
                </span>
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--muted-fg)",
                marginTop: 6,
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {city && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="map-pin" size={12} />
                  {city}
                </span>
              )}
              {primaryClub && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="building-2" size={12} />
                  {primaryClub.name}
                </span>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="calendar" size={12} />
                Miembro desde {memberLabel(memberSince)}
              </span>
            </div>
            <p
              style={{
                marginTop: 12,
                fontSize: 13.5,
                color: "#404040",
                maxWidth: 540,
                lineHeight: 1.5,
              }}
            >
              {bio ?? `@${username} aún no agregó una bio.`}
            </p>
          </div>
        </div>
        {actions && (
          <div style={{ display: "flex", gap: 8, paddingBottom: 8 }}>{actions}</div>
        )}
      </div>
    </div>
  );
}
