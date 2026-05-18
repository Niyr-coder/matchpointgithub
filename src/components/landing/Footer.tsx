// Footer del landing. Todos los links apuntan a rutas reales del app
// (o mailto: al dominio matchpoint.top). Los iconos sociales quedan
// disabled hasta que se confirmen URLs reales.
import Link from "next/link";
import { Icon } from "@/components/Icon";

type FooterLink = { label: string; href: string; external?: boolean };

const COLS: { t: string; l: FooterLink[] }[] = [
  {
    t: "Jugadores",
    l: [
      { label: "Cómo funciona", href: "/como-funciona" },
      { label: "Encontrar clubes", href: "/clubes" },
      { label: "Eventos", href: "/eventos" },
      { label: "Ranking", href: "/ranking" },
    ],
  },
  {
    t: "Clubes",
    l: [
      { label: "Registra tu club", href: "/soy-club" },
      { label: "Precios", href: "/clubes/precios" },
      { label: "Casos de éxito", href: "/clubes/casos" },
      {
        label: "Soporte clubes",
        href: "mailto:soporte-clubes@matchpoint.top?subject=Soporte%20MatchPoint",
        external: true,
      },
    ],
  },
  {
    t: "Coaches",
    l: [
      { label: "Soy coach", href: "/coaches" },
      { label: "Cómo cobrar", href: "/coaches/como-cobrar" },
      { label: "Material de marketing", href: "/coaches/material" },
    ],
  },
  {
    t: "Partners",
    l: [
      { label: "Publica tu torneo", href: "/soy-partner" },
      { label: "Ver torneos", href: "/eventos" },
    ],
  },
  {
    t: "MatchPoint",
    l: [
      { label: "Acerca de", href: "/acerca-de" },
      { label: "Blog", href: "/blog" },
      { label: "Trabaja con nosotros", href: "/trabaja-con-nosotros" },
      { label: "Términos", href: "/legal/terminos" },
      { label: "Privacidad", href: "/legal/privacidad" },
    ],
  },
];

const SOCIAL = ["instagram", "message-circle", "youtube", "twitter"] as const;

export function Footer() {
  return (
    <footer style={{ background: "#0a0a0a", color: "#fff", padding: "60px 0 40px", marginTop: 80 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
            gap: 40,
            marginBottom: 40,
          }}
        >
          <div>
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
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 18 }}>
              ● La comunidad #1 de Pickleball en Ecuador
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              {SOCIAL.map((i) => (
                <span
                  key={i}
                  aria-disabled="true"
                  title="Próximamente"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.35)",
                    cursor: "not-allowed",
                  }}
                >
                  <Icon name={i} size={14} color="rgba(255,255,255,0.35)" />
                </span>
              ))}
            </div>
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
            color: "rgba(255,255,255,0.4)",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <span>© 2026 MatchPoint Ecuador · matchpoint.top</span>
          <span>
            Hecho con <span style={{ color: "#dc2626" }}>♥</span> para la comunidad deportiva · Quito,
            Ecuador
          </span>
        </div>
      </div>
    </footer>
  );
}
