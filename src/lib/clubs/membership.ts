// Membresías VIP por club — catálogo de plantillas de tarjeta + helpers.
//
// El club elige una plantilla por tier (templateKey) y opcionalmente un acento.
// Las plantillas siguen el estándar de temas: paleta autocontenida, contraste
// alto en el texto, SIN boxShadow (ver matchpoint-theme-create).

export type MembershipCardTemplate = {
  key: string;
  label: string;
  rarity: "base" | "rare" | "epic";
  /** Fondo de la tarjeta (gradiente o color). */
  bg: string;
  /** Color del texto principal sobre el fondo. */
  fg: string;
  /** Color de acento (member_no, badge). */
  accent: string;
  /** Color del subtexto (vence, club). */
  muted: string;
};

export const MEMBERSHIP_CARD_TEMPLATES: MembershipCardTemplate[] = [
  {
    key: "onyx",
    label: "Onyx",
    rarity: "base",
    bg: "linear-gradient(135deg, #0a0a0a 0%, #1c1c22 100%)",
    fg: "#ffffff",
    accent: "#34d399",
    muted: "rgba(255,255,255,0.62)",
  },
  {
    key: "court",
    label: "Cancha",
    rarity: "base",
    bg: "linear-gradient(135deg, #064e3b 0%, #047857 60%, #10b981 100%)",
    fg: "#ffffff",
    accent: "#fde68a",
    muted: "rgba(255,255,255,0.72)",
  },
  {
    key: "royal",
    label: "Royal",
    rarity: "rare",
    bg: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 60%, #6366f1 100%)",
    fg: "#ffffff",
    accent: "#c7d2fe",
    muted: "rgba(255,255,255,0.7)",
  },
  {
    key: "gold",
    label: "Oro",
    rarity: "epic",
    bg: "linear-gradient(135deg, #4a3508 0%, #92710f 55%, #d4af37 100%)",
    fg: "#1a1305",
    accent: "#1a1305",
    muted: "rgba(26,19,5,0.7)",
  },
  {
    key: "platinum",
    label: "Platino",
    rarity: "epic",
    bg: "linear-gradient(135deg, #2b2f36 0%, #6b7280 55%, #cbd5e1 100%)",
    fg: "#0a0a0a",
    accent: "#0a0a0a",
    muted: "rgba(10,10,10,0.62)",
  },
];

export const DEFAULT_MEMBERSHIP_TEMPLATE_KEY = "onyx";

export function membershipTemplate(key: string | null | undefined): MembershipCardTemplate {
  return (
    MEMBERSHIP_CARD_TEMPLATES.find((t) => t.key === key) ??
    MEMBERSHIP_CARD_TEMPLATES.find((t) => t.key === DEFAULT_MEMBERSHIP_TEMPLATE_KEY)!
  );
}

/** card_design jsonb guardado en el tier. */
export type MembershipCardDesign = { templateKey: string; accent?: string };

export function cardDesignOf(raw: unknown): MembershipCardDesign {
  const d = (raw ?? {}) as Partial<MembershipCardDesign>;
  return { templateKey: d.templateKey ?? DEFAULT_MEMBERSHIP_TEMPLATE_KEY, accent: d.accent };
}

/**
 * ¿La membresía está vigente? Mirror de isPlanActive: status='active' y, si hay
 * expires_at, que no haya pasado (el cron puede no haber corrido aún).
 */
export function isClubMembershipActive(m: {
  status: string;
  expires_at: string | null;
}): boolean {
  if (m.status !== "active") return false;
  if (!m.expires_at) return true;
  return new Date(m.expires_at) > new Date();
}
