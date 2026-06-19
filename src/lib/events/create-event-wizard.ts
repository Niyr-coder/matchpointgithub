import type { TournamentCategoryDraft } from "@/lib/tournaments/event-level-categories";

/** Conteos mensuales por tipo — wizard Crear evento (club). */
export type CreateEventTypeCounts = {
  torneo: number;
  liga: number;
  social: number;
  clinic: number;
};

export type CreateEventDraftSnapshot = {
  type: "torneo" | "liga" | "social" | "clinic";
  sport: "pickleball" | "padel" | "tenis" | "futbol";
  name: string;
  start: string;
  end: string;
  clubId: string | null;
  venue: string;
  format: string;
  categoryLevels: string[];
  categories: TournamentCategoryDraft[];
  desc: string;
  slots: number;
  fee: number;
  paymentPolicy: "prepay" | "onsite" | "flexible";
  prize: number;
  prizeDetails: string[];
  prizeShares: number[];
  waitlist: boolean;
  pairTogether: boolean;
  membersOnly: boolean;
  visibility: "public" | "members" | "private";
  boost: boolean;
};

export type CreateEventWizardDraft = {
  v: 1;
  step: number;
  savedAt: string;
  form: CreateEventDraftSnapshot;
};

const DRAFT_STORAGE_PREFIX = "mp-crear-evento-draft";
const DRAFT_VERSION = 1 as const;

function draftStorageKey(clubId: string | null): string {
  return clubId ? `${DRAFT_STORAGE_PREFIX}:${clubId}` : DRAFT_STORAGE_PREFIX;
}

export function readCreateEventWizardDraft(clubId: string | null): CreateEventWizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftStorageKey(clubId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateEventWizardDraft;
    if (parsed?.v !== DRAFT_VERSION || typeof parsed.step !== "number" || !parsed.form) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCreateEventWizardDraft(
  clubId: string | null,
  step: number,
  form: CreateEventDraftSnapshot,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload: CreateEventWizardDraft = {
      v: DRAFT_VERSION,
      step,
      savedAt: new Date().toISOString(),
      form,
    };
    localStorage.setItem(draftStorageKey(clubId), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearCreateEventWizardDraft(clubId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(draftStorageKey(clubId));
  } catch {
    // ignore
  }
}

/** True si el usuario avanzó más allá del estado vacío inicial. */
export function createEventWizardDraftHasProgress(
  form: CreateEventDraftSnapshot,
  step: number,
): boolean {
  if (step > 0) return true;
  if (form.name.trim().length > 0) return true;
  if (form.desc.trim().length > 0) return true;
  if (form.fee > 0 || form.prize > 0) return true;
  if (form.type !== "torneo" || form.sport !== "pickleball") return true;
  if (form.slots !== 16 || form.waitlist !== true) return true;
  return false;
}
