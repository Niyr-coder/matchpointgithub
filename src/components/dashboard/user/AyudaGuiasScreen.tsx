"use client";
// Pantalla "Ayuda y guías" del JUGADOR. Migrada del prototipo
// (ui_kits/dashboard/AyudaGuiasScreen.jsx): hero+search, categorías con
// drill-down, más leídos, videos, glosario y CTA a soporte.
//
// Contenido mock — todavía no hay CMS de artículos. Las hojas (artículos,
// videos, términos de glosario) muestran un toast honesto "Pronto"; el search
// filtra en vivo el contenido visible de la página (real), y el drill-down de
// categoría sí funciona. "Ir a Soporte" navega a Mensajes, donde vive el canal
// oficial de soporte al jugador.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

type Category = { k: string; icon: string; l: string; n: number; sub: string };

const CATEGORIES: Category[] = [
  { k: "reservas", icon: "calendar-days", l: "Reservas", n: 24, sub: "Reservar, cancelar, no-shows" },
  { k: "pagos", icon: "wallet", l: "Pagos", n: 18, sub: "Transferencias, reembolsos, comprobantes" },
  { k: "quedadas", icon: "users-round", l: "Quedadas", n: 22, sub: "Crear, inscribirse, formatos" },
  { k: "torneos", icon: "trophy", l: "Torneos", n: 16, sub: "Inscripción, brackets, ranking" },
  { k: "coaching", icon: "graduation-cap", l: "Coaching", n: 12, sub: "Clases, paquetes, coaches" },
  { k: "cuenta", icon: "user-cog", l: "Cuenta y privacidad", n: 14, sub: "Perfil, datos, seguridad" },
];

const POPULAR = [
  { t: "Cómo cancelo una reserva sin costo", cat: "Reservas", min: 2, icon: "calendar-x" },
  { t: "Cómo funcionan las quedadas americanas", cat: "Quedadas", min: 4, icon: "users-round" },
  { t: "Mi pago no se procesó · qué hacer", cat: "Pagos", min: 3, icon: "alert-triangle" },
  { t: "Cómo subir de nivel en el ranking", cat: "Cuenta", min: 5, icon: "trending-up" },
  { t: "Diferencia entre Match, Quedada y Torneo", cat: "General", min: 3, icon: "help-circle" },
  { t: "Política de no-show y multas del club", cat: "Reservas", min: 2, icon: "shield-alert" },
];

const VIDEOS = [
  { t: "Tu primer match en 60 seg", dur: "1:12", tag: "Onboarding" },
  { t: "Crear una quedada en 4 pasos", dur: "3:08", tag: "Quedadas" },
  { t: "Cómo se calcula tu Suma", dur: "2:24", tag: "Ranking" },
  { t: "Inscribirte a un torneo", dur: "1:45", tag: "Torneos" },
];

const GLOSSARY = [
  "Suma", "MPR", "Americano", "Round Robin", "Cocina", "Rey de cancha",
  "Doble bote", "Volea", "Tercer golpe", "Drop shot", "Lob", "Erne",
  "Bracket", "Bye", "Seed", "Tie-break",
];

const QUICK_SUGGESTIONS = ["Cancelar reserva", "No me llegó la factura", "Cómo subir mi Suma", "Crear quedada"];

const SUPPORT_HREF = "/dashboard/user/soporte";

const HERO_BG = "linear-gradient(135deg, #0a0a0a 0%, #064e3b 90%)";
const HERO_GLOW = "radial-gradient(circle at 88% 30%, rgba(16,185,129,0.22), transparent 55%)";

export function AyudaGuiasScreen() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtering = q.length > 0;

  const results = useMemo(() => {
    if (!filtering) return null;
    const cats = CATEGORIES.filter((c) => (c.l + " " + c.sub).toLowerCase().includes(q));
    const articles = POPULAR.filter((a) => (a.t + " " + a.cat).toLowerCase().includes(q));
    const terms = GLOSSARY.filter((g) => g.toLowerCase().includes(q));
    return { cats, articles, terms, total: cats.length + articles.length + terms.length };
  }, [filtering, q]);

  const soon = (what: string) => toast({ icon: "sparkles", title: what, sub: "Centro de artículos · próximamente" });

  if (activeCat) {
    return (
      <CategoryDetailView
        catKey={activeCat}
        onBack={() => setActiveCat(null)}
        onOpen={(k) => setActiveCat(k)}
        onSoon={soon}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* HERO con search */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: HERO_BG, color: "#fff", padding: "36px 32px 32px" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: HERO_GLOW, pointerEvents: "none" }} />
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 280,
            color: "rgba(255,255,255,0.05)",
            letterSpacing: "-0.06em",
            lineHeight: 0.78,
            transform: "translate(8%, -22%)",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          HELP
        </div>
        <div style={{ position: "relative", maxWidth: 620 }}>
          <div className="label-mp" style={{ color: "#34d399" }}>
            ● Ayuda y guías
          </div>
          <h1
            className="font-heading"
            style={{ margin: "8px 0 8px", fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}
          >
            ¿Qué necesitas
            <br />
            saber?<span style={{ color: "#34d399" }}>.</span>
          </h1>
          <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "rgba(255,255,255,0.75)", maxWidth: 480 }}>
            Busca en artículos, videos y guías. Tutoriales prácticos en español.
          </p>
          <form
            onSubmit={(e) => e.preventDefault()}
            style={{
              position: "relative",
              background: "#fff",
              borderRadius: 9999,
              padding: "6px 6px 6px 18px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            }}
          >
            <Icon name="search" size={16} color="var(--muted-fg)" style={{ flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej: cómo cancelo una reserva…"
              aria-label="Buscar en ayuda y guías"
              style={{ flex: 1, minWidth: 0, border: 0, outline: "none", fontFamily: "inherit", fontSize: 14, color: "#0a0a0a", background: "transparent", padding: "8px 0" }}
            />
            {filtering && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted-fg)", display: "inline-flex", padding: 4 }}
              >
                <Icon name="x" size={15} />
              </button>
            )}
            <button type="submit" className="btn btn-primary" style={{ padding: "9px 18px", whiteSpace: "nowrap" }}>
              Buscar <Icon name="arrow-right" size={12} color="#fff" />
            </button>
          </form>
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginRight: 4, alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Sugerencias:
            </span>
            {QUICK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                style={{ padding: "5px 11px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RESULTADOS de búsqueda (live filter) */}
      {filtering && results && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="font-heading" style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Resultados<span style={{ color: "var(--primary)" }}>.</span>
            </h2>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              {results.total} coincidencia{results.total === 1 ? "" : "s"} para “{query.trim()}”
            </span>
          </div>

          {results.total === 0 ? (
            <div style={{ padding: "18px 0", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)" }}>
                No encontramos nada con ese término. Prueba con otra palabra o escríbenos a soporte.
              </p>
              <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ marginTop: 14 }}>
                <Icon name="message-circle" size={13} color="#fff" /> Ir a Soporte
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {results.cats.length > 0 && (
                <div>
                  <div className="label-mp" style={{ color: "var(--muted-fg)", marginBottom: 8 }}>
                    Categorías
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {results.cats.map((c) => (
                      <button
                        key={c.k}
                        onClick={() => setActiveCat(c.k)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 9999, background: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, color: "#0a0a0a" }}
                      >
                        <Icon name={c.icon} size={13} color="#047857" /> {c.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {results.articles.length > 0 && (
                <div>
                  <div className="label-mp" style={{ color: "var(--muted-fg)", marginBottom: 8 }}>
                    Artículos
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {results.articles.map((a, i) => (
                      <button
                        key={a.t}
                        onClick={() => soon(a.t)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i === 0 ? 0 : "1px solid var(--border)", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
                      >
                        <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: "var(--muted)", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name={a.icon} size={14} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a" }}>{a.t}</div>
                          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                            {a.cat} · {a.min} min de lectura
                          </div>
                        </div>
                        <Icon name="arrow-up-right" size={14} color="var(--muted-fg)" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {results.terms.length > 0 && (
                <div>
                  <div className="label-mp" style={{ color: "var(--muted-fg)", marginBottom: 8 }}>
                    Glosario
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {results.terms.map((g) => (
                      <button
                        key={g}
                        onClick={() => soon(g)}
                        style={{ padding: "6px 12px", borderRadius: 9999, background: "#fff", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "#0a0a0a" }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CATEGORÍAS */}
      {!filtering && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Por categoría<span style={{ color: "var(--primary)" }}>.</span>
            </h2>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{CATEGORIES.reduce((s, c) => s + c.n, 0)} artículos en total</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.k}
                onClick={() => setActiveCat(c.k)}
                className="mp-help-cat"
                style={{ textAlign: "left", padding: 18, borderRadius: 14.4, background: "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 10 }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(16,185,129,0.12)", color: "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={c.icon} size={18} color="#047857" />
                </span>
                <div>
                  <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                    {c.l}
                    <span className="dot">.</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3 }}>{c.sub}</div>
                </div>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)" }}>{c.n} artículos</span>
                  <Icon name="arrow-right" size={13} color="#0a0a0a" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MÁS POPULARES + VIDEOS */}
      {!filtering && (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div className="label-mp" style={{ color: "var(--primary)" }}>
                  ● Tendencia
                </div>
                <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                  Más leídos<span className="dot">.</span>
                </h3>
              </div>
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>últimos 7 días</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {POPULAR.map((a, i) => (
                <button
                  key={a.t}
                  onClick={() => soon(a.t)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < POPULAR.length - 1 ? "1px solid var(--border)" : 0, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
                >
                  <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, background: "var(--muted)", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={a.icon} size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0a0a0a" }}>{a.t}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, display: "flex", gap: 8 }}>
                      <span>{a.cat}</span>
                      <span>·</span>
                      <span>{a.min} min de lectura</span>
                    </div>
                  </div>
                  <Icon name="arrow-up-right" size={14} color="var(--muted-fg)" />
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ marginBottom: 12 }}>
              <div className="label-mp" style={{ color: "var(--primary)" }}>
                ● Aprende viendo
              </div>
              <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Videos cortos<span className="dot">.</span>
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {VIDEOS.map((v) => (
                <button
                  key={v.t}
                  onClick={() => soon(v.t)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderRadius: 10, background: "var(--muted)", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                >
                  <div style={{ width: 60, height: 44, borderRadius: 8, background: "linear-gradient(135deg, #0a0a0a, #1f2937)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                    <Icon name="play" size={16} color="#fff" />
                    <span style={{ position: "absolute", bottom: 3, right: 4, fontSize: 8.5, fontWeight: 900, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "1px 4px", borderRadius: 4 }}>{v.dur}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0a0a0a" }}>{v.t}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{v.tag}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GLOSARIO */}
      {!filtering && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ marginBottom: 12 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Vocabulario
            </div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Glosario pickleball<span className="dot">.</span>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Los términos que vas a escuchar en la cancha.</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {GLOSSARY.map((g) => (
              <button
                key={g}
                onClick={() => soon(g)}
                style={{ padding: "6px 12px", borderRadius: 9999, background: "#fff", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "#0a0a0a" }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CTA Soporte */}
      <div
        className="card"
        style={{ padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: "linear-gradient(135deg, #fafafa, #fff)", borderColor: "#0a0a0a" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <span style={{ width: 44, height: 44, borderRadius: 11, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="life-buoy" size={20} color="#fff" />
          </span>
          <div>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
              ¿No encuentras la respuesta?<span className="dot">.</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 3 }}>Escríbenos directo. Respondemos en menos de 24h hábiles.</div>
          </div>
        </div>
        <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
          <Icon name="message-circle" size={13} color="#fff" /> Ir a Soporte
        </Link>
      </div>
    </div>
  );
}

// ── Detalle de categoría ──────────────────────────────────────────────
function CategoryDetailView({
  catKey,
  onBack,
  onOpen,
  onSoon,
}: {
  catKey: string;
  onBack: () => void;
  onOpen: (k: string) => void;
  onSoon: (what: string) => void;
}) {
  const cat = CATEGORIES.find((c) => c.k === catKey);
  if (!cat) return null;
  const data = CATEGORY_DATA[catKey] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted-fg)" }}>
        <button onClick={onBack} style={{ background: "transparent", border: 0, padding: 0, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="arrow-left" size={12} /> Ayuda y guías
        </button>
        <span>/</span>
        <span style={{ color: "#0a0a0a", fontWeight: 700 }}>{cat.l}</span>
      </div>

      {/* HERO de la categoría */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: HERO_BG, color: "#fff", padding: "32px 28px" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 30%, rgba(16,185,129,0.22), transparent 55%)" }} />
        <div
          aria-hidden
          style={{ position: "absolute", top: 0, right: 0, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 220, color: "rgba(255,255,255,0.05)", letterSpacing: "-0.06em", lineHeight: 0.78, transform: "translate(8%, -22%)", textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}
        >
          {cat.l}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ width: 64, height: 64, borderRadius: 14, background: "rgba(16,185,129,0.18)", color: "#34d399", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={cat.icon} size={28} color="#34d399" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="label-mp" style={{ color: "#34d399" }}>
              ● Categoría
            </div>
            <h1 className="font-heading" style={{ margin: "6px 0 6px", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
              {cat.l}
              <span style={{ color: "#34d399" }}>.</span>
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, color: "rgba(255,255,255,0.78)" }}>
              {cat.sub} · {cat.n} artículos
            </p>
          </div>
        </div>
      </div>

      {data ? (
        <>
          {data.featured && (
            <div className="card" style={{ padding: 24, display: "flex", gap: 18, alignItems: "center", borderColor: "#0a0a0a", flexWrap: "wrap" }}>
              <span style={{ width: 56, height: 56, borderRadius: 12, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={data.featured.icon} size={24} color="#fff" />
              </span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="label-mp" style={{ color: "var(--primary)" }}>
                  ● Destacado
                </div>
                <h3 className="font-heading" style={{ margin: "4px 0 4px", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                  {data.featured.title}
                  <span className="dot">.</span>
                </h3>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)" }}>
                  {data.featured.sub} · {data.featured.min} min de lectura
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => onSoon(data.featured!.title)} style={{ whiteSpace: "nowrap" }}>
                Leer ahora <Icon name="arrow-right" size={13} color="#fff" />
              </button>
            </div>
          )}

          {data.groups.map((g) => (
            <div key={g.h}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                  {g.h}
                  <span style={{ color: "var(--primary)" }}>.</span>
                </h2>
                <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{g.items.length} artículos</span>
              </div>
              <div className="card" style={{ overflow: "hidden" }}>
                {g.items.map((a, i) => (
                  <button
                    key={a.t}
                    onClick={() => onSoon(a.t)}
                    style={{ display: "grid", gridTemplateColumns: "32px 1fr auto auto", gap: 14, alignItems: "center", padding: "14px 18px", background: "transparent", border: 0, borderBottom: i < g.items.length - 1 ? "1px solid var(--border)" : 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--muted)", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={a.icon || "file-text"} size={13} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{a.t}</div>
                      {a.sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{a.sub}</div>}
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>{a.min} min</span>
                    <Icon name="arrow-up-right" size={14} color="var(--muted-fg)" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <span style={{ width: 48, height: 48, borderRadius: 12, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="pencil-ruler" size={22} color="#047857" />
          </span>
          <h3 className="font-heading" style={{ margin: "12px 0 4px", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Estamos escribiendo estas guías<span className="dot">.</span>
          </h3>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)" }}>
            Pronto vas a encontrar los artículos de {cat.l}. Mientras tanto, escríbenos y te ayudamos directo.
          </p>
          <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ marginTop: 16 }}>
            <Icon name="message-circle" size={13} color="#fff" /> Ir a Soporte
          </Link>
        </div>
      )}

      {/* Categorías relacionadas */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            También te puede servir<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {CATEGORIES.filter((c) => c.k !== catKey)
            .slice(0, 3)
            .map((c) => (
              <button
                key={c.k}
                onClick={() => onOpen(c.k)}
                style={{ textAlign: "left", padding: 14, border: "1px solid var(--border)", borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={c.icon} size={14} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{c.l}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{c.n} artículos</div>
                </div>
                <Icon name="arrow-right" size={12} color="var(--muted-fg)" />
              </button>
            ))}
        </div>
      </div>

      {/* CTA Soporte */}
      <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="life-buoy" size={18} color="#0a0a0a" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>¿No encuentras la respuesta? Escríbenos.</span>
        </div>
        <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
          <Icon name="message-circle" size={13} color="#fff" /> Ir a Soporte
        </Link>
      </div>
    </div>
  );
}

// Catálogo mock de artículos por categoría. Por ahora solo "torneos" viene
// completo (del prototipo); el resto cae al estado honesto "estamos
// escribiendo estas guías".
type CategoryArticle = { icon?: string; t: string; sub?: string; min: number };
type CategoryData = {
  featured?: { icon: string; title: string; sub: string; min: number };
  groups: { h: string; items: CategoryArticle[] }[];
};

const CATEGORY_DATA: Record<string, CategoryData> = {
  torneos: {
    featured: { icon: "trophy", title: "Inscribirse a un torneo · paso a paso", sub: "Desde la app, qué documentos pides, cómo confirmas tu pago.", min: 4 },
    groups: [
      {
        h: "Antes del torneo",
        items: [
          { icon: "user-plus", t: "Cómo me inscribo a un torneo abierto", sub: "Inscripción individual o por pareja", min: 3 },
          { icon: "wallet", t: "Cómo pago la inscripción · métodos válidos", sub: "Transferencia, DeUna, en club", min: 2 },
          { icon: "users-round", t: "Cambiar de pareja antes de que cierre", sub: "Política hasta 48h antes", min: 2 },
          { icon: "x-circle", t: "Cancelar inscripción · reembolso", sub: "Política según categoría y tiempo restante", min: 3 },
          { icon: "list-checks", t: "Documentos que necesitas tener al día", sub: "C.I., consentimiento, foto reciente", min: 2 },
        ],
      },
      {
        h: "Durante el torneo",
        items: [
          { icon: "git-branch", t: "Cómo se arman los brackets", sub: "Sembrado, byes, seeds", min: 4 },
          { icon: "clock", t: "Qué pasa si llego tarde a mi partido", sub: "Tolerancia 15 min · walkover", min: 2 },
          { icon: "flag", t: "Reportar incidente o reclamo", sub: "Línea directa con el organizador", min: 2 },
          { icon: "sun-medium", t: "Política de clima y suspensiones", sub: "Reagendamiento por lluvia o calor extremo", min: 3 },
        ],
      },
      {
        h: "Después del torneo",
        items: [
          { icon: "trophy", t: "Premios · cómo y cuándo se entregan", sub: "Trofeo presencial · premios en 7 días", min: 3 },
          { icon: "bar-chart-3", t: "Cómo el torneo impacta tu ranking", sub: "Puntos por categoría · multiplicadores", min: 4 },
          { icon: "history", t: "Ver mi historial de torneos", sub: "Resultados, certificados, fotos", min: 2 },
          { icon: "message-square", t: "Dejar feedback del torneo al organizador", sub: "Mejora futuros eventos", min: 2 },
        ],
      },
    ],
  },
};
