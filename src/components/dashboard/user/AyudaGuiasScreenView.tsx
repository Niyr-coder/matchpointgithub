"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  getHelpArticleBySlug,
  getHelpCategoryData,
  recordHelpArticleView,
  searchHelp,
  submitHelpFeedback,
} from "@/server/actions/help";
import type { HelpArticleDetail, HelpArticleSummary, HelpBlock, HelpHomeData } from "@/lib/help-cms";

const SUPPORT_HREF = "/dashboard/user/soporte";
const HERO_BG = "linear-gradient(135deg, #0a0a0a 0%, #064e3b 90%)";
const HERO_GLOW = "radial-gradient(circle at 88% 30%, rgba(16,185,129,0.22), transparent 55%)";
const QUICK_SUGGESTIONS = ["Cancelar reserva", "Comprobante de pago", "Cómo subir mi MPR", "Crear quedada"];

type ViewState =
  | { type: "home" }
  | { type: "category"; categoryKey: string; title: string; sub: string; icon: string; articles: HelpArticleSummary[] }
  | { type: "article"; article: HelpArticleDetail };

export function AyudaGuiasScreenView({ data }: { data: HelpHomeData }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HelpArticleSummary[] | null>(null);
  const [view, setView] = useState<ViewState>({ type: "home" });

  const totalArticles = data.categories.reduce((sum, category) => sum + category.count, 0);
  const filtering = searchResults !== null;

  const openArticle = (slug: string) => {
    startTransition(async () => {
      const article = await getHelpArticleBySlug(slug);
      if (!article) {
        toast({ icon: "alert-triangle", title: "Artículo no disponible", sub: "Puede estar archivado o en borrador." });
        return;
      }
      setSearchResults(null);
      setView({ type: "article", article });
    });
  };

  const openCategory = (categoryKey: string) => {
    startTransition(async () => {
      const result = await getHelpCategoryData(categoryKey);
      setSearchResults(null);
      setView({
        type: "category",
        categoryKey,
        title: result.category.label,
        sub: result.category.sub,
        icon: result.category.icon,
        articles: result.articles,
      });
    });
  };

  const runSearch = (value = query) => {
    const term = value.trim();
    if (term.length < 2) return;
    setQuery(term);
    startTransition(async () => {
      const res = await searchHelp({ query: term });
      if (res.ok) {
        setView({ type: "home" });
        setSearchResults(res.data.articles);
      } else {
        toast({ icon: "alert-triangle", title: "No pudimos buscar", sub: res.error.message });
      }
    });
  };

  if (view.type === "article") {
    return (
      <ArticleView
        article={view.article}
        onBack={() => setView({ type: "home" })}
        onOpenArticle={openArticle}
        onOpenCategory={openCategory}
      />
    );
  }

  if (view.type === "category") {
    return (
      <CategoryDetailView
        view={view}
        categories={data.categories}
        onBack={() => setView({ type: "home" })}
        onOpenArticle={openArticle}
        onOpenCategory={openCategory}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: HERO_BG, color: "#fff", padding: "36px 32px 32px" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: HERO_GLOW, pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", top: 0, right: 0, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 280, color: "rgba(255,255,255,0.05)", letterSpacing: "-0.06em", lineHeight: 0.78, transform: "translate(8%, -22%)", textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none" }}>
          HELP
        </div>
        <div style={{ position: "relative", maxWidth: 620 }}>
          <div className="label-mp" style={{ color: "#34d399" }}>● Ayuda y guías</div>
          <h1 className="font-heading" style={{ margin: "8px 0 8px", fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
            ¿Qué necesitas
            <br />
            saber?<span style={{ color: "#34d399" }}>.</span>
          </h1>
          <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "rgba(255,255,255,0.75)", maxWidth: 480 }}>
            Busca en artículos, videos y guías. Tutoriales prácticos en español.
          </p>
          <form onSubmit={(event) => { event.preventDefault(); runSearch(); }} style={{ position: "relative", background: "#fff", borderRadius: 9999, padding: "6px 6px 6px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }}>
            <Icon name="search" size={16} color="var(--muted-fg)" style={{ flexShrink: 0 }} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej: cómo cancelo una reserva..." aria-label="Buscar en ayuda y guías" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", fontFamily: "inherit", fontSize: 14, color: "#0a0a0a", background: "transparent", padding: "8px 0" }} />
            {filtering && (
              <button type="button" onClick={() => { setQuery(""); setSearchResults(null); }} aria-label="Limpiar búsqueda" style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted-fg)", display: "inline-flex", padding: 4 }}>
                <Icon name="x" size={15} />
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={pending} style={{ padding: "9px 18px", whiteSpace: "nowrap" }}>
              Buscar <Icon name="arrow-right" size={12} color="#fff" />
            </button>
          </form>
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginRight: 4, alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Sugerencias:</span>
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} onClick={() => runSearch(suggestion)} style={{ padding: "5px 11px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtering ? (
        <SearchResults query={query} articles={searchResults ?? []} onOpenArticle={openArticle} />
      ) : (
        <>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Por categoría<span style={{ color: "var(--primary)" }}>.</span>
              </h2>
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{totalArticles} artículos en total</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {data.categories.map((category) => (
                <button key={category.key} onClick={() => openCategory(category.key)} className="mp-help-cat" style={{ textAlign: "left", padding: 18, borderRadius: 14.4, background: "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(16,185,129,0.12)", color: "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={category.icon} size={18} color="#047857" />
                  </span>
                  <div>
                    <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                      {category.label}<span className="dot">.</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3 }}>{category.sub}</div>
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)" }}>{category.count} artículos</span>
                    <Icon name="arrow-right" size={13} color="#0a0a0a" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }}>
            <ArticleListCard title="Más leídos" eyebrow="● Tendencia" empty="Todavía no hay artículos publicados." articles={data.popular} onOpenArticle={openArticle} />
            <VideoCard videos={data.videos} onOpenArticle={openArticle} />
          </div>

          <GlossaryCard terms={data.glossary} onOpenArticle={openArticle} />
        </>
      )}

      <SupportCta />
    </div>
  );
}

function SearchResults({ query, articles, onOpenArticle }: { query: string; articles: HelpArticleSummary[]; onOpenArticle: (slug: string) => void }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 className="font-heading" style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
          Resultados<span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{articles.length} coincidencia{articles.length === 1 ? "" : "s"} para &quot;{query}&quot;</span>
      </div>
      {articles.length === 0 ? (
        <div style={{ padding: "18px 0", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)" }}>No encontramos nada con ese término. Prueba con otra palabra o escríbenos a soporte.</p>
          <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ marginTop: 14 }}>
            <Icon name="message-circle" size={13} color="#fff" /> Ir a Soporte
          </Link>
        </div>
      ) : (
        <ArticleRows articles={articles} onOpenArticle={onOpenArticle} />
      )}
    </div>
  );
}

function CategoryDetailView({
  view,
  categories,
  onBack,
  onOpenArticle,
  onOpenCategory,
}: {
  view: Extract<ViewState, { type: "category" }>;
  categories: HelpHomeData["categories"];
  onBack: () => void;
  onOpenArticle: (slug: string) => void;
  onOpenCategory: (key: string) => void;
}) {
  const featured = view.articles.find((article) => article.isFeatured) ?? view.articles[0] ?? null;
  const groups = useMemo(() => {
    const byKind = new Map<string, HelpArticleSummary[]>();
    for (const article of view.articles) {
      const key = article.contentKind === "video" ? "Videos" : article.contentKind === "glossary" ? "Glosario" : "Guías";
      byKind.set(key, [...(byKind.get(key) ?? []), article]);
    }
    return Array.from(byKind.entries());
  }, [view.articles]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted-fg)" }}>
        <button onClick={onBack} style={{ background: "transparent", border: 0, padding: 0, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="arrow-left" size={12} /> Ayuda y guías
        </button>
        <span>/</span>
        <span style={{ color: "#0a0a0a", fontWeight: 700 }}>{view.title}</span>
      </div>

      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: HERO_BG, color: "#fff", padding: "32px 28px" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 30%, rgba(16,185,129,0.22), transparent 55%)" }} />
        <div aria-hidden style={{ position: "absolute", top: 0, right: 0, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 220, color: "rgba(255,255,255,0.05)", letterSpacing: "-0.06em", lineHeight: 0.78, transform: "translate(8%, -22%)", textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {view.title}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ width: 64, height: 64, borderRadius: 14, background: "rgba(16,185,129,0.18)", color: "#34d399", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={view.icon} size={28} color="#34d399" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="label-mp" style={{ color: "#34d399" }}>● Categoría</div>
            <h1 className="font-heading" style={{ margin: "6px 0 6px", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
              {view.title}<span style={{ color: "#34d399" }}>.</span>
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, color: "rgba(255,255,255,0.78)" }}>{view.sub} · {view.articles.length} artículos</p>
          </div>
        </div>
      </div>

      {view.articles.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <span style={{ width: 48, height: 48, borderRadius: 12, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="pencil-ruler" size={22} color="#047857" />
          </span>
          <h3 className="font-heading" style={{ margin: "12px 0 4px", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Estamos escribiendo estas guías<span className="dot">.</span>
          </h3>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)" }}>Pronto vas a encontrar artículos de {view.title}. Mientras tanto, escríbenos y te ayudamos directo.</p>
          <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ marginTop: 16 }}>
            <Icon name="message-circle" size={13} color="#fff" /> Ir a Soporte
          </Link>
        </div>
      ) : (
        <>
          {featured && (
            <div className="card" style={{ padding: 24, display: "flex", gap: 18, alignItems: "center", borderColor: "#0a0a0a", flexWrap: "wrap" }}>
              <span style={{ width: 56, height: 56, borderRadius: 12, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={featured.icon ?? "file-text"} size={24} color="#fff" />
              </span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="label-mp" style={{ color: "var(--primary)" }}>● Destacado</div>
                <h3 className="font-heading" style={{ margin: "4px 0 4px", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                  {featured.title}<span className="dot">.</span>
                </h3>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)" }}>{featured.excerpt ?? featured.categoryLabel} · {featured.readingMinutes} min de lectura</p>
              </div>
              <button className="btn btn-primary" onClick={() => onOpenArticle(featured.slug)} style={{ whiteSpace: "nowrap" }}>
                Leer ahora <Icon name="arrow-right" size={13} color="#fff" />
              </button>
            </div>
          )}
          {groups.map(([title, articles]) => (
            <div key={title}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>{title}<span style={{ color: "var(--primary)" }}>.</span></h2>
                <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{articles.length} artículos</span>
              </div>
              <div className="card" style={{ overflow: "hidden", padding: "0 18px" }}>
                <ArticleRows articles={articles} onOpenArticle={onOpenArticle} />
              </div>
            </div>
          ))}
        </>
      )}

      <div>
        <h2 className="font-heading" style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
          También te puede servir<span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {categories.filter((category) => category.key !== view.categoryKey).slice(0, 3).map((category) => (
            <button key={category.key} onClick={() => onOpenCategory(category.key)} style={{ textAlign: "left", padding: 14, border: "1px solid var(--border)", borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={category.icon} size={14} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>{category.label}</span>
                <span style={{ display: "block", fontSize: 10.5, color: "var(--muted-fg)" }}>{category.count} artículos</span>
              </span>
              <Icon name="arrow-right" size={12} color="var(--muted-fg)" />
            </button>
          ))}
        </div>
      </div>
      <SupportCta compact />
    </div>
  );
}

function ArticleView({
  article,
  onBack,
  onOpenArticle,
  onOpenCategory,
}: {
  article: HelpArticleDetail;
  onBack: () => void;
  onOpenArticle: (slug: string) => void;
  onOpenCategory: (key: string) => void;
}) {
  const toast = useToast();
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const toc = article.content.filter((block): block is Extract<HelpBlock, { type: "h2" }> => block.type === "h2").map((block) => ({ id: block.id, text: block.text }));

  useEffect(() => {
    void recordHelpArticleView({ articleId: article.id });
  }, [article.id]);

  const sendFeedback = (helpful: boolean) => {
    setFeedback(helpful ? "up" : "down");
    submitHelpFeedback({ articleId: article.id, helpful }).then((res) => {
      if (!res.ok) toast({ icon: "alert-triangle", title: "No pudimos guardar tu feedback", sub: res.error.message });
    });
  };

  const shareUrl = () => {
    const url = `${window.location.origin}/dashboard/user/ayuda?articulo=${article.slug}`;
    navigator.clipboard?.writeText(url);
    toast({ icon: "link", title: "Link copiado", sub: "Comparte este artículo" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted-fg)", flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "transparent", border: 0, padding: 0, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="arrow-left" size={12} />Ayuda y guías
        </button>
        <span>/</span>
        <button onClick={() => onOpenCategory(article.categoryKey)} style={{ background: "transparent", border: 0, padding: 0, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit" }}>{article.categoryLabel}</button>
        <span>/</span>
        <span style={{ color: "#0a0a0a", fontWeight: 700, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{article.title}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: 48, alignItems: "start" }}>
        <article style={{ maxWidth: 720, minWidth: 0 }}>
          <header style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 28, marginBottom: 36, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => onOpenCategory(article.categoryKey)} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 9999, background: "var(--color-mp-primary-light)", color: "var(--color-mp-primary-active)", border: 0, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name={article.icon ?? "file-text"} size={11} />
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>{article.categoryLabel}</span>
              </button>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <Icon name="clock" size={11} />{article.readingMinutes} min de lectura
              </span>
            </div>
            <h1 className="font-heading" style={{ margin: 0, fontSize: "clamp(32px, 4.5vw, 48px)", fontWeight: 900, letterSpacing: "-0.035em", textTransform: "uppercase", lineHeight: 1.02 }}>
              {article.title}<span style={{ color: "var(--primary)" }}>.</span>
            </h1>
            {article.excerpt && <p style={{ margin: 0, fontSize: 17, color: "var(--muted-fg)", lineHeight: 1.5, maxWidth: 620, fontWeight: 500 }}>{article.excerpt}</p>}
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 14px", borderRadius: 12, background: "var(--muted)", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #047857)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 11, flexShrink: 0 }}>MP</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--fg)" }}>Equipo MATCHPOINT</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, marginTop: 1 }}>Soporte · Actualizado el {new Date(article.updatedAt).toLocaleDateString("es-EC")}</div>
                </div>
              </div>
              <button onClick={shareUrl} title="Copiar link" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9999, background: "#fff", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: "var(--fg)" }}>
                <Icon name="link" size={12} />Compartir
              </button>
            </div>
          </header>

          {article.videoUrl && (
            <a href={article.videoUrl} target="_blank" rel="noreferrer" className="card" style={{ marginBottom: 24, padding: 18, display: "flex", alignItems: "center", gap: 14, textDecoration: "none", color: "inherit" }}>
              <span style={{ width: 72, height: 50, borderRadius: 10, background: "linear-gradient(135deg, #0a0a0a, #1f2937)", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 }}>
                <Icon name="play" size={18} color="#fff" />
                {article.videoDurationLabel && <span style={{ position: "absolute", right: 5, bottom: 4, fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.65)", borderRadius: 4, padding: "1px 4px", fontWeight: 900 }}>{article.videoDurationLabel}</span>}
              </span>
              <span>
                <span className="font-heading" style={{ display: "block", fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>Ver video<span className="dot">.</span></span>
                <span style={{ display: "block", marginTop: 3, fontSize: 12, color: "var(--muted-fg)" }}>Se abre en una pestaña nueva.</span>
              </span>
            </a>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {article.content.length === 0 ? <p style={{ margin: 0, fontSize: 15, color: "var(--muted-fg)" }}>Este artículo todavía no tiene cuerpo publicado.</p> : article.content.map((block, index) => <ArticleBlock key={index} block={block} index={index} body={article.content} />)}
          </div>

          <div style={{ marginTop: 44, padding: "24px 26px", borderRadius: 14, background: "var(--muted)", display: "flex", flexDirection: "column", gap: 14, border: "1px solid var(--border)" }}>
            {!feedback ? (
              <>
                <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.015em", textTransform: "uppercase" }}>¿Te sirvió este artículo?<span className="dot">.</span></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => sendFeedback(true)} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}><Icon name="thumbs-up" size={13} />Sí, me ayudó</button>
                  <button onClick={() => sendFeedback(false)} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}><Icon name="thumbs-down" size={13} />No, sigo perdido</button>
                </div>
              </>
            ) : feedback === "up" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Icon name="check" size={14} color="var(--color-mp-primary-active)" /><span style={{ fontSize: 13, fontWeight: 700 }}>¡Gracias! Tu feedback nos ayuda a mejorar.</span></div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Icon name="message-circle" size={16} /><span style={{ fontSize: 13, fontWeight: 800 }}>Vamos a mejorarlo. ¿Quieres hablar con soporte?</span></div>
                <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ alignSelf: "flex-start" }}><Icon name="life-buoy" size={13} color="#fff" />Contactar soporte</Link>
              </>
            )}
          </div>

          {article.related.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● También te puede servir</div>
              <h3 className="font-heading" style={{ margin: "8px 0 16px", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>Sigue leyendo<span className="dot">.</span></h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 10 }}>
                {article.related.map((related) => <SmallArticleCard key={related.id} article={related} onOpenArticle={onOpenArticle} />)}
              </div>
            </div>
          )}
        </article>

        <aside style={{ position: "sticky", top: 80, alignSelf: "start", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="label-mp">En esta página</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {toc.length === 0 ? <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin secciones todavía</span> : toc.map((item) => {
              const active = activeSection === item.id;
              return (
                <button key={item.id} onClick={() => { setActiveSection(item.id); document.getElementById(`art-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{ position: "relative", background: "transparent", border: 0, padding: "7px 14px 7px 18px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: active ? 900 : 600, color: active ? "var(--fg)" : "var(--muted-fg)", textAlign: "left", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "var(--primary)" : "var(--border)", flexShrink: 0 }} />
                  <span style={{ flex: 1, lineHeight: 1.4 }}>{item.text}</span>
                </button>
              );
            })}
          </div>
          <button onClick={onBack} style={{ marginTop: 4, alignSelf: "flex-start", background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
            <Icon name="arrow-left" size={12} />Volver
          </button>
        </aside>
      </div>
    </div>
  );
}

function ArticleRows({ articles, onOpenArticle }: { articles: HelpArticleSummary[]; onOpenArticle: (slug: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {articles.map((article, index) => (
        <button key={article.id} onClick={() => onOpenArticle(article.slug)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", border: 0, borderBottom: index < articles.length - 1 ? "1px solid var(--border)" : 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}>
          <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, background: "var(--muted)", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={article.icon ?? (article.contentKind === "video" ? "play" : "file-text")} size={15} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#0a0a0a" }}>{article.title}</span>
            <span style={{ display: "flex", gap: 8, marginTop: 2, fontSize: 11, color: "var(--muted-fg)" }}>
              <span>{article.categoryLabel}</span><span>·</span><span>{article.readingMinutes} min de lectura</span>
            </span>
          </span>
          <Icon name="arrow-up-right" size={14} color="var(--muted-fg)" />
        </button>
      ))}
    </div>
  );
}

function ArticleListCard({ title, eyebrow, empty, articles, onOpenArticle }: { title: string; eyebrow: string; empty: string; articles: HelpArticleSummary[]; onOpenArticle: (slug: string) => void }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>{eyebrow}</div>
          <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>{title}<span className="dot">.</span></h3>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>últimos 7 días</span>
      </div>
      {articles.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: "var(--muted-fg)" }}>{empty}</p> : <ArticleRows articles={articles} onOpenArticle={onOpenArticle} />}
    </div>
  );
}

function VideoCard({ videos, onOpenArticle }: { videos: HelpArticleSummary[]; onOpenArticle: (slug: string) => void }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Aprende viendo</div>
        <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>Videos cortos<span className="dot">.</span></h3>
      </div>
      {videos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted-fg)" }}>Todavía no hay videos publicados.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {videos.map((video) => (
            <button key={video.id} onClick={() => onOpenArticle(video.slug)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderRadius: 10, background: "var(--muted)", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ width: 60, height: 44, borderRadius: 8, background: "linear-gradient(135deg, #0a0a0a, #1f2937)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                <Icon name="play" size={16} color="#fff" />
                {video.videoDurationLabel && <span style={{ position: "absolute", bottom: 3, right: 4, fontSize: 8.5, fontWeight: 900, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "1px 4px", borderRadius: 4 }}>{video.videoDurationLabel}</span>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: "#0a0a0a" }}>{video.title}</span>
                <span style={{ display: "block", fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{video.categoryLabel}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GlossaryCard({ terms, onOpenArticle }: { terms: HelpArticleSummary[]; onOpenArticle: (slug: string) => void }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Vocabulario</div>
        <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>Glosario pickleball<span className="dot">.</span></h3>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Los términos que vas a escuchar en la cancha.</p>
      </div>
      {terms.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted-fg)" }}>Todavía no hay términos publicados.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {terms.map((term) => (
            <button key={term.id} onClick={() => onOpenArticle(term.slug)} style={{ padding: "6px 12px", borderRadius: 9999, background: "#fff", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "#0a0a0a" }}>
              {term.glossaryTerm ?? term.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SmallArticleCard({ article, onOpenArticle }: { article: HelpArticleSummary; onOpenArticle: (slug: string) => void }) {
  return (
    <button onClick={() => onOpenArticle(article.slug)} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--color-mp-primary-light)", color: "var(--color-mp-primary-active)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={article.icon ?? "file-text"} size={13} />
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.35 }}>{article.title}</span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="clock" size={10} />{article.readingMinutes} min
        </span>
        <Icon name="arrow-right" size={13} color="var(--muted-fg)" />
      </span>
    </button>
  );
}

function ArticleBlock({ block, index, body }: { block: HelpBlock; index: number; body: HelpBlock[] }) {
  if (block.type === "h2") {
    const h2Index = body.slice(0, index + 1).filter((item) => item.type === "h2").length;
    return (
      <h2 id={`art-${block.id}`} className="font-heading" style={{ margin: "32px 0 0", fontSize: 26, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", scrollMarginTop: 90, lineHeight: 1.15, display: "flex", alignItems: "baseline", gap: 12 }}>
        <span className="tabular" style={{ fontSize: 13, fontWeight: 900, color: "var(--primary)", letterSpacing: "0.06em", flexShrink: 0 }}>0{h2Index}</span>
        <span>{block.text}<span style={{ color: "var(--primary)" }}>.</span></span>
      </h2>
    );
  }
  if (block.type === "p") {
    const firstParagraphIndex = body.findIndex((item) => item.type === "p");
    if (firstParagraphIndex === index && block.text.length > 0) {
      return <p style={{ margin: 0, fontSize: 16, color: "var(--fg)", lineHeight: 1.75 }}><span className="font-heading" style={{ float: "left", fontSize: 64, fontWeight: 900, lineHeight: 0.85, letterSpacing: "-0.04em", color: "var(--primary)", marginRight: 8, marginTop: 4 }}>{block.text.charAt(0)}</span>{block.text.slice(1)}</p>;
    }
    return <p style={{ margin: 0, fontSize: 16, color: "var(--fg)", lineHeight: 1.75 }}>{block.text}</p>;
  }
  if (block.type === "list") {
    return (
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
        {block.items.map((item) => (
          <li key={item} style={{ display: "flex", gap: 14, fontSize: 15.5, color: "var(--fg)", lineHeight: 1.65 }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--color-mp-primary-light)", color: "var(--color-mp-primary-active)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 3 }}>
              <Icon name="check" size={11} />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  const tone = block.type === "warn" ? { bg: "#fff7ed", color: "#9a3412", icon: "alert-triangle" } : { bg: "#ecfdf5", color: "#047857", icon: "lightbulb" };
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: tone.bg, color: tone.color, display: "flex", gap: 12, alignItems: "flex-start", border: "1px solid rgba(0,0,0,0.04)" }}>
      <Icon name={tone.icon} size={16} color={tone.color} style={{ marginTop: 2, flexShrink: 0 }} />
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, fontWeight: 650 }}>{block.text}</p>
    </div>
  );
}

function SupportCta({ compact = false }: { compact?: boolean }) {
  return (
    <div className="card" style={{ padding: compact ? 18 : 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: "linear-gradient(135deg, #fafafa, #fff)", borderColor: "#0a0a0a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <span style={{ width: compact ? 38 : 44, height: compact ? 38 : 44, borderRadius: 11, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="life-buoy" size={compact ? 17 : 20} color="#fff" />
        </span>
        <div>
          <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>¿No encuentras la respuesta?<span className="dot">.</span></div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 3 }}>Escríbenos directo. Respondemos en menos de 24h hábiles.</div>
        </div>
      </div>
      <Link href={SUPPORT_HREF} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
        <Icon name="message-circle" size={13} color="#fff" /> Ir a Soporte
      </Link>
    </div>
  );
}
