// Footer del landing. Reagrupado a 4 columnas por intención del visitante
// (Producto · Negocio · Empresa · Legal) — ver MAT-18 §1.3.
// Todos los links apuntan a rutas reales del app o `mailto:` al dominio
// matchpoint.top. Solo se muestran iconos sociales con URL confirmada.
import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

type FooterLink = { label: string; href: string; external?: boolean };

const COLS: { t: string; l: FooterLink[] }[] = [
  {
    t: "Producto",
    l: [
      { label: "Cómo funciona", href: "/como-funciona" },
      { label: "Clubes", href: "/clubes" },
      { label: "Eventos", href: "/eventos" },
      { label: "Ranking", href: "/ranking" },
      { label: "Precios", href: "/precios" },
    ],
  },
  {
    t: "Negocio",
    l: [
      { label: "Soy un club", href: "/soy-club" },
      { label: "Soy partner", href: "/soy-partner" },
      { label: "Soy coach", href: "/coaches" },
      { label: "Casos de éxito", href: "/clubes/casos" },
      { label: "Material para coaches", href: "/coaches/material" },
      {
        label: "Soporte clubes",
        href: "mailto:soporte-clubes@matchpoint.top?subject=Soporte%20MATCHPOINT",
        external: true,
      },
    ],
  },
  {
    t: "Empresa",
    l: [
      { label: "Acerca de", href: "/acerca-de" },
      { label: "Blog", href: "/blog" },
      { label: "Trabaja con nosotros", href: "/trabaja-con-nosotros" },
      {
        label: "Prensa",
        href: "mailto:prensa@matchpoint.top?subject=Prensa%20MATCHPOINT",
        external: true,
      },
      {
        label: "Contacto",
        href: "mailto:hola@matchpoint.top?subject=Contacto%20MATCHPOINT",
        external: true,
      },
    ],
  },
  {
    t: "Legal",
    l: [
      { label: "Términos", href: "/legal/terminos" },
      { label: "Privacidad", href: "/legal/privacidad" },
    ],
  },
];

// Glifo Instagram inlineado: lucide-react 1.x removió los iconos de marca
// (cuestiones de copyright), por lo que el `<Icon name="instagram">` venía
// sin renderizar. El path estándar de Instagram queda como SVG inline.
function InstagramGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

// Solo redes con URL real confirmada. Para añadir más (YouTube, TikTok,
// etc.), incluir un glifo SVG, aria-label descriptivo y rel adecuado.
const SOCIAL: { key: string; href: string; label: string; render: () => ReactNode }[] = [
  {
    key: "instagram",
    href: "https://www.instagram.com/matchpoint.top/",
    label: "Síguenos en Instagram",
    render: () => <InstagramGlyph size={18} />,
  },
];

export function Footer() {
  return (
    <footer className="pt-10 md:pt-15 pb-10 mt-20" style={{ background: "#0a0a0a", color: "#fff" }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-[2.4fr_1.1fr_1.1fr_1.1fr_0.9fr] gap-8 md:gap-10 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <span
                style={{ color: "var(--primary)", fontSize: 22, fontWeight: 900, lineHeight: 1 }}
              >
                ●
              </span>
              <span
                className="font-heading"
                style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}
              >
                MATCHPOINT
              </span>
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
                textTransform: "uppercase",
                maxWidth: 320,
              }}
            >
              Juega más.
              <br />
              Juega mejor<span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                color: "rgba(255,255,255,0.55)",
                marginTop: 18,
              }}
            >
              <Icon name="map-pin" size={13} color="rgba(255,255,255,0.55)" />
              <span>La comunidad #1 de Pickleball en Ecuador</span>
            </div>
            {SOCIAL.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                {SOCIAL.map((s) => (
                  <a
                    key={s.key}
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "rgba(255,255,255,0.85)",
                      transition: "background 160ms var(--ease-out), color 160ms var(--ease-out)",
                    }}
                  >
                    {s.render()}
                  </a>
                ))}
              </div>
            )}
          </div>
          {COLS.map((col) => (
            <div key={col.t}>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
                {col.t}
              </div>
              {col.l.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    className="footer-link"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="footer-link"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            paddingTop: 30,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <span>© 2026 MATCHPOINT Ecuador · matchpoint.top</span>
          <span>
            Hecho con <span style={{ color: "#dc2626" }}>♥</span> para la comunidad deportiva · Quito,
            Ecuador
          </span>
        </div>
      </div>
    </footer>
  );
}
