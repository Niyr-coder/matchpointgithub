type MatchPinSource = { id: string; result: "win" | "loss" };

export type ShowcasePins = {
  matchId: string | null;
  opponentName: string | null;
  badgeKind: string | null;
};

type BadgeLite = { kind: string; on: boolean };
type OpponentLite = { name: string };

function storageKey(userId: string) {
  return `mp_showcase_pins:${userId}`;
}

function dismissedOwnerKey(userId: string) {
  return `mp_showcase_dismissed:${userId}`;
}

function dismissedViewKey(profileUserId: string) {
  return `mp_showcase_dismissed_view:${profileUserId}`;
}

/** Showcase oculto por el dueño en su propio perfil. */
export function loadShowcaseDismissedOwner(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(dismissedOwnerKey(userId)) === "1";
}

export function saveShowcaseDismissedOwner(userId: string, dismissed: boolean) {
  if (typeof window === "undefined") return;
  const key = dismissedOwnerKey(userId);
  if (dismissed) localStorage.setItem(key, "1");
  else localStorage.removeItem(key);
}

/** Showcase oculto por un visitante al ver el perfil de otro (solo en ese navegador). */
export function loadShowcaseDismissedView(profileUserId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(dismissedViewKey(profileUserId)) === "1";
}

export function saveShowcaseDismissedView(profileUserId: string, dismissed: boolean) {
  if (typeof window === "undefined") return;
  const key = dismissedViewKey(profileUserId);
  if (dismissed) localStorage.setItem(key, "1");
  else localStorage.removeItem(key);
}

export function defaultShowcasePins(
  matches: MatchPinSource[],
  opponents: OpponentLite[],
  badges: BadgeLite[] | undefined,
): ShowcasePins {
  const match = matches.find((m) => m.result === "win") ?? matches[0];
  const badge = badges?.find((b) => b.on) ?? badges?.[0];
  return {
    matchId: match?.id ?? null,
    opponentName: opponents[0]?.name ?? null,
    badgeKind: badge?.kind ?? null,
  };
}

export function loadShowcasePins(userId: string): ShowcasePins | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShowcasePins;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      matchId: typeof parsed.matchId === "string" ? parsed.matchId : null,
      opponentName: typeof parsed.opponentName === "string" ? parsed.opponentName : null,
      badgeKind: typeof parsed.badgeKind === "string" ? parsed.badgeKind : null,
    };
  } catch {
    return null;
  }
}

export function saveShowcasePins(userId: string, pins: ShowcasePins) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify(pins));
}

export function sanitizeShowcasePins(
  pins: ShowcasePins | null,
  matches: MatchPinSource[],
  opponents: OpponentLite[],
  badges: BadgeLite[] | undefined,
): ShowcasePins {
  const fallback = defaultShowcasePins(matches, opponents, badges);
  if (!pins) return fallback;
  return {
    matchId: pins.matchId && matches.some((m) => m.id === pins.matchId) ? pins.matchId : fallback.matchId,
    opponentName:
      pins.opponentName && opponents.some((o) => o.name === pins.opponentName)
        ? pins.opponentName
        : fallback.opponentName,
    badgeKind:
      pins.badgeKind && badges?.some((b) => b.kind === pins.badgeKind) ? pins.badgeKind : fallback.badgeKind,
  };
}
