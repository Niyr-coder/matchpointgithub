export type ReferralShareSurface = "home" | "giveaway";

export type ReferralShareContext =
  | { surface: "home" }
  | { surface: "giveaway"; giveawayTitle: string; clubName: string; prizeLabel?: string };

export type ReferralShareUiCopy = {
  /** Texto del botón que abre el sheet o dispara la acción */
  actionLabel: string;
  sheetEyebrow: string;
  sheetTitle: string;
  sheetHint: string;
  emailSubject: string;
  nativeShareTitle: string;
  whatsappButtonLabel: string;
};

const UI_COPY: Record<ReferralShareSurface, ReferralShareUiCopy> = {
  home: {
    actionLabel: "Invitar amigo",
    sheetEyebrow: "Invitar a MATCHPOINT",
    sheetTitle: "Invita a un amigo",
    sheetHint: "Envía este mensaje por WhatsApp o cópialo donde prefieras.",
    emailSubject: "Te invito a MATCHPOINT",
    nativeShareTitle: "Te invito a MATCHPOINT",
    whatsappButtonLabel: "Enviar por WhatsApp",
  },
  giveaway: {
    actionLabel: "Invitar amigos",
    sheetEyebrow: "Sumar entradas",
    sheetTitle: "Invita amigos al sorteo",
    sheetHint: "Cuando alguien se registre con tu link, sumas entradas en el sorteo.",
    emailSubject: "Únete a MATCHPOINT y ayúdame en un sorteo",
    nativeShareTitle: "Sorteo en MATCHPOINT",
    whatsappButtonLabel: "Enviar invitación",
  },
};

export function getReferralShareUiCopy(context?: ReferralShareContext): ReferralShareUiCopy {
  return UI_COPY[context?.surface ?? "home"];
}

export function buildReferralUrl(origin: string, username: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/?ref=${encodeURIComponent(username)}`;
}

/** Texto listo para WhatsApp u otras apps de mensajería. */
export function buildReferralShareMessage(opts: {
  url: string;
  referrerDisplayName?: string | null;
  context?: ReferralShareContext;
}): string {
  const { url, referrerDisplayName, context } = opts;
  const surface = context?.surface ?? "home";

  if (surface === "giveaway" && context?.surface === "giveaway") {
    const intro = referrerDisplayName
      ? `¡Hola! Soy ${referrerDisplayName}. Participo en un sorteo en MATCHPOINT y me ayudas si te registras con mi link 🎁`
      : `¡Hola! Participo en un sorteo en MATCHPOINT y me ayudas si te registras con mi link 🎁`;
    const detail = context.prizeLabel
      ? `Premio: ${context.prizeLabel} · ${context.clubName}`
      : `${context.giveawayTitle} · ${context.clubName}`;
    return `${intro}\n\n${detail}\n\nRegístrate gratis:\n${url}`;
  }

  const intro = referrerDisplayName
    ? `¡Hola! Soy ${referrerDisplayName}. Te invito a unirte a MATCHPOINT 🎾`
    : `¡Hola! Te invito a unirte a MATCHPOINT 🎾`;

  return `${intro}\n\nReserva canchas, encuentra rivales y participa en torneos desde tu celular.\n\nRegístrate gratis con mi link:\n${url}`;
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildEmailShareUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function copyShareText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareReferralNative(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<"shared" | "unsupported" | "cancelled"> {
  if (typeof navigator === "undefined" || !navigator.share) return "unsupported";
  try {
    await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "cancelled";
  }
}
