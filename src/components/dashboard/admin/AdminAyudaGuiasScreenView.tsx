"use client";

import { useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  archiveHelpArticle,
  createHelpArticleDraft,
  publishHelpArticle,
  updateHelpArticle,
  type AdminHelpArticle,
  type AdminHelpOverview,
} from "@/server/actions/admin/help";
import type { HelpContentKind } from "@/lib/help-cms";

type MutationResult = { ok: boolean; error?: { message: string } };

type HelpForm = {
  id: string | null;
  title: string;
  slug: string;
  categoryKey: string;
  contentKind: HelpContentKind;
  excerpt: string;
  bodyText: string;
  tags: string;
  readingMinutes: string;
  videoUrl: string;
  videoDurationLabel: string;
  glossaryTerm: string;
  icon: string;
  isFeatured: boolean;
  sortOrder: string;
};

const STATUS_META = {
  draft: { label: "Borrador", bg: "#eef2ff", color: "#3730a3" },
  published: { label: "Publicado", bg: "#ecfdf5", color: "#047857" },
  archived: { label: "Archivado", bg: "var(--muted)", color: "var(--muted-fg)" },
} as const;

function emptyForm(categoryKey = "reservas"): HelpForm {
  return {
    id: null,
    title: "",
    slug: "",
    categoryKey,
    contentKind: "article",
    excerpt: "",
    bodyText: "",
    tags: "",
    readingMinutes: "3",
    videoUrl: "",
    videoDurationLabel: "",
    glossaryTerm: "",
    icon: "",
    isFeatured: false,
    sortOrder: "0",
  };
}

function articleToForm(article: AdminHelpArticle): HelpForm {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    categoryKey: article.categoryKey,
    contentKind: article.contentKind,
    excerpt: article.excerpt ?? "",
    bodyText: article.bodyText,
    tags: article.tags.join(", "),
    readingMinutes: String(article.readingMinutes),
    videoUrl: article.videoUrl ?? "",
    videoDurationLabel: article.videoDurationLabel ?? "",
    glossaryTerm: article.glossaryTerm ?? "",
    icon: article.icon ?? "",
    isFeatured: article.isFeatured,
    sortOrder: String(article.sortOrder),
  };
}

function Pill({ status }: { status: AdminHelpArticle["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 999, background: meta.bg, color: meta.color, fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
      {meta.label}
    </span>
  );
}

export function AdminAyudaGuiasScreenView({ data }: { data: AdminHelpOverview }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<"all" | AdminHelpArticle["status"]>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState<HelpForm>(data.articles[0] ? articleToForm(data.articles[0]) : emptyForm(data.categories[0]?.key));

  useRealtimeRefresh(
    [
      { table: "help_articles" },
      { table: "help_feedback" },
      { table: "help_search_logs", event: "INSERT" },
    ],
    { debounceMs: 4000 },
  );

  const run = (fn: () => Promise<MutationResult>, okMessage: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast({ icon: "check", title: okMessage });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error?.message });
      }
    });
  };

  const filteredArticles = data.articles.filter((article) => {
    if (statusFilter !== "all" && article.status !== statusFilter) return false;
    if (categoryFilter !== "all" && article.categoryKey !== categoryFilter) return false;
    return true;
  });

  const save = () => {
    const payload = {
      title: form.title,
      slug: form.slug || undefined,
      categoryKey: form.categoryKey,
      contentKind: form.contentKind,
      excerpt: form.excerpt || null,
      bodyText: form.bodyText,
      tags: form.tags,
      readingMinutes: Number(form.readingMinutes),
      videoUrl: form.videoUrl || null,
      videoDurationLabel: form.videoDurationLabel || null,
      glossaryTerm: form.glossaryTerm || null,
      icon: form.icon || null,
      isFeatured: form.isFeatured,
      sortOrder: Number(form.sortOrder),
    };
    if (form.id) {
      run(() => updateHelpArticle({ articleId: form.id, patch: payload }), "Artículo actualizado");
    } else {
      run(() => createHelpArticleDraft(payload), "Borrador creado");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 className="font-heading" style={{ margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
            Ayuda y guías<span className="dot">.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            CMS real para artículos, videos y glosario. Las métricas salen de vistas, feedback y búsquedas registradas.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm(emptyForm(data.categories[0]?.key))}>
          <Icon name="plus" size={13} color="#fff" />Crear artículo
        </button>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, minWidth: 960 }}>
          <Kpi label="Artículos" value={String(data.totals.articles)} hint={`${data.totals.published} publicados`} icon="file-text" />
          <Kpi label="Borradores" value={String(data.totals.drafts)} hint="pendientes de publicar" icon="pencil" />
          <Kpi label="Archivados" value={String(data.totals.archived)} hint="fuera del centro" icon="archive" />
          <Kpi label="Vistas" value={data.totals.views.toLocaleString("en-US")} hint="conteo real" icon="eye" />
          <Kpi label="Feedback útil" value={String(data.totals.helpful)} hint={`${data.totals.notHelpful} no útil`} icon="thumbs-up" />
          <Kpi label="Búsquedas sin resultado" value={String(data.totals.searchMisses)} hint="desde logs reales" icon="search-x" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.9fr) minmax(320px, 1.1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Select value={statusFilter} onChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <option value="all">Todos los estados</option>
                <option value="draft">Borradores</option>
                <option value="published">Publicados</option>
                <option value="archived">Archivados</option>
              </Select>
              <Select value={categoryFilter} onChange={setCategoryFilter}>
                <option value="all">Todas las categorías</option>
                {data.categories.map((category) => (
                  <option key={category.key} value={category.key}>{category.label}</option>
                ))}
              </Select>
            </div>

            {filteredArticles.length === 0 ? (
              <EmptyState icon="book-open" title="Sin artículos" hint="Crea un borrador para empezar a poblar el centro de ayuda." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {filteredArticles.map((article, index) => {
                  const active = form.id === article.id;
                  return (
                    <button
                      key={article.id}
                      onClick={() => setForm(articleToForm(article))}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "32px 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "12px 0",
                        border: 0,
                        borderTop: index === 0 ? 0 : "1px solid var(--border)",
                        background: "transparent",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                        opacity: active ? 1 : 0.88,
                      }}
                    >
                      <span style={{ width: 30, height: 30, borderRadius: 8, background: active ? "#0a0a0a" : "var(--muted)", color: active ? "#fff" : "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name={article.icon ?? "file-text"} size={14} color={active ? "#fff" : "#0a0a0a"} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 900, color: "#0a0a0a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{article.title}</span>
                        <span style={{ display: "block", marginTop: 3, fontSize: 10.5, color: "var(--muted-fg)" }}>
                          {article.categoryLabel} · {article.readingMinutes} min · {article.viewCount} vistas
                        </span>
                      </span>
                      <Pill status={article.status} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <SignalsPanel data={data} />
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Editor</div>
              <h2 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                {form.id ? "Editar contenido" : "Nuevo borrador"}<span className="dot">.</span>
              </h2>
            </div>
            {form.id && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn" disabled={pending} onClick={() => run(() => publishHelpArticle({ articleId: form.id! }), "Artículo publicado")}>
                  <Icon name="send" size={13} />Publicar
                </button>
                <button className="btn" disabled={pending} onClick={() => run(() => archiveHelpArticle({ articleId: form.id! }), "Artículo archivado")}>
                  <Icon name="archive" size={13} />Archivar
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10 }}>
            <Field label="Título"><Input value={form.title} onChange={(value) => setForm({ ...form, title: value })} placeholder="Ej. Cómo cancelo una reserva" /></Field>
            <Field label="Slug"><Input value={form.slug} onChange={(value) => setForm({ ...form, slug: value })} placeholder="auto si está vacío" /></Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 140px", gap: 10, marginTop: 10 }}>
            <Field label="Categoría">
              <Select value={form.categoryKey} onChange={(value) => setForm({ ...form, categoryKey: value })}>
                {data.categories.map((category) => (
                  <option key={category.key} value={category.key}>{category.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={form.contentKind} onChange={(value) => setForm({ ...form, contentKind: value as HelpContentKind })}>
                <option value="article">Artículo</option>
                <option value="video">Video</option>
                <option value="glossary">Glosario</option>
              </Select>
            </Field>
            <Field label="Minutos"><Input value={form.readingMinutes} onChange={(value) => setForm({ ...form, readingMinutes: value })} /></Field>
          </div>

          <Field label="Resumen" style={{ marginTop: 10 }}>
            <Input value={form.excerpt} onChange={(value) => setForm({ ...form, excerpt: value })} placeholder="Texto corto para listados y búsqueda" />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 10, marginTop: 10 }}>
            <Field label="Tags"><Input value={form.tags} onChange={(value) => setForm({ ...form, tags: value })} placeholder="reservas, pago, no-show" /></Field>
            <Field label="Ícono"><Input value={form.icon} onChange={(value) => setForm({ ...form, icon: value })} placeholder="file-text" /></Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 1fr", gap: 10, marginTop: 10 }}>
            <Field label="URL de video"><Input value={form.videoUrl} onChange={(value) => setForm({ ...form, videoUrl: value })} placeholder="solo tipo video" /></Field>
            <Field label="Duración"><Input value={form.videoDurationLabel} onChange={(value) => setForm({ ...form, videoDurationLabel: value })} placeholder="1:20" /></Field>
            <Field label="Término glosario"><Input value={form.glossaryTerm} onChange={(value) => setForm({ ...form, glossaryTerm: value })} placeholder="solo glosario" /></Field>
          </div>

          <Field label="Contenido" style={{ marginTop: 10 }}>
            <textarea
              value={form.bodyText}
              onChange={(event) => setForm({ ...form, bodyText: event.target.value })}
              placeholder={"Usa párrafos separados por líneas vacías.\n## crea secciones para el índice.\n> crea una nota útil.\n! crea una advertencia."}
              style={{ width: "100%", minHeight: 260, border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
            />
          </Field>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })} />
              Destacar en el home
            </label>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 800 }}>Orden</span>
              <input value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} style={{ width: 70, border: "1px solid var(--border)", borderRadius: 999, padding: "7px 10px", fontFamily: "inherit" }} />
              <button className="btn btn-primary" disabled={pending || !form.title.trim()} onClick={save}>
                <Icon name="save" size={13} color="#fff" />Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return (
    <div className="card" style={{ padding: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={15} />
        </span>
        <div className="label-mp" style={{ color: "var(--muted-fg)" }}>{label}</div>
      </div>
      <div className="font-heading tabular" style={{ marginTop: 10, fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ marginTop: 3, fontSize: 11, color: "var(--muted-fg)" }}>{hint}</div>
    </div>
  );
}

function SignalsPanel({ data }: { data: AdminHelpOverview }) {
  return (
    <div className="card" style={{ padding: 14, display: "grid", gap: 16 }}>
      <div>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Feedback reciente</div>
        {data.feedback.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Todavía no hay votos de utilidad.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {data.feedback.slice(0, 5).map((item) => (
              <div key={item.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 12 }}>
                <b>{item.helpful ? "Útil" : "No útil"}</b> · {item.articleTitle}
                {item.comment && <div style={{ marginTop: 3, color: "var(--muted-fg)" }}>{item.comment}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Búsquedas sin resultado</div>
        {data.searchMisses.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>No hay misses registrados.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {data.searchMisses.map((miss) => (
              <span key={`${miss.categoryKey ?? "all"}-${miss.query}`} style={{ padding: "6px 9px", borderRadius: 999, background: "var(--muted)", fontSize: 11, fontWeight: 800 }}>
                {miss.query} · {miss.count}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 999, padding: "9px 12px", fontFamily: "inherit", fontSize: 12 }} />;
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "9px 12px", fontFamily: "inherit", fontSize: 12, background: "#fff" }}>
      {children}
    </select>
  );
}
