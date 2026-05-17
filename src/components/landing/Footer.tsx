// Footer — migrado 1:1 desde MatchPoint Public.html (líneas 144-184)
import { Icon } from "@/components/Icon";

const COLS = [
  { t: "Jugadores", l: ["Crear cuenta", "Cómo funciona", "Encontrar clubes", "Eventos", "Ranking"] },
  { t: "Clubes", l: ["Registra tu club", "Precios", "Casos de éxito", "Soporte clubes"] },
  { t: "Coaches", l: ["Soy coach", "Cómo cobrar", "Material de marketing"] },
  { t: "MatchPoint", l: ["Acerca de", "Blog", "Trabaja con nosotros", "Términos", "Privacidad"] },
];

const SOCIAL = ["instagram", "message-circle", "youtube", "twitter"];

export function Footer() {
  return (
    <footer style={{ background: "#0a0a0a", color: "#fff", padding: "60px 0 40px", marginTop: 80 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
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
                <a
                  key={i}
                  href="#"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                  }}
                >
                  <Icon name={i} size={14} />
                </a>
              ))}
            </div>
          </div>
          {COLS.map((col) => (
            <div key={col.t}>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
                {col.t}
              </div>
              {col.l.map((l) => (
                <a
                  key={l}
                  href="#"
                  style={{
                    display: "block",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 12,
                    marginBottom: 8,
                    textDecoration: "none",
                  }}
                >
                  {l}
                </a>
              ))}
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
          <span>© 2026 MatchPoint Ecuador · matchpoint.app</span>
          <span>
            Hecho con <span style={{ color: "#dc2626" }}>♥</span> para la comunidad deportiva · Quito,
            Ecuador
          </span>
        </div>
      </div>
    </footer>
  );
}
