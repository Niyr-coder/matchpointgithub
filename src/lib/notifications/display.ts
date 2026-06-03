/** Formato de copy para el panel de notificaciones (client-safe). */

export type NotifDisplayInput = {
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
};

export type NotificationDisplay = {
  title: string;
  subtitle: string | null;
  detail: string | null;
  kindLabel: string | null;
  chips: string[];
};

function str(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kindLabelFor(kind: string): string | null {
  if (kind === "quedada_cancelled") return "Quedada";
  if (kind === "quedada_joined") return "Quedada";
  if (kind === "quedada_invite") return "Invitación";
  if (kind === "quedada_rescheduled") return "Cambio de fecha";
  if (kind === "quedada_payment_reminder") return "Pago";
  if (kind === "quedada_cohost_added") return "Co-host";
  if (kind.startsWith("friend_request")) return "Amistad";
  if (kind.startsWith("reservation")) return "Reserva";
  if (kind.startsWith("match_seek") || kind.startsWith("match_")) return "Partido";
  if (kind === "match_result_reported") return "Marcador";
  if (kind.startsWith("club_application")) return "Club";
  if (kind.startsWith("club_membership")) return "Membresía";
  if (kind === "club_announcement_new") return "Anuncio";
  if (kind === "club_membership_chat_welcome") return "Comunidad";
  if (kind === "giveaway_started" || kind === "giveaway_won" || kind === "giveaway_drawn") return "Sorteo";
  if (kind.startsWith("club_staff")) return "Staff";
  if (kind.startsWith("role_request") || kind.startsWith("role_")) return "Rol";
  if (kind.startsWith("ticket")) return "Soporte";
  if (kind.startsWith("team_")) return "Equipo";
  if (kind.startsWith("tournament") || kind.startsWith("registration")) return "Torneo";
  if (kind === "payout_paid") return "Pago";
  if (kind.startsWith("club_featuring")) return "Marketing";
  if (kind === "payment_captured" || kind === "payment_proof_rejected") return "Pago";
  if (kind === "refund_completed") return "Reembolso";
  if (kind === "mp_plus_activated" || kind === "mp_plus_revoked") return "MATCHPOINT+";
  if (kind === "broadcast") return "Aviso";
  return null;
}

/** Arma subtítulo, detalle y chips a partir de body + payload. */
export function formatNotificationDisplay(n: NotifDisplayInput): NotificationDisplay {
  const payload = n.payload ?? {};
  const quedadaTitle = str(payload, "quedada_title", "quedadaTitle", "title");
  const startsLabel =
    str(payload, "starts_label", "startsLabel") ??
    (typeof payload.starts_at === "string"
      ? formatWhen(payload.starts_at)
      : typeof payload.startsAt === "string"
        ? formatWhen(payload.startsAt)
        : null);
  const location = str(payload, "location_text", "locationText", "location");
  const amount = str(payload, "amount_label", "amountLabel");
  const actor = str(payload, "actor_name", "actorName", "fromUserName", "from_user_name", "joiner_name");
  const club = str(payload, "club_name", "clubName");
  const tournament = str(payload, "tournament_title", "tournamentTitle");

  const chips: string[] = [];
  if (startsLabel) chips.push(startsLabel);
  if (location) chips.push(location);
  if (amount) chips.push(amount);
  if (club && !location) chips.push(club);

  let subtitle = n.body?.trim() || null;
  let detail: string | null = null;

  if (n.kind.startsWith("quedada")) {
    if (!subtitle && quedadaTitle) {
      subtitle = quedadaTitle;
    } else if (subtitle && quedadaTitle && !subtitle.includes(quedadaTitle)) {
      subtitle = `${quedadaTitle} · ${subtitle}`;
    }
    if (n.kind === "quedada_cancelled" && quedadaTitle) {
      detail = `Ya no podrás jugar «${quedadaTitle}». Revisa otras quedadas disponibles.`;
    }
    if (n.kind === "quedada_payment_reminder" && quedadaTitle && amount) {
      detail = `Completa el pago de ${amount} para «${quedadaTitle}».`;
    }
    if (n.kind === "quedada_rescheduled" && startsLabel) {
      detail = `Nueva fecha: ${startsLabel}${location ? ` · ${location}` : ""}.`;
    }
  }

  if (n.kind.startsWith("friend_request")) {
    if (actor) {
      subtitle = actor;
      detail = n.kind.includes("accepted")
        ? `${actor} aceptó tu solicitud.`
        : `${actor} quiere conectar contigo.`;
    }
  }

  if (n.kind.startsWith("reservation") && !subtitle) {
    const sport = str(payload, "sport");
    if (sport && startsLabel) subtitle = `${sport} · ${startsLabel}`;
  }

  if (n.kind === "quedada_joined" && actor && quedadaTitle) {
    detail = `${actor} confirmó cupo en «${quedadaTitle}».`;
  }

  if (tournament && !subtitle) subtitle = tournament;

  if (!subtitle && quedadaTitle) subtitle = quedadaTitle;

  // Evita repetir en chips lo que ya está en subtitle.
  const subtitleLower = (subtitle ?? "").toLowerCase();
  const filteredChips = chips.filter((c) => !subtitleLower.includes(c.toLowerCase()));

  return {
    title: n.title,
    subtitle,
    detail,
    kindLabel: kindLabelFor(n.kind),
    chips: filteredChips,
  };
}
