"use client";

// Admin · Ayuda y guías — rediseño 1:1 del kit (ui_kits/dashboard/AdminAyudaGuiasScreen.jsx).
// Stage 1: shell visual con data demo inline. CMS real (tabla help_articles,
// search_log, feedback, server actions, user-side fetch) queda para Stage 2 —
// ver `docs/guides/04-placeholders.md` "Centro de ayuda del jugador".
//
// Todas las acciones (crear, editar, archivar, exportar, publicar borrador,
// crear-desde-search-miss) disparan toast "Próximamente" porque no hay backend.
import { useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";

type ArticleStatus = "published" | "draft" | "review" | "archived";

type Article = {
  id: string;
  title: string;
  cat: string;
  st: ArticleStatus;
  views: number;
  helpful: number | null;
  updated: string;
  author: string;
};

const ARTICLES: Article[] = [
  { id: "A-1042", title: "Cómo cancelo una reserva sin costo", cat: "Reservas", st: "published", views: 4280, helpful: 92, updated: "hoy", author: "Equipo MP" },
  { id: "A-1041", title: "Cómo funcionan las quedadas americanas", cat: "Quedadas", st: "published", views: 3120, helpful: 88, updated: "ayer", author: "Andrés Vega" },
  { id: "A-1040", title: "Mi pago no se procesó · qué hacer", cat: "Pagos", st: "published", views: 2840, helpful: 76, updated: "3d", author: "Equipo MP" },
  { id: "A-1039", title: "Cómo subir de nivel en el ranking", cat: "Cuenta", st: "published", views: 2110, helpful: 84, updated: "5d", author: "Coach Joaquín" },
  { id: "A-1038", title: "Diferencia entre Match, Quedada y Torneo", cat: "General", st: "published", views: 1890, helpful: 95, updated: "7d", author: "Equipo MP" },
  { id: "A-1037", title: "Política de no-show y multas del club", cat: "Reservas", st: "published", views: 1640, helpful: 71, updated: "12d", author: "Legal MP" },
  { id: "A-1036", title: "Cómo usar Coach AI", cat: "MP+", st: "draft", views: 0, helpful: null, updated: "hoy", author: "Diego Maldonado" },
  { id: "A-1035", title: "Inscribirse a un torneo · paso a paso", cat: "Torneos", st: "published", views: 1420, helpful: 89, updated: "15d", author: "María José Lara" },
  { id: "A-1034", title: "Crear una quedada en 4 pasos", cat: "Quedadas", st: "review", views: 320, helpful: 80, updated: "ayer", author: "Andrés Vega" },
  { id: "A-1033", title: "Política de privacidad y datos personales", cat: "Cuenta", st: "archived", views: 540, helpful: 62, updated: "60d", author: "Legal MP" },
];

const CATEGORIES = ["Reservas", "Pagos", "Quedadas", "Torneos", "Coaching", "Cuenta", "MP+", "General"];

const SEARCH_MISSES = [
  { q: "matchpoint+ cancelar trial", count: 84 },
  { q: "dupr vs suma diferencia", count: 56 },
  { q: "factura srí electrónica", count: 42 },
  { q: "cambiar nombre del club", count: 28 },
  { q: "reembolso torneo cancelado", count: 24 },
];

const FEEDBACK = [
  { who: "Andrés Vega", when: "hoy", what: "Le faltó decir cómo cancelo si ya pagué", article: "Política de no-show y multas del club", helpful: false },
  { who: "Camila Aguilar", when: "ayer", what: "¡Muy claro! Me sirvió un montón", article: "Cómo funcionan las quedadas americanas", helpful: true },
  { who: "Diego Carrasco", when: "hace 2d", what: "El video no carga en Safari", article: "Tu primer match en 60 seg", helpful: false },
];

type Tab = "articulos" | "busquedas" | "feedback";

const STATUS_META: Record<ArticleStatus, { bg: string; fg: string; l: string }> = {
  published: { bg: "rgba(16,185,129,0.12)", fg: "#047857", l: "Publicado" },
  draft: { bg: "#fef3c7", fg: "#92400e", l: "Borrador" },
  review: { bg: "rgba(14,165,233,0.12)", fg: "#0369a1", l: "Revisión" },
  archived: { bg: "var(--muted)", fg: "var(--muted-fg)", l: "Archivado" },
};

const iconBtn: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: "1px solid var(--border)",
  background: "#fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--muted-fg)",
};

export function AdminAyudaGuiasScreen() {
  const toast = useToast();
  const soon = (label: string) =>
    toast({ icon: "clock", title: "Próximamente", sub: label });

  const [tab, setTab] = useState<Tab>("articulos");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ArticleStatus>("all");
  const [creating, setCreating] = useState(false);

  const term = search.trim().toLowerCase();
  const filtered = ARTICLES.filter((a) => {
    if (categoryFilter !== "all" && a.cat !== categoryFilter) return false;
    if (statusFilter !== "all" && a.st !== statusFilter) return false;
    if (term && !(a.title.toLowerCase().includes(term) || a.id.toLowerCase().includes(term))) {
      return false;
    }
    return true;
  });

  const totalViews = ARTICLES.reduce((s, a) => s + a.views, 0);
  const published = ARTICLES.filter((a) => a.st === "published").length;
  const helpfulRows = ARTICLES.filter((a) => a.helpful != null);
  const avgHelpful =
    helpfulRows.length > 0
      ? Math.round(helpfulRows.reduce((s, a) => s + (a.helpful ?? 0), 0) / helpfulRows.length)
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Admin · Sistema · CMS
          </div>
          <h1
            className="font-heading"
            style={{
              margin: "6px 0 0",
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              lineHeight: 0.95,
            }}
          >
            Ayuda y guías<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            {ARTICLES.length} artículos · {published} publicados ·{" "}
            {(totalViews / 1000).toFixed(1)}k vistas mes
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => soon("Editor de categorías")}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            <Icon name="folder-tree" size={13} /> Categorías
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} color="#fff" /> Crear artículo
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Kpi
          icon="file-text"
          label="Artículos publicados"
          value={String(published)}
          sub={`${ARTICLES.length} totales · ${ARTICLES.filter((a) => a.st === "draft").length} borradores`}
        />
        <Kpi
          icon="eye"
          label="Vistas este mes"
          value={`${(totalViews / 1000).toFixed(1)}k`}
          sub="+18% vs mes anterior"
          emerald
        />
        <Kpi
          icon="thumbs-up"
          label="Helpful promedio"
          value={`${avgHelpful}%`}
          sub="basado en 1.4k votos"
        />
        <Kpi
          icon="search-x"
          label="Búsquedas sin resultado"
          value="284"
          sub="Top 5 abajo · oportunidades"
          warn
        />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        {(
          [
            { k: "articulos", l: "Artículos", icon: "file-text" },
            { k: "busquedas", l: "Búsquedas sin resultado", icon: "search-x" },
            { k: "feedback", l: "Feedback", icon: "message-square" },
          ] as Array<{ k: Tab; l: string; icon: string }>
        ).map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                padding: "12px 18px",
                border: 0,
                borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent",
                background: "transparent",
                color: on ? "#0a0a0a" : "var(--muted-fg)",
                fontFamily: "inherit",
                fontWeight: on ? 900 : 600,
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: -1,
              }}
            >
              <Icon name={t.icon} size={13} /> {t.l}
            </button>
          );
        })}
      </div>

      {tab === "articulos" && (
        <>
          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: 9,
                  color: "var(--muted-fg)",
                  display: "inline-flex",
                }}
              >
                <Icon name="search" size={13} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar artículo o ID…"
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 32px",
                  border: "1px solid var(--border)",
                  borderRadius: 9999,
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  outline: "none",
                  background: "#fff",
                }}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 700,
                background: "#fff",
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="all">Todas las categorías</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div
              style={{
                display: "inline-flex",
                padding: 3,
                background: "var(--muted)",
                borderRadius: 9999,
                border: "1px solid var(--border)",
                gap: 2,
              }}
            >
              {(
                [
                  { k: "all", l: "Todos" },
                  { k: "published", l: "Publicados" },
                  { k: "draft", l: "Borradores" },
                  { k: "review", l: "En revisión" },
                  { k: "archived", l: "Archivados" },
                ] as Array<{ k: "all" | ArticleStatus; l: string }>
              ).map((s) => {
                const on = statusFilter === s.k;
                return (
                  <button
                    key={s.k}
                    onClick={() => setStatusFilter(s.k)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 9999,
                      border: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      background: on ? "#0a0a0a" : "transparent",
                      color: on ? "#fff" : "var(--muted-fg)",
                    }}
                  >
                    {s.l}
                  </button>
                );
              })}
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-fg)" }}>
              {filtered.length} de {ARTICLES.length}
            </span>
          </div>

          {/* Tabla */}
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2.2fr 110px 110px 90px 90px 100px 90px",
                gap: 12,
                padding: "10px 18px",
                background: "var(--muted)",
                borderBottom: "1px solid var(--border)",
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--muted-fg)",
              }}
            >
              <span>Artículo</span>
              <span>Categoría</span>
              <span>Estado</span>
              <span>Vistas</span>
              <span>Helpful</span>
              <span>Actualizado</span>
              <span style={{ textAlign: "right" }}>Acciones</span>
            </div>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: 36,
                  textAlign: "center",
                  color: "var(--muted-fg)",
                  fontSize: 13,
                }}
              >
                Sin artículos que coincidan con los filtros.
              </div>
            ) : (
              filtered.map((a, i, arr) => {
                const sp = STATUS_META[a.st];
                const helpfulColor =
                  a.helpful == null
                    ? "var(--muted-fg)"
                    : a.helpful >= 80
                      ? "#047857"
                      : a.helpful >= 65
                        ? "#92400e"
                        : "#dc2626";
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2.2fr 110px 110px 90px 90px 100px 90px",
                      gap: 12,
                      padding: "12px 18px",
                      alignItems: "center",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : 0,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.title}
                      </div>
                      <div
                        style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}
                      >
                        <span style={{ fontFamily: "ui-monospace, monospace" }}>
                          {a.id}
                        </span>{" "}
                        · {a.author}
                      </div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700 }}>{a.cat}</span>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 9999,
                        background: sp.bg,
                        color: sp.fg,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        justifySelf: "start",
                      }}
                    >
                      {sp.l}
                    </span>
                    <span className="tabular" style={{ fontSize: 12, fontWeight: 700 }}>
                      {a.views.toLocaleString()}
                    </span>
                    <span
                      className="tabular"
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: helpfulColor,
                      }}
                    >
                      {a.helpful == null ? "—" : `${a.helpful}%`}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                      {a.updated}
                    </span>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button
                        title="Editar"
                        onClick={() => soon(`Editar ${a.id}`)}
                        style={iconBtn}
                      >
                        <Icon name="pencil" size={12} />
                      </button>
                      <button
                        title="Ver"
                        onClick={() => soon(`Ver ${a.id}`)}
                        style={iconBtn}
                      >
                        <Icon name="eye" size={12} />
                      </button>
                      <button
                        title="Más"
                        onClick={() => soon(`Acciones ${a.id}`)}
                        style={iconBtn}
                      >
                        <Icon name="more-horizontal" size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {tab === "busquedas" && (
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Oportunidades
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Búsquedas sin resultado<span className="dot">.</span>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>
              Lo que los usuarios buscan pero no encuentran. Crea artículos para llenar el
              gap.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SEARCH_MISSES.map((s) => (
              <div
                key={s.q}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 9,
                  border: "1px solid var(--border)",
                  background: "#fff",
                }}
              >
                <Icon name="search-x" size={15} color="var(--muted-fg)" />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "#0a0a0a",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  &quot;{s.q}&quot;
                </span>
                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: 9999,
                    background: "var(--muted)",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "var(--muted-fg)",
                  }}
                >
                  {s.count} búsquedas
                </span>
                <button
                  onClick={() => {
                    soon(`Crear artículo para "${s.q}"`);
                    setCreating(true);
                  }}
                  className="btn btn-outline"
                  style={{ padding: "5px 11px", fontSize: 10.5 }}
                >
                  <Icon name="plus" size={11} /> Crear artículo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "feedback" && (
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Feedback
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Comentarios recientes<span className="dot">.</span>
            </h3>
          </div>
          {FEEDBACK.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 0",
                borderBottom: i < FEEDBACK.length - 1 ? "1px solid var(--border)" : 0,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: f.helpful ? "rgba(16,185,129,0.12)" : "#fef2f2",
                  color: f.helpful ? "#047857" : "#dc2626",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={f.helpful ? "thumbs-up" : "thumbs-down"} size={13} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {f.who}{" "}
                  <span style={{ color: "var(--muted-fg)", fontWeight: 500 }}>
                    · {f.when}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{f.what}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
                  En: <b style={{ color: "#0a0a0a" }}>{f.article}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer crear artículo */}
      {creating && (
        <CreateArticleDrawer
          onClose={() => setCreating(false)}
          onSaveDraft={() => {
            setCreating(false);
            soon("Guardar borrador (sin backend)");
          }}
          onPublish={() => {
            setCreating(false);
            soon("Publicar artículo (sin backend)");
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ────────────────────────────────────────────────────────────────────────

function Kpi({
  icon,
  label,
  value,
  sub,
  emerald,
  warn,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  emerald?: boolean;
  warn?: boolean;
}) {
  const c = emerald ? "#047857" : warn ? "#b45309" : "#0a0a0a";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: emerald
              ? "rgba(16,185,129,0.12)"
              : warn
                ? "#fef3c7"
                : "var(--muted)",
            color: c,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 26,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: c,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--muted-fg)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function CreateArticleDrawer({
  onClose,
  onSaveDraft,
  onPublish,
}: {
  onClose: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "100vw",
          background: "#fff",
          height: "100vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Nuevo
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Crear artículo<span className="dot">.</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div
          style={{
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            flex: 1,
          }}
        >
          <Field label="Título">
            <input style={fieldStyle} placeholder="Ej: Cómo se calcula tu Suma" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Categoría">
              <select style={fieldStyle}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Idioma">
              <select style={fieldStyle}>
                <option>Español (Ecuador)</option>
                <option>English (US)</option>
              </select>
            </Field>
          </div>
          <Field label="Resumen (1-2 líneas)">
            <textarea
              rows={2}
              style={{ ...fieldStyle, resize: "vertical", minHeight: 56 }}
              placeholder="Lo que el usuario va a aprender al leer el artículo."
            />
          </Field>
          <Field label="Contenido (markdown)">
            <textarea
              rows={10}
              style={{
                ...fieldStyle,
                resize: "vertical",
                minHeight: 200,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
              }}
              placeholder="# Título&#10;&#10;Tu artículo en markdown…"
            />
          </Field>
          <Field label="Tags">
            <input
              style={fieldStyle}
              placeholder="ej: reservas, cancelación, política"
            />
          </Field>
        </div>
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            background: "#fafafa",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
            onClick={onSaveDraft}
          >
            <Icon name="save" size={13} /> Guardar borrador
          </button>
          <button className="btn btn-primary" onClick={onPublish}>
            <Icon name="check" size={13} color="#fff" /> Publicar
          </button>
        </div>
      </div>
    </div>
  );
}
