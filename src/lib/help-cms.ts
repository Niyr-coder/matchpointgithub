export const HELP_CATEGORIES = [
  { key: "reservas", label: "Reservas", icon: "calendar-days", sub: "Reservar, cancelar, no-shows" },
  { key: "pagos", label: "Pagos", icon: "wallet", sub: "Transferencias, reembolsos, comprobantes" },
  { key: "quedadas", label: "Quedadas", icon: "users-round", sub: "Crear, inscribirse, formatos" },
  { key: "torneos", label: "Torneos", icon: "trophy", sub: "Inscripción, brackets, ranking" },
  { key: "coaching", label: "Coaching", icon: "graduation-cap", sub: "Clases, paquetes, coaches" },
  { key: "cuenta", label: "Cuenta y privacidad", icon: "user-cog", sub: "Perfil, datos, seguridad" },
  { key: "mp-plus", label: "MATCHPOINT+", icon: "sparkles", sub: "Plan premium, beneficios y soporte" },
] as const;

export type HelpCategoryKey = (typeof HELP_CATEGORIES)[number]["key"];
export type HelpContentKind = "article" | "video" | "glossary";
export type HelpArticleStatus = "draft" | "published" | "archived";

export type HelpBlock =
  | { type: "h2"; id: string; text: string }
  | { type: "p"; text: string }
  | { type: "tip"; text: string }
  | { type: "warn"; text: string }
  | { type: "list"; items: string[] };

export type HelpArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  categoryKey: string;
  categoryLabel: string;
  icon: string | null;
  contentKind: HelpContentKind;
  tags: string[];
  readingMinutes: number;
  videoUrl: string | null;
  videoDurationLabel: string | null;
  glossaryTerm: string | null;
  isFeatured: boolean;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type HelpArticleDetail = HelpArticleSummary & {
  content: HelpBlock[];
  related: HelpArticleSummary[];
};

export type HelpHomeData = {
  categories: Array<(typeof HELP_CATEGORIES)[number] & { count: number }>;
  popular: HelpArticleSummary[];
  videos: HelpArticleSummary[];
  glossary: HelpArticleSummary[];
  featured: HelpArticleSummary | null;
};

export function getHelpCategory(key: string) {
  return HELP_CATEGORIES.find((category) => category.key === key) ?? HELP_CATEGORIES[0];
}

export function slugifyHelp(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function blocksToPlainText(blocks: HelpBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "list") return block.items.join("\n");
      return block.text;
    })
    .join("\n\n");
}

export function plainTextToBlocks(value: string): HelpBlock[] {
  const parts = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return [{ type: "p", text: "Escribe aquí el contenido de la guía." }];
  }

  return parts.map((part) => {
    if (part.startsWith("## ")) {
      const text = part.replace(/^##\s+/, "").trim();
      return { type: "h2", id: slugifyHelp(text) || "seccion", text };
    }
    if (part.startsWith("> ")) return { type: "tip", text: part.replace(/^>\s+/, "").trim() };
    if (part.startsWith("! ")) return { type: "warn", text: part.replace(/^!\s+/, "").trim() };
    if (part.includes("\n- ")) {
      return {
        type: "list",
        items: part
          .split(/\n/)
          .map((item) => item.replace(/^-\s+/, "").trim())
          .filter(Boolean),
      };
    }
    return { type: "p", text: part };
  });
}
