export type TrustBadgeKind = "official" | "verified" | "support-internal" | "matchpoint-plus";
export type PlanBadgeTier = "free" | "premium";

export type TrustBadgeMeta = {
  label: string;
  title: string;
  icon?: string;
  color: string;
  background: string;
  borderColor: string;
};

const TRUST_META: Record<TrustBadgeKind, TrustBadgeMeta> = {
  official: {
    label: "Oficial MATCHPOINT",
    title: "Oficial MATCHPOINT",
    icon: "check",
    color: "#fff",
    background: "var(--primary)",
    borderColor: "var(--primary)",
  },
  verified: {
    label: "Verificado",
    title: "Verificado por MATCHPOINT",
    icon: "badge-check",
    color: "#0c4a6e",
    background: "rgba(14,165,233,0.12)",
    borderColor: "rgba(14,165,233,0.28)",
  },
  "support-internal": {
    label: "Soporte",
    title: "Soporte interno",
    icon: "life-buoy",
    color: "#5b21b6",
    background: "rgba(124,58,237,0.12)",
    borderColor: "rgba(124,58,237,0.24)",
  },
  "matchpoint-plus": {
    label: "MATCHPOINT+",
    title: "MATCHPOINT+ activo",
    icon: "crown",
    color: "#047857",
    background: "#ecfdf5",
    borderColor: "rgba(16,185,129,0.28)",
  },
};

const FREE_PLAN_META: TrustBadgeMeta = {
  label: "Free",
  title: "Plan Free",
  color: "var(--muted-fg)",
  background: "var(--muted)",
  borderColor: "var(--border)",
};

export function trustBadgeMeta(kind: TrustBadgeKind): TrustBadgeMeta {
  return TRUST_META[kind];
}

export function planBadgeMeta(tier: PlanBadgeTier, options?: { compact?: boolean }): TrustBadgeMeta {
  if (tier === "premium") {
    const meta = TRUST_META["matchpoint-plus"];
    return {
      ...meta,
      label: options?.compact ? "MP+" : meta.label,
    };
  }
  return FREE_PLAN_META;
}
