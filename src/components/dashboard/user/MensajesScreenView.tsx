// Client view de MensajesScreen — UI del mock original, data real.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { loadConversationThread, startConversation, type ThreadMessage } from "@/server/actions/messaging";
import { cancelMatch, rescheduleMatch, reportNoShow, reportScore, confirmScore, disputeScore } from "@/server/actions/matches";
import { searchPlayers, type PlayerSearchResult } from "@/server/actions/friends";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { fetchConversationListClient } from "@/lib/messaging/inbox-client";
import {
  fetchConversationMessagesClient,
  markConversationReadClient,
  sendMessageClient,
} from "@/lib/messaging/thread-client";
import type { ConvoLite, ConvoMatchSummary } from "@/lib/messaging/convo-lite";

export type { ConvoLite, ConvoMatchSummary } from "@/lib/messaging/convo-lite";

export type ActiveMatch = {
  matchId: string;
  status: string;
  playedAt: string;
  sport: string;
  mode: string;
  durationMin: number;
  clubId: string | null;
  clubName: string | null;
  courtId: string | null;
  courtName: string | null;
  plannedBestOf: number | null;
  reservationId: string | null;
  reservationStartsAt: string | null;
  reservationEndsAt: string | null;
  reservationStatus: string | null;
  reliabilityEnabled: boolean;
  matchTimePassed: boolean;
  others: { id: string; name: string }[];
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  acceptedBy: string[];
  pendingAcceptance: boolean;
  reportedBy: string | null;
  confirmedBy: string[];
  scoreSets: { a: number; b: number }[] | null;
  scoreWinner: "a" | "b" | null;
};

export type MessageSendStatus = "sending" | "sent" | "failed";

export type MessageLite = {
  id: string;
  senderId: string;
  body: string;
  kind: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
  sendStatus?: MessageSendStatus;
  /** Id local hasta confirmar insert (estilo WhatsApp). */
  clientNonce?: string;
};

function isPendingMessage(m: MessageLite): boolean {
  return m.sendStatus === "sending" || m.sendStatus === "failed" || m.id.startsWith("pending-");
}

function mergeThreadWithPending(server: MessageLite[], local: MessageLite[]): MessageLite[] {
  const pending = local.filter(isPendingMessage);
  if (pending.length === 0) return server;
  const merged = [...server];
  for (const p of pending) {
    const confirmed = server.some(
      (m) =>
        !isPendingMessage(m) &&
        m.senderId === p.senderId &&
        m.body === p.body &&
        Math.abs(new Date(m.createdAt).getTime() - new Date(p.createdAt).getTime()) < 120_000,
    );
    if (!confirmed) merged.push(p);
  }
  merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return merged;
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#374151,#6b7280)",
];

type ConversationFilter = "all" | "unread" | "matches" | "groups" | "official";

type ConvoStatus = {
  kind: "proposing" | "scheduled" | "check_in" | "played" | "cancelled" | "open";
  label: string;
  when?: string;
};

const FILTERS: { key: ConversationFilter; label: string; icon: string }[] = [
  { key: "all", label: "Todos", icon: "inbox" },
  { key: "unread", label: "No leídos", icon: "circle-dot" },
  { key: "matches", label: "Partidos", icon: "swords" },
  { key: "groups", label: "Grupos", icon: "users" },
  { key: "official", label: "Oficial", icon: "badge-check" },
];

function conversationTypeLabel(c: ConvoLite): string {
  if (c.isOfficial) return "Canal oficial informativo";
  if (c.kind === "match") return "Chat del partido";
  if (c.kind === "quedada") return `Quedada · ${c.memberCount} jugadores`;
  if (c.kind === "team_channel") return `${c.memberCount} jugadores · Equipo`;
  if (c.isGroup) return `${c.memberCount} jugadores`;
  if (c.isSystem) return "Canal del sistema";
  return "Mensaje directo";
}

function statusForMatchContext(ctx: {
  status: string;
  playedAt: string;
  pendingAcceptance?: boolean;
}): ConvoStatus {
  if (ctx.pendingAcceptance && ctx.status === "scheduled") {
    return { kind: "proposing", label: "Esperando aceptación del reto", when: formatShortDate(ctx.playedAt) };
  }
  if (ctx.status === "cancelled") {
    return { kind: "cancelled", label: "Partido cancelado", when: formatShortDate(ctx.playedAt) };
  }
  if (ctx.status === "confirmed") {
    return { kind: "played", label: "Resultado confirmado", when: formatShortDate(ctx.playedAt) };
  }
  if (ctx.status === "reported" || ctx.status === "disputed") {
    return {
      kind: "proposing",
      label: ctx.status === "disputed" ? "Resultado en disputa" : "Resultado reportado",
      when: formatShortDate(ctx.playedAt),
    };
  }
  return { kind: "scheduled", label: "Partido agendado", when: formatShortDate(ctx.playedAt) };
}

function isMatchConversationClosed(c: ConvoLite | null, match: ActiveMatch | null): boolean {
  if (!c || c.kind !== "match") return false;
  if (match?.status === "cancelled") return true;
  if (c.matchSummary?.status === "cancelled") return true;
  return false;
}

function isQuedadaConversationClosed(c: ConvoLite | null): boolean {
  if (!c || c.kind !== "quedada") return false;
  const st = c.quedadaSummary?.status;
  return st === "finished" || st === "cancelled";
}

function isThreadReadOnly(c: ConvoLite | null, match: ActiveMatch | null): boolean {
  return isMatchConversationClosed(c, match) || isQuedadaConversationClosed(c);
}

function statusForConversation(c: ConvoLite): ConvoStatus | null {
  if (c.kind === "match") {
    if (c.matchSummary) return statusForMatchContext(c.matchSummary);
    return { kind: "scheduled", label: "Partido agendado" };
  }
  if (c.kind === "quedada") {
    const st = c.quedadaSummary?.status;
    if (st === "finished") return { kind: "played", label: "Quedada finalizada" };
    if (st === "cancelled") return { kind: "cancelled", label: "Quedada cancelada" };
    if (st === "live") return { kind: "open", label: "Quedada en curso" };
    return { kind: "open", label: "Coordinación del grupo" };
  }
  if (c.isOfficial) return { kind: "open", label: "Canal oficial" };
  if (c.kind === "team_channel" || c.isGroup) return { kind: "open", label: "Coordinación abierta" };
  return null;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-EC", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatMatchListWhen(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function matchConvoTitle(convo: ConvoLite): string {
  const m = convo.matchSummary;
  if (!m?.opponentName) return "Duelo";
  return `vs. ${m.opponentName}`;
}

/** Una línea para la lista: fecha + club (sin cancha/modo para ahorrar altura). */
function matchConvoShortMeta(convo: ConvoLite): string {
  const m = convo.matchSummary;
  if (!m) return "Partido";
  const when = formatMatchListWhen(m.playedAt);
  return m.clubName ? `${when} · ${m.clubName}` : when;
}

function matchListStatusLabel(status: ConvoStatus): string {
  switch (status.kind) {
    case "scheduled":
      return "Agendado";
    case "cancelled":
      return "Cancelado";
    case "played":
      return "Confirmado";
    case "proposing":
      return status.label.includes("disputa") ? "En disputa" : "Reportado";
    case "check_in":
      return "Check-in";
    default:
      return status.label;
  }
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "2-digit", month: "short" }).format(d);
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function pickString(payload: Record<string, unknown> | null | undefined, keys: string[], fallback = "—"): string {
  if (!payload) return fallback;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function MatchpointOfficialAvatar({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: "#0a0a0a",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/matchpoint-icon.svg"
        alt=""
        width={size}
        height={size}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </span>
  );
}

function OfficialVerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <span
      title="Cuenta oficial verificada"
      aria-label="Cuenta oficial verificada"
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name="badge-check" size={size} color="var(--primary)" strokeWidth={2} />
    </span>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const now = Date.now();
  const t = +new Date(iso);
  const diffMin = Math.floor((now - t) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function timeOnly(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function threadToLite(m: ThreadMessage, sendStatus?: MessageSendStatus): MessageLite {
  return {
    id: m.id,
    senderId: m.senderId,
    body: m.body,
    kind: m.kind,
    payload: m.payload,
    createdAt: m.createdAt,
    sendStatus,
  };
}

function messageFromRow(row: Record<string, unknown>): MessageLite {
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    body: (row.body as string | null) ?? "",
    kind: (row.kind as string) ?? "text",
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
  };
}

type ThreadCacheEntry = {
  messages: MessageLite[];
  activeMatch: ActiveMatch | null;
};

function syncConvInUrl(convId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (convId) url.searchParams.set("conv", convId);
  else url.searchParams.delete("conv");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

function patchConvoPreview(
  convos: ConvoLite[],
  convId: string,
  patch: Partial<Pick<ConvoLite, "lastBody" | "lastSenderId" | "lastAt" | "unreadCount">>,
): ConvoLite[] {
  return convos.map((c) => (c.id === convId ? { ...c, ...patch } : c));
}

function sortConvosByRecent(convos: ConvoLite[]): ConvoLite[] {
  return [...convos].sort((a, b) => {
    const ta = a.lastAt ? +new Date(a.lastAt) : 0;
    const tb = b.lastAt ? +new Date(b.lastAt) : 0;
    return tb - ta;
  });
}

function previewMessagesFromConvo(convo: ConvoLite, meUserId: string | null): MessageLite[] {
  if (!convo.lastBody?.trim()) return [];
  return [
    {
      id: `preview-${convo.id}`,
      senderId: convo.lastSenderId ?? meUserId ?? "",
      body: convo.lastBody,
      kind: "text",
      createdAt: convo.lastAt ?? new Date().toISOString(),
    },
  ];
}

export function MensajesScreenView({
  convos: initialConvos,
  meUserId,
  initialConvId,
  loadInboxOnClient = false,
}: {
  convos: ConvoLite[];
  meUserId: string | null;
  initialConvId: string | null;
  /** Inbox vía Supabase browser (evita bloquear la página en el server). */
  loadInboxOnClient?: boolean;
}) {
  const [convos, setConvos] = useState(initialConvos);
  const [inboxLoading, setInboxLoading] = useState(loadInboxOnClient);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConvId);
  const [messages, setMessages] = useState<MessageLite[]>([]);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const [threadLoading, setThreadLoading] = useState(!!initialConvId);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [openMenuConvId, setOpenMenuConvId] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;
  const convosRef = useRef(convos);
  convosRef.current = convos;
  const lastMarkedRef = useRef<string | null>(null);
  const threadCacheRef = useRef<Map<string, ThreadCacheEntry>>(new Map());
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const filterScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      el.scrollLeft += delta;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const writeThreadCache = (convId: string, patch: Partial<ThreadCacheEntry>) => {
    const prev = threadCacheRef.current.get(convId) ?? { messages: [], activeMatch: null };
    threadCacheRef.current.set(convId, { ...prev, ...patch });
  };

  const prefetchThread = (convId: string) => {
    const cached = threadCacheRef.current.get(convId);
    if (cached && cached.messages.length > 0) return;
    void fetchConversationMessagesClient(convId).then((res) => {
      if (!res.ok) return;
      writeThreadCache(convId, { messages: res.messages.map((m) => threadToLite(m)) });
    });
  };

  const activeConv = useMemo(
    () => convos.find((c) => c.id === activeConvId) ?? null,
    [convos, activeConvId],
  );
  const activeOfficial = activeConv?.isOfficial === true;
  const matchChatReadOnly = isThreadReadOnly(activeConv, activeMatch);
  const latestMessage = messages[messages.length - 1] ?? null;
  const menuOpen = activeConv ? openMenuConvId === activeConv.id : false;
  const activeStatus = activeConv
    ? activeConv.kind === "match" && activeMatch
      ? statusForMatchContext({
          status: activeMatch.status,
          playedAt: activeMatch.playedAt,
          pendingAcceptance: activeMatch.pendingAcceptance,
        })
      : statusForConversation(activeConv)
    : null;

  const selectConversation = (convId: string) => {
    if (convId === activeConvId) return;
    setActiveConvId(convId);
    setOpenMenuConvId(null);
    setConvos((prev) =>
      patchConvoPreview(prev, convId, { unreadCount: 0 }),
    );
    syncConvInUrl(convId);
  };

  const backToConversationList = () => {
    setActiveConvId(null);
    setOpenMenuConvId(null);
    syncConvInUrl(null);
  };

  const reloadMatchContext = () => {
    const convId = activeConvIdRef.current;
    if (!convId) return;
    void loadConversationThread({ conversationId: convId, skipMessages: true }).then((res) => {
      if (!res.ok) return;
      setActiveMatch(res.data.activeMatch);
      writeThreadCache(convId, { activeMatch: res.data.activeMatch });
    });
  };

  useEffect(() => {
    if (!loadInboxOnClient) {
      setConvos(initialConvos);
      setInboxLoading(false);
    }
  }, [initialConvos, loadInboxOnClient]);

  useEffect(() => {
    if (!loadInboxOnClient || !meUserId) {
      setInboxLoading(false);
      return;
    }
    let cancelled = false;
    setInboxLoading(true);
    void fetchConversationListClient(meUserId).then((res) => {
      if (cancelled) return;
      setInboxLoading(false);
      if (!res.ok) {
        toast({
          icon: "alert-triangle",
          title: "No se pudo cargar conversaciones",
          sub: res.message,
        });
        return;
      }
      setConvos(res.convos);
      setActiveConvId((current) => {
        if (current && res.convos.some((c) => c.id === current)) return current;
        if (initialConvId && res.convos.some((c) => c.id === initialConvId)) {
          return initialConvId;
        }
        return current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loadInboxOnClient, meUserId, initialConvId, toast]);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      setActiveMatch(null);
      setThreadLoading(false);
      return;
    }

    let cancelled = false;
    const convId = activeConvId;
    const activeConvo = convosRef.current.find((c) => c.id === convId);
    const convKind = activeConvo?.kind;
    const cached = threadCacheRef.current.get(convId);
    lastMarkedRef.current = null;

    if (cached && cached.messages.length > 0) {
      setMessages(cached.messages);
      setActiveMatch(cached.activeMatch);
      setThreadLoading(false);
    } else if (activeConvo) {
      setMessages(previewMessagesFromConvo(activeConvo, meUserId));
      setActiveMatch(cached?.activeMatch ?? null);
      setThreadLoading(true);
    } else {
      setMessages([]);
      setActiveMatch(cached?.activeMatch ?? null);
      setThreadLoading(true);
    }

    void fetchConversationMessagesClient(convId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setThreadLoading(false);
        toast({
          icon: "alert-triangle",
          title: "No se pudo cargar el chat",
          sub: res.message,
        });
        return;
      }
      const msgs = res.messages.map((m) => threadToLite(m));
      setMessages((prev) => {
        const merged = mergeThreadWithPending(msgs, prev);
        writeThreadCache(convId, { messages: merged });
        return merged;
      });
      setThreadLoading(false);
    });

    if (convKind === "match") {
      const loadMatch = () => {
        void loadConversationThread({ conversationId: convId, skipMessages: true }).then((res) => {
          if (cancelled || !res.ok) return;
          setActiveMatch(res.data.activeMatch);
          writeThreadCache(convId, { activeMatch: res.data.activeMatch });
        });
      };
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(loadMatch, { timeout: 1200 });
      } else {
        setTimeout(loadMatch, 0);
      }
    } else {
      setActiveMatch(null);
      writeThreadCache(convId, { activeMatch: null });
    }

    return () => {
      cancelled = true;
    };
  }, [activeConvId, meUserId, toast]);

  useEffect(() => {
    if (threadLoading || !threadScrollRef.current) return;
    const el = threadScrollRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeConvId, messages, threadLoading]);
  const visibleConvos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return convos.filter((c) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        c.name.toLowerCase().includes(normalizedQuery) ||
        (c.lastBody ?? "").toLowerCase().includes(normalizedQuery) ||
        conversationTypeLabel(c).toLowerCase().includes(normalizedQuery);
      if (!matchesQuery) return false;
      if (filter === "unread") return c.unreadCount > 0;
      if (filter === "matches") return c.kind === "match";
      if (filter === "groups") return c.isGroup || c.kind === "team_channel" || c.kind === "quedada";
      if (filter === "official") return c.isOfficial;
      return true;
    });
  }, [convos, filter, query]);

  // Marca como leída la conversación activa al verla / cuando llega un mensaje nuevo.
  useEffect(() => {
    if (!activeConv || messages.length === 0 || threadLoading) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderId === meUserId) {
      lastMarkedRef.current = lastMsg.id;
      return;
    }
    if (lastMsg.id.startsWith("pending-") || lastMsg.sendStatus === "sending") return;
    if (lastMarkedRef.current === lastMsg.id) return;
    lastMarkedRef.current = lastMsg.id;
    void markConversationReadClient(activeConv.id, lastMsg.id).then((res) => {
      if (!res.ok) return;
      setConvos((prev) => patchConvoPreview(prev, activeConv.id, { unreadCount: 0 }));
    });
  }, [activeConv, messages, meUserId, threadLoading]);

  const handleSend = () => {
    if (!activeConv || !meUserId) return;
    if (activeConv.isOfficial) {
      toast({
        icon: "info",
        title: "Canal informativo",
        sub: "MATCHPOINT no recibe respuestas por este chat. Para soporte, usa la sección Soporte.",
      });
      return;
    }
    if (matchChatReadOnly) {
      const quedadaClosed =
        activeConv.kind === "quedada" &&
        (activeConv.quedadaSummary?.status === "finished" ||
          activeConv.quedadaSummary?.status === "cancelled");
      toast({
        icon: "info",
        title: "Chat cerrado",
        sub: quedadaClosed
          ? activeConv.quedadaSummary?.status === "cancelled"
            ? "Esta quedada fue cancelada. Ya no puedes enviar mensajes aquí."
            : "Esta quedada ya finalizó. Ya no puedes enviar mensajes aquí."
          : "Este partido fue cancelado. Ya no puedes enviar mensajes aquí.",
      });
      return;
    }
    const body = draft.trim();
    if (body.length === 0) return;
    const convId = activeConv.id;
    const clientNonce = `pending-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const optimistic: MessageLite = {
      id: clientNonce,
      clientNonce,
      senderId: meUserId,
      body,
      kind: "text",
      createdAt,
      sendStatus: "sending",
    };
    setDraft("");
    setMessages((prev) => {
      const next = [...prev, optimistic];
      writeThreadCache(convId, { messages: next });
      return next;
    });
    setConvos((prev) =>
      sortConvosByRecent(
        patchConvoPreview(prev, convId, {
          lastBody: body,
          lastSenderId: meUserId,
          lastAt: createdAt,
          unreadCount: 0,
        }),
      ),
    );

    void sendMessageClient({ conversationId: convId, body, kind: "text" }).then((res) => {
      if (res.ok) {
        const saved = threadToLite(res.message, "sent");
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.clientNonce === clientNonce || m.id === clientNonce ? saved : m,
          );
          if (activeConvIdRef.current === convId) {
            writeThreadCache(convId, { messages: next });
          }
          return next;
        });
        setConvos((prev) =>
          sortConvosByRecent(
            patchConvoPreview(prev, convId, {
              lastBody: saved.body,
              lastSenderId: saved.senderId,
              lastAt: saved.createdAt,
            }),
          ),
        );
        return;
      }
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.clientNonce === clientNonce || m.id === clientNonce
            ? { ...m, sendStatus: "failed" as const }
            : m,
        );
        if (activeConvIdRef.current === convId) {
          writeThreadCache(convId, { messages: next });
        }
        return next;
      });
      toast({
        icon: "x",
        title: "No se envió",
        sub: res.message,
      });
    });
  };

  const handleConversationCreated = (
    conversationId: string,
    meta?: { displayName: string; username: string | null; userId: string },
  ) => {
    setComposeOpen(false);
    if (meta) {
      setConvos((prev) => {
        if (prev.some((c) => c.id === conversationId)) return prev;
        const created: ConvoLite = {
          id: conversationId,
          name: meta.displayName,
          kind: "dm",
          isGroup: false,
          isSystem: false,
          isOfficial: false,
          memberCount: 2,
          lastBody: null,
          lastSenderId: null,
          lastAt: null,
          unreadCount: 0,
          otherUserId: meta.userId,
          otherUsername: meta.username,
          matchSummary: null,
          quedadaSummary: null,
        };
        return [created, ...prev];
      });
    }
    selectConversation(conversationId);
  };

  const handleMarkActiveRead = async () => {
    if (!activeConv || !latestMessage || markingRead) return;
    setMarkingRead(true);
    try {
      if (latestMessage.id.startsWith("pending-") || latestMessage.sendStatus === "sending") {
        toast({ icon: "info", title: "Espera un momento", sub: "Aún se está enviando el último mensaje." });
        return;
      }
      const res = await markConversationReadClient(activeConv.id, latestMessage.id);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo marcar", sub: res.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Conversación marcada como leída" });
      setOpenMenuConvId(null);
      setConvos((prev) => patchConvoPreview(prev, activeConv.id, { unreadCount: 0 }));
    } finally {
      setMarkingRead(false);
    }
  };

  const handleViewProfile = () => {
    if (!activeConv?.otherUserId) return;
    if (!activeConv.otherUsername) {
      toast({
        icon: "info",
        title: "Perfil no disponible",
        sub: "No encontramos el alias público de este jugador.",
      });
      return;
    }
    router.push(`/dashboard/user/players/${activeConv.otherUsername}`);
  };

  const handleHeaderAction = (action: "call" | "video" | "profile" | "menu") => {
    if (!activeConv) return;
    if (action === "profile") {
      handleViewProfile();
      return;
    }
    if (action === "menu") {
      setOpenMenuConvId(menuOpen ? null : activeConv.id);
      return;
    }
    toast({
      icon: action === "call" ? "phone" : "video",
      title: action === "call" ? "Llamadas en preparación" : "Videollamadas en preparación",
      sub: "Por ahora coordina por mensajes dentro de MATCHPOINT.",
    });
  };

  const handleQuickAction = (action: "challenge" | "reserve" | "location") => {
    if (action === "challenge") {
      if (activeConv?.kind === "dm" && activeConv.otherUserId) {
        window.dispatchEvent(
          new CustomEvent("mp-open-retar", {
            detail: {
              id: activeConv.otherUserId,
              name: activeConv.name,
              level: 3.5,
              sport: "Pickleball",
              city: "Cumbayá",
              av: initials(activeConv.name),
              avBg: "linear-gradient(135deg,#10b981,#047857)",
            },
          }),
        );
        return;
      }
      window.dispatchEvent(new CustomEvent("mp-open-crear-match"));
      return;
    }
    if (action === "reserve") {
      toast({ icon: "building-2", title: "Elige un club", sub: "Te llevamos a clubes para reservar una cancha real." });
      router.push("/dashboard/user/clubes");
      return;
    }
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href).then(() => {
        toast({ icon: "map-pin", title: "Enlace copiado", sub: "Compártelo en el chat que prefieras." });
      });
      return;
    }
    toast({ icon: "map-pin", title: "Ubicación", sub: "Tu navegador no permitió copiar el enlace." });
  };

  // Realtime: actualiza lista + hilo activo sin router.refresh().
  useRealtimeRefresh(
    [
      { table: "messages" },
      { table: "conversations" },
      ...(meUserId ? [{ table: "conversation_members", filter: `user_id=eq.${meUserId}` }] : []),
      ...(activeMatch ? [{ table: "matches", filter: `id=eq.${activeMatch.matchId}` }] : []),
    ],
    {
      enabled: !!meUserId,
      onChange: (table, payload) => {
        if (table === "messages" && payload.eventType === "INSERT" && payload.new) {
          const row = payload.new;
          const convId = row.conversation_id as string;
          const msg = messageFromRow(row);
          const isActive = convId === activeConvIdRef.current;
          setConvos((prev) =>
            sortConvosByRecent(
              patchConvoPreview(prev, convId, {
                lastBody: msg.body,
                lastSenderId: msg.senderId,
                lastAt: msg.createdAt,
                unreadCount: isActive
                  ? 0
                  : (prev.find((c) => c.id === convId)?.unreadCount ?? 0) + 1,
              }),
            ),
          );
          if (isActive) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const pendingIdx = prev.findIndex(
                (m) =>
                  (m.sendStatus === "sending" || m.id.startsWith("pending-")) &&
                  m.senderId === msg.senderId &&
                  m.body === msg.body,
              );
              const confirmed = { ...msg, sendStatus: "sent" as const };
              const next =
                pendingIdx >= 0
                  ? prev.map((m, i) => (i === pendingIdx ? confirmed : m))
                  : [...prev, confirmed];
              writeThreadCache(convId, { messages: next });
              return next;
            });
          }
          return;
        }
        if (table === "conversations" && payload.eventType === "UPDATE" && payload.new) {
          const row = payload.new;
          const convId = row.id as string;
          const lastAt = (row.last_message_at as string | null) ?? null;
          if (lastAt) {
            setConvos((prev) =>
              sortConvosByRecent(patchConvoPreview(prev, convId, { lastAt })),
            );
          }
          return;
        }
        if (table === "conversation_members" && payload.eventType === "UPDATE" && payload.new) {
          const row = payload.new;
          const convId = row.conversation_id as string;
          if (convId === activeConvIdRef.current && row.last_read_message_id) {
            setConvos((prev) => patchConvoPreview(prev, convId, { unreadCount: 0 }));
          }
          return;
        }
        if (table === "matches" && (payload.eventType === "UPDATE" || payload.eventType === "INSERT")) {
          reloadMatchContext();
        }
      },
    },
  );

  return (
    <>
      <div className="mp-messages-page flex min-h-0 flex-1 flex-col">
      <div className="card mp-messages-shell grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_1fr]">
        <aside
          className={`mp-messages-list flex min-h-0 min-w-0 flex-col overflow-hidden bg-white${activeConvId ? " max-lg:hidden" : ""}`}
        >
          <div
            className="min-w-0 w-full"
            style={{
              flexShrink: 0,
              padding: 16,
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div className="flex flex-col gap-2 w-full max-lg:gap-2.5">
              <div className="flex justify-between items-start gap-2 w-full">
                <div className="font-heading text-lg max-lg:text-base font-black uppercase tracking-tight">
                  Mensajes<span className="dot">.</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => toast({ icon: "archive", title: "Archivados", sub: "El archivado todavía no tiene fuente de datos en mensajería." })}
                    style={{ padding: "8px 10px", fontSize: 10 }}
                  >
                    <Icon name="archive" size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label="Nuevo mensaje"
                    disabled={!meUserId}
                    onClick={() => setComposeOpen(true)}
                    className="btn btn-primary"
                    style={{ padding: "8px 11px", fontSize: 10, opacity: meUserId ? 1 : 0.5 }}
                  >
                    <Icon name="pen-square" size={12} color="#fff" />
                    Nuevo
                  </button>
                </div>
              </div>
              <div style={{ width: "100%", fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
                Chat, retos, reservas y check-ins en un solo hilo.
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: 9, color: "var(--muted-fg)" }}>
                <Icon name="search" size={13} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar conversación…"
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 32px",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 9999,
                  fontFamily: "inherit",
                  fontSize: 12,
                  outline: "none",
                  background: "var(--muted)",
                }}
              />
            </div>
            <div ref={filterScrollRef} className="mp-msg-filter-scroll">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="mp-press"
                  onClick={() => setFilter(f.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    flexShrink: 0,
                    border: "1px solid var(--border)",
                    borderRadius: 9999,
                    padding: "6px 9px",
                    background: filter === f.key ? "#0a0a0a" : "#fff",
                    color: filter === f.key ? "#fff" : "var(--fg)",
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    transition: "background 150ms var(--ease), color 150ms var(--ease), transform 150ms var(--ease)",
                  }}
                >
                  <Icon name={f.icon} size={10} color={filter === f.key ? "#fff" : "var(--primary)"} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {inboxLoading ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
                Cargando conversaciones…
              </div>
            ) : convos.length === 0 ? (
              <EmptyPanel
                icon="message-square"
                title="Aún no tienes conversaciones"
                text="Busca un jugador y empieza un chat directo."
                actionLabel="Nuevo mensaje"
                onAction={() => setComposeOpen(true)}
              />
            ) : visibleConvos.length === 0 ? (
              <EmptyPanel icon="search-x" title="Sin resultados" text="Prueba otra búsqueda o cambia el filtro." />
            ) : (
              visibleConvos.map((c, i) => (
                <ConversationRow
                  key={c.id}
                  convo={c}
                  index={i}
                  active={activeConvId === c.id}
                  status={statusForConversation(c)}
                  meUserId={meUserId}
                  onSelect={() => selectConversation(c.id)}
                  onPrefetch={() => prefetchThread(c.id)}
                />
              ))
            )}
          </div>
        </aside>

        <main
          className={`mp-messages-thread flex flex-col min-h-0 overflow-hidden bg-[var(--bg)]${activeConvId ? "" : " max-lg:hidden"}`}
        >
          {activeConv ? (
            <>
              <div
                style={{
                  flexShrink: 0,
                  padding: "14px 20px",
                  background: "#fff",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                  <button
                    type="button"
                    className="lg:hidden mp-press icon-btn"
                    aria-label="Volver a conversaciones"
                    onClick={backToConversationList}
                    style={{ flexShrink: 0, width: 36, height: 36 }}
                  >
                    <Icon name="arrow-left" size={16} />
                  </button>
                  <ConversationAvatar convo={activeConv} index={0} size={42} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                      <span className="font-heading" style={{ fontWeight: 900, fontSize: 17, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                        {activeConv.name}
                      </span>
                      {activeConv.isOfficial && <OfficialVerifiedBadge />}
                      {activeStatus && <StatusPill status={activeStatus} />}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, color: "var(--muted-fg)", fontWeight: 600 }}>
                      {conversationTypeLabel(activeConv)}
                    </div>
                  </div>
                </div>
                <div style={{ position: "relative", display: "flex", gap: 6, flexShrink: 0 }}>
                  <HeaderIconButton title="Opciones" icon="more-horizontal" onClick={() => handleHeaderAction("menu")} ariaExpanded={menuOpen} />
                  {menuOpen && (
                    <ConversationMenu
                      activeConv={activeConv}
                      messageCount={messages.length}
                      markingRead={markingRead}
                      onMarkRead={handleMarkActiveRead}
                      onOpenSupport={() => router.push("/dashboard/user/soporte")}
                      onViewProfile={handleViewProfile}
                      onSoon={() =>
                        toast({
                          icon: "info",
                          title: "Próximamente",
                          sub: "Reportar o bloquear estará disponible en una próxima versión.",
                        })
                      }
                    />
                  )}
                </div>
              </div>

              {activeConv.kind === "match" && activeMatch ? (
                <MatchChatDetailsPanel
                  key={activeConv.id}
                  match={activeMatch}
                  meUserId={meUserId ?? ""}
                  status={activeStatus}
                  onMatchUpdated={reloadMatchContext}
                />
              ) : (
                activeStatus && (
                  <ConversationStatusBanner
                    status={activeStatus}
                    convo={activeConv}
                    activeMatch={activeMatch}
                    onQuickAction={handleQuickAction}
                  />
                )
              )}

              {activeOfficial && (
                <div style={infoBannerStyle}>
                  <Icon name="megaphone" size={13} color="var(--primary)" />
                  <span>MATCHPOINT usa este espacio para avisos y recordatorios oficiales. Para pedir ayuda, usa la sección Soporte.</span>
                </div>
              )}

              <div
                ref={threadScrollRef}
                className="flex flex-1 flex-col gap-2 min-h-0 overflow-x-hidden overflow-y-auto px-3.5 py-3.5 lg:px-[22px] lg:py-4"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {threadLoading && messages.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
                    Cargando mensajes…
                  </div>
                )}
                {messages.map((m, index) => {
                  const mine = m.senderId === meUserId;
                  const showDay = index === 0 || !isSameDay(messages[index - 1].createdAt, m.createdAt);
                  return (
                    <Fragment key={m.id}>
                      {showDay && <DaySeparator label={dayLabel(m.createdAt)} />}
                      <MessageItem message={m} mine={mine} />
                    </Fragment>
                  );
                })}
                {!threadLoading && messages.length === 0 && (
                  <EmptyThread activeOfficial={activeOfficial} />
                )}
              </div>

              {activeOfficial || matchChatReadOnly ? (
                <div style={{ ...readOnlyComposerStyle, flexShrink: 0 }}>
                  <Icon
                    name={matchChatReadOnly ? (activeConv?.kind === "quedada" ? "lock" : "x-circle") : "info"}
                    size={12}
                    color="var(--muted-fg)"
                  />
                  {matchChatReadOnly
                    ? activeConv?.kind === "quedada"
                      ? activeConv.quedadaSummary?.status === "cancelled"
                        ? "Esta quedada fue cancelada. El chat quedó cerrado y ya no puedes escribir."
                        : "Esta quedada ya finalizó. El chat quedó cerrado y ya no puedes escribir."
                      : "Este partido fue cancelado. El chat quedó cerrado y ya no puedes escribir."
                    : "Este canal oficial es de solo lectura. Para soporte, usa la sección Soporte."}
                </div>
              ) : (
                <>
                  <div style={{ flexShrink: 0 }}>
                    <QuickActionsBar onAction={handleQuickAction} />
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSend();
                    }}
                    style={{
                      flexShrink: 0,
                      padding: "10px 12px",
                      borderTop: "1px solid var(--border)",
                      background: "#fff",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <button type="button" className="icon-btn" title="Adjuntar" onClick={() => toast({ icon: "paperclip", title: "Adjuntos", sub: "Los adjuntos todavía no están activos en mensajes." })}>
                      <Icon name="paperclip" size={14} />
                    </button>
                    <button type="button" className="icon-btn" title="Imagen" onClick={() => toast({ icon: "image", title: "Imágenes", sub: "El envío de imágenes todavía no está activo." })}>
                      <Icon name="image" size={14} />
                    </button>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Escribe un mensaje…"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "10px 14px",
                        border: "1px solid var(--border)",
                        borderRadius: 9999,
                        fontFamily: "inherit",
                        fontSize: 13,
                        outline: "none",
                        background: "var(--muted)",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Enviar mensaje"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: "var(--primary)",
                        color: "#fff",
                        border: 0,
                        cursor: draft.trim() ? "pointer" : "not-allowed",
                        opacity: draft.trim() ? 1 : 0.5,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "opacity 150ms var(--ease), transform 150ms var(--ease)",
                      }}
                    >
                      <Icon name="send" size={14} color="#fff" />
                    </button>
                  </form>
                </>
              )}
            </>
          ) : (
            <EmptyPanel
              icon="message-square"
              title="Elige una conversación"
              text={convos.length === 0 ? "Aún no tienes conversaciones. Empieza una desde Nuevo mensaje." : "Selecciona un chat de la lista para ver los mensajes."}
              actionLabel={convos.length === 0 ? "Nuevo mensaje" : undefined}
              onAction={() => setComposeOpen(true)}
            />
          )}
        </main>
      </div>
      </div>
      {composeOpen && (
        <NewMessageModal
          onClose={() => setComposeOpen(false)}
          onCreated={handleConversationCreated}
        />
      )}
    </>
  );
}

function ConvoLastMessagePreview({
  body,
  lastSenderId,
  meUserId,
  isUnread,
  fallback,
}: {
  body: string | null | undefined;
  lastSenderId: string | null;
  meUserId: string | null;
  isUnread: boolean;
  fallback: ReactNode;
}) {
  const trimmed = body?.trim();
  if (!trimmed) return <>{fallback}</>;
  const mine = !!meUserId && lastSenderId === meUserId;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        maxWidth: "100%",
        minWidth: 0,
        verticalAlign: "bottom",
      }}
    >
      {mine ? (
        <Icon
          name="check-check"
          size={12}
          color={isUnread ? "var(--primary)" : "var(--muted-fg)"}
          style={{ flexShrink: 0, opacity: isUnread ? 1 : 0.85 }}
        />
      ) : null}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{trimmed}</span>
    </span>
  );
}

function ConversationRow({
  convo,
  index,
  active,
  status,
  meUserId,
  onSelect,
  onPrefetch,
}: {
  convo: ConvoLite;
  index: number;
  active: boolean;
  status: ConvoStatus | null;
  meUserId: string | null;
  onSelect: () => void;
  onPrefetch?: () => void;
}) {
  const isMatch = convo.kind === "match";
  const title = isMatch ? matchConvoTitle(convo) : convo.name;
  const matchHasLastMessage = !!convo.lastBody?.trim();
  const matchPreview = isMatch
    ? convo.lastBody?.trim() || matchConvoShortMeta(convo)
    : null;
  const isUnread = convo.unreadCount > 0;
  const avatarSize = isMatch ? 32 : 36;
  const rowPad = isMatch ? "6px 10px" : "8px 12px";
  const colAvatar = isMatch ? 32 : 36;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      aria-current={active ? "true" : undefined}
      className="mp-press"
      style={{
        width: "100%",
        padding: rowPad,
        display: "grid",
        gridTemplateColumns: `${colAvatar}px minmax(0, 1fr) auto`,
        gap: isMatch ? 7 : 8,
        alignItems: "center",
        borderBottom: "1px solid var(--border-soft)",
        background: active ? "var(--muted)" : isUnread ? "var(--primary-tint)" : "transparent",
        cursor: "pointer",
        color: "inherit",
        position: "relative",
        transition: "background 150ms var(--ease-out)",
        border: "none",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      {active && <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--primary)" }} />}
      <ConversationAvatar convo={convo} index={index} size={avatarSize} />
      <div style={{ minWidth: 0, paddingRight: 2 }}>
        {isMatch ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span
                className="font-heading"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12.5,
                  fontWeight: isUnread ? 800 : 600,
                  letterSpacing: "-0.02em",
                  color: isUnread ? "var(--fg)" : "var(--muted-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.15,
                }}
              >
                {title}
              </span>
              {status && status.kind !== "open" ? (
                <MatchListStatusLabel status={status} />
              ) : null}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 10.5,
                color: isUnread ? "var(--fg)" : "var(--muted-fg)",
                fontWeight: isUnread ? 600 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}
            >
              {matchHasLastMessage ? (
                <ConvoLastMessagePreview
                  body={convo.lastBody}
                  lastSenderId={convo.lastSenderId}
                  meUserId={meUserId}
                  isUnread={isUnread}
                  fallback={matchConvoShortMeta(convo)}
                />
              ) : (
                matchPreview
              )}
            </div>
          </>
        ) : (
          <>
            <span
              className="font-heading"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: isUnread ? 800 : 500,
                letterSpacing: "-0.02em",
                color: isUnread ? "var(--fg)" : "var(--muted-fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                {convo.isOfficial && <OfficialVerifiedBadge />}
              </span>
            </span>
            <div
              style={{
                marginTop: 1,
                fontSize: 11,
                color: isUnread ? "var(--fg)" : "var(--muted-fg)",
                fontWeight: isUnread ? 600 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.25,
              }}
            >
              <ConvoLastMessagePreview
                body={convo.lastBody}
                lastSenderId={convo.lastSenderId}
                meUserId={meUserId}
                isUnread={isUnread}
                fallback={
                  convo.isGroup ? `${convo.memberCount} miembros` : "Sin mensajes aún"
                }
              />
            </div>
            {status &&
              (status.kind === "scheduled" || status.kind === "proposing" || status.kind === "check_in") && (
                <div style={{ marginTop: 4 }}>
                  <StatusPill status={status} compact />
                </div>
              )}
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          flexShrink: 0,
          minWidth: 32,
        }}
      >
        <span
          className="tabular"
          style={{
            fontSize: 9.5,
            color: "var(--muted-fg)",
            fontWeight: isUnread ? 700 : 500,
            lineHeight: 1,
          }}
        >
          {relTime(convo.lastAt)}
        </span>
        {isUnread && (
          <span
            style={{
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 9999,
              background: "var(--primary)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 800,
            }}
          >
            {convo.unreadCount > 9 ? "9+" : convo.unreadCount}
          </span>
        )}
      </div>
    </button>
  );
}

function ConversationAvatar({ convo, index, size = 40 }: { convo: ConvoLite; index: number; size?: number }) {
  if (convo.isOfficial) return <MatchpointOfficialAvatar size={size} />;
  const isGroupShape = convo.isGroup || convo.kind === "team_channel" || convo.kind === "quedada";
  const background =
    convo.kind === "match"
      ? "linear-gradient(135deg,#0a0a0a,#7c2d12)"
      : convo.kind === "quedada"
        ? "linear-gradient(135deg,#ea580c,#f97316)"
        : isGroupShape
        ? "linear-gradient(135deg,#3730a3,#6366f1)"
        : convo.isSystem
          ? "#0a0a0a"
          : AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: isGroupShape ? Math.round(size * 0.22) : "50%",
        background,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {convo.kind === "match" ? (
        <Icon name="swords" size={Math.round(size * 0.38)} color="#fff" />
      ) : convo.kind === "quedada" ? (
        <Icon name="party-popper" size={Math.round(size * 0.38)} color="#fff" />
      ) : isGroupShape ? (
        <Icon name="users" size={Math.round(size * 0.4)} color="#fff" />
      ) : convo.isSystem ? (
        <Icon name="building-2" size={Math.round(size * 0.38)} color="#fff" />
      ) : (
        <span className="font-heading" style={{ fontSize: Math.round(size * 0.33), fontWeight: 900, letterSpacing: "-0.04em" }}>
          {initials(convo.name)}
        </span>
      )}
    </span>
  );
}

const STATUS_TONES: Record<ConvoStatus["kind"], { bg: string; fg: string; icon: string }> = {
  proposing: { bg: "rgba(251,191,36,0.16)", fg: "#b45309", icon: "message-circle-question" },
  scheduled: { bg: "var(--primary-tint)", fg: "var(--primary-active)", icon: "calendar-check" },
  check_in: { bg: "rgba(14,165,233,0.12)", fg: "#0369a1", icon: "map-pin" },
  played: { bg: "var(--border-soft)", fg: "var(--muted-fg)", icon: "history" },
  cancelled: { bg: "rgba(220,38,38,0.1)", fg: "var(--danger-fg)", icon: "x-circle" },
  open: { bg: "var(--border-soft)", fg: "var(--muted-fg)", icon: "messages-square" },
};

/** Estado en la lista de partidos: solo texto con color, sin pill. */
function MatchListStatusLabel({ status }: { status: ConvoStatus }) {
  const tone = STATUS_TONES[status.kind];
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: tone.fg,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {matchListStatusLabel(status)}
    </span>
  );
}

function StatusPill({ status, compact = false }: { status: ConvoStatus; compact?: boolean }) {
  const tone = STATUS_TONES[status.kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "3px 8px" : "4px 10px",
        borderRadius: 9999,
        background: tone.bg,
        color: tone.fg,
        fontSize: compact ? 9 : 9.5,
        fontWeight: 900,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Icon name={tone.icon} size={compact ? 9 : 10} color={tone.fg} />
      {status.label}
      {status.when && !compact && <span style={{ opacity: 0.65, fontWeight: 800 }}>· {status.when}</span>}
    </span>
  );
}

function HeaderIconButton({
  icon,
  title,
  onClick,
  disabled,
  ariaExpanded,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={ariaExpanded}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 9999,
        background: "#fff",
        border: "1px solid var(--border)",
        color: "var(--fg)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 150ms var(--ease), border-color 150ms var(--ease)",
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function ConversationStatusBanner({
  status,
  convo,
  activeMatch,
  onQuickAction,
}: {
  status: ConvoStatus;
  convo: ConvoLite;
  activeMatch?: ActiveMatch | null;
  onQuickAction: (action: "challenge" | "reserve" | "location") => void;
}) {
  if (status.kind === "open" || status.kind === "played" || status.kind === "cancelled") return null;
  const checkIn = status.kind === "check_in";
  return (
    <div
      style={{
        flexShrink: 0,
        padding: "12px 20px",
        background: checkIn ? "linear-gradient(110deg, #0a0a0a 0%, #0e2018 100%)" : "linear-gradient(110deg, var(--primary-tint) 0%, #fff 100%)",
        color: checkIn ? "#fff" : "var(--fg)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 10, background: checkIn ? "var(--primary)" : "#fff", color: checkIn ? "#001a10" : "var(--primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={checkIn ? "map-pin" : "calendar-check"} size={18} color="currentColor" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.72 }}>
          {status.label}
        </div>
        <div className="font-heading" style={{ marginTop: 2, fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>
          {status.when || convo.name}
        </div>
      </div>
      {activeMatch ? (
        <span
          style={{
            padding: "7px 12px",
            borderRadius: 9999,
            background: "rgba(10,10,10,0.08)",
            color: checkIn ? "#fff" : "var(--muted-fg)",
            fontWeight: 900,
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="clipboard-list" size={12} color="currentColor" />
          Resultado fuera del chat
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onQuickAction("reserve")}
          style={{
            padding: "8px 14px",
            borderRadius: 9999,
            border: 0,
            background: checkIn ? "var(--primary)" : "#0a0a0a",
            color: "#fff",
            fontWeight: 900,
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Reservar cancha
          <Icon name="arrow-right" size={12} color="#fff" />
        </button>
      )}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div style={{ alignSelf: "center", padding: "4px 12px", background: "rgba(0,0,0,0.05)", borderRadius: 9999, fontSize: 10, fontWeight: 900, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.16em", margin: "8px auto" }}>
      {label}
    </div>
  );
}

function MessageItem({ message, mine }: { message: MessageLite; mine: boolean }) {
  const cardType = message.payload?.type;
  if (
    message.kind === "reservation_invite" ||
    cardType === "court-reserved" ||
    cardType === "match-invite"
  ) {
    return <MessageInlineCard message={message} mine={mine} />;
  }
  if (message.kind === "system" || message.payload?.quedada_event) {
    return (
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "2px 8px" }}>
        <div
          style={{
            maxWidth: "min(92%, 520px)",
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(10,10,10,0.05)",
            border: "1px solid var(--border-soft)",
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--muted-fg)",
            textAlign: "center",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, color: "var(--color-mp-primary-active)" }}>
            MATCHPOINT
          </div>
          {message.body}
          <div style={{ fontSize: 9, marginTop: 5, opacity: 0.7 }}>{timeOnly(message.createdAt)}</div>
        </div>
      </div>
    );
  }
  return (
    <MessageBubble
      body={message.body}
      time={timeOnly(message.createdAt)}
      mine={mine}
      system={message.kind === "system"}
      sendStatus={mine ? message.sendStatus : undefined}
    />
  );
}

function MessageBubble({
  body,
  time,
  mine,
  system = false,
  sendStatus,
}: {
  body: string;
  time: string;
  mine: boolean;
  system?: boolean;
  sendStatus?: MessageSendStatus;
}) {
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "min(64%, 560px)",
          padding: "9px 14px",
          borderRadius: "var(--radius-2xl)",
          background: system ? "rgba(10,10,10,0.05)" : mine ? "var(--primary)" : "#fff",
          color: mine ? "#fff" : "#0a0a0a",
          border: mine ? 0 : "1px solid var(--border)",
          fontSize: 13,
          lineHeight: 1.42,
          borderBottomRightRadius: mine ? 4 : 16,
          borderBottomLeftRadius: mine ? 16 : 4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <div>{body}</div>
        <div
          style={{
            fontSize: 9.5,
            marginTop: 4,
            opacity: 0.65,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 4,
          }}
        >
          {sendStatus === "sending" ? (
            <Icon name="clock" size={10} color={mine ? "rgba(255,255,255,0.75)" : "var(--muted-fg)"} />
          ) : null}
          {sendStatus === "failed" ? (
            <Icon name="alert-circle" size={10} color="#f87171" />
          ) : null}
          {sendStatus === "sent" ? (
            <Icon name="check" size={10} color={mine ? "rgba(255,255,255,0.75)" : "var(--muted-fg)"} />
          ) : null}
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}

function MessageInlineCard({ message, mine }: { message: MessageLite; mine: boolean }) {
  const payload = message.payload;
  const isMatch = payload?.type === "match-invite";
  const startsAt = pickString(payload, ["startsAt"], "");
  const endsAt = pickString(payload, ["endsAt"], "");
  const whenLabel =
    startsAt && endsAt
      ? `${formatShortDate(startsAt)} – ${timeOnly(endsAt)}`
      : formatShortDate(startsAt || message.createdAt);
  const cardMax = isMatch ? "min(88%, 320px)" : "min(72%, 560px)";
  const headPad = isMatch ? "8px 12px" : "12px 16px";
  const bodyPad = isMatch ? "10px 12px" : "14px 16px";
  const titleSize = isMatch ? 14 : 17;
  const gridGap = isMatch ? 6 : 8;
  const cellPad = isMatch ? "6px 8px" : "8px 10px";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: cardMax,
          borderRadius: isMatch ? "var(--radius-xl)" : "var(--radius-2xl)",
          overflow: "hidden",
          background: isMatch ? "#fff" : "#0a0a0a",
          color: isMatch ? "var(--fg)" : "#fff",
          border: isMatch ? "1px solid var(--border)" : 0,
          boxShadow: isMatch ? "0 1px 4px rgba(0,0,0,0.04)" : "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            padding: headPad,
            borderBottom: isMatch ? "1px solid var(--border-soft)" : "1px solid rgba(255,255,255,0.12)",
            background: isMatch ? "linear-gradient(135deg, rgba(16,185,129,0.1), transparent)" : "transparent",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 900,
              fontSize: isMatch ? 9 : 10,
              letterSpacing: "0.14em",
              color: "var(--primary)",
              textTransform: "uppercase",
            }}
          >
            <Icon name={isMatch ? "swords" : "building-2"} size={isMatch ? 12 : 14} color="var(--primary)" />
            {isMatch ? "Invitación a match" : "Cancha reservada"}
          </div>
        </div>
        <div style={{ padding: bodyPad }}>
          <div className="font-heading" style={{ fontWeight: 900, fontSize: titleSize, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {isMatch
              ? `vs. ${pickString(payload, ["opponentName", "opp", "name"], "Rival")}`
              : pickString(payload, ["clubName", "club", "venue"], "Reserva confirmada")}
          </div>
          <div
            style={{
              marginTop: isMatch ? 8 : 10,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: gridGap,
            }}
          >
            {[
              { label: "Cuándo", value: whenLabel },
              { label: "Dónde", value: pickString(payload, ["courtName", "court", "cancha"], "Por confirmar") },
              { label: "Tipo", value: pickString(payload, ["kind", "duration", "fee"], isMatch ? "Casual" : "Reserva") },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: cellPad,
                  background: isMatch ? "var(--muted)" : "rgba(255,255,255,0.06)",
                  borderRadius: isMatch ? 6 : 8,
                }}
              >
                <div
                  style={{
                    fontSize: 8,
                    color: isMatch ? "var(--muted-fg)" : "rgba(255,255,255,0.55)",
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ marginTop: 2, fontSize: isMatch ? 10.5 : 12, fontWeight: 800, lineHeight: 1.25 }}>{item.value}</div>
              </div>
            ))}
          </div>
          {message.body && (
            <div
              style={{
                marginTop: isMatch ? 8 : 10,
                fontSize: isMatch ? 11 : 12,
                lineHeight: 1.4,
                color: isMatch ? "var(--muted-fg)" : "rgba(255,255,255,0.72)",
              }}
            >
              {message.body}
            </div>
          )}
          <div
            style={{
              marginTop: isMatch ? 6 : 10,
              fontSize: 9.5,
              color: isMatch ? "var(--muted-fg)" : "rgba(255,255,255,0.6)",
              textAlign: "right",
              fontWeight: 700,
            }}
          >
            {timeOnly(message.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionsBar({ onAction }: { onAction: (action: "challenge" | "reserve" | "location") => void }) {
  const actions = [
    { key: "challenge" as const, label: "Retar a match", icon: "swords" },
    { key: "reserve" as const, label: "Reservar cancha", icon: "building-2" },
    { key: "location" as const, label: "Compartir ubicación", icon: "map-pin" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderTop: "1px solid var(--border-soft)", background: "var(--muted)", flexWrap: "wrap" }}>
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => onAction(action.key)}
          style={{
            padding: "6px 11px",
            borderRadius: 9999,
            background: "#fff",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontWeight: 800,
            fontSize: 10.5,
            letterSpacing: "0.06em",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            transition: "transform 150ms var(--ease), border-color 150ms var(--ease)",
          }}
        >
          <Icon name={action.icon} size={11} color="var(--primary)" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div style={{ minHeight: 260, padding: 28, textAlign: "center", color: "var(--muted-fg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <span style={{ width: 54, height: 54, borderRadius: 18, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={22} color="var(--muted-fg)" />
      </span>
      <div className="font-heading" style={{ color: "var(--fg)", fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
        {title}<span className="dot">.</span>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 280 }}>{text}</div>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary" onClick={onAction} style={{ marginTop: 4, padding: "8px 13px", fontSize: 10.5 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function EmptyThread({ activeOfficial }: { activeOfficial: boolean }) {
  return (
    <div style={{ margin: "auto", textAlign: "center", color: "var(--muted-fg)", fontSize: 13, maxWidth: 340, lineHeight: 1.55 }}>
      <Icon name={activeOfficial ? "megaphone" : "message-square"} size={24} color="var(--muted-fg)" />
      <div style={{ marginTop: 10 }}>
        {activeOfficial ? "Aún no hay avisos oficiales en este canal." : "Aún sin mensajes en esta conversación. Escribe el primero."}
      </div>
    </div>
  );
}

const infoBannerStyle: CSSProperties = {
  flexShrink: 0,
  padding: "10px 22px",
  borderBottom: "1px solid var(--border)",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "var(--muted-fg)",
  fontSize: 12,
  lineHeight: 1.45,
};

const readOnlyComposerStyle: CSSProperties = {
  padding: 16,
  borderTop: "1px solid var(--border)",
  background: "#fafafa",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  color: "var(--muted-fg)",
  fontSize: 12,
};

function NewMessageModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (
    conversationId: string,
    meta?: { displayName: string; username: string | null; userId: string },
  ) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      searchPlayers({ q: term, limit: 20 })
        .then((res) => {
          if (cancelled) return;
          if (!res.ok) {
            toast({ icon: "alert-triangle", title: "No se pudo buscar", sub: res.error.message });
            setResults([]);
            return;
          }
          setResults(res.data.filter((player) => !player.isOfficial));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q, toast]);

  const handleStart = async (player: PlayerSearchResult) => {
    if (startingUserId || player.isOfficial) return;
    setStartingUserId(player.userId);
    try {
      const res = await startConversation({ kind: "dm", memberIds: [player.userId] });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo abrir el chat", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Chat listo", sub: player.displayName });
      onCreated(res.data.id, {
        displayName: player.displayName,
        username: player.username,
        userId: player.userId,
      });
    } finally {
      setStartingUserId(null);
    }
  };

  return (
    <div
      className="mp-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.45)",
      }}
    >
      <div
        className="mp-modal-panel card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          padding: 20,
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
              Nuevo mensaje<span className="dot">.</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 3 }}>
              Busca un jugador para abrir o reutilizar un chat directo.
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: 11, color: "var(--muted-fg)" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o @username…"
            autoFocus
            style={{
              width: "100%",
              padding: "10px 14px 10px 36px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
              background: "var(--muted)",
            }}
          />
        </div>

        <div style={{ minHeight: 190, display: "flex", flexDirection: "column", gap: 8 }}>
          {q.trim().length < 2 ? (
            <SearchEmptyState icon="search" text="Empieza a escribir al menos 2 letras." />
          ) : loading ? (
            <SearchEmptyState icon="loader" text="Buscando jugadores…" />
          ) : results.length === 0 ? (
            <SearchEmptyState icon="user-x" text="No encontramos jugadores con esa búsqueda." />
          ) : (
            results.map((player, index) => {
              const busy = startingUserId === player.userId;
              const disabled = startingUserId !== null;
              return (
                <button
                  key={player.userId}
                  type="button"
                  onClick={() => void handleStart(player)}
                  disabled={disabled}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    textAlign: "left",
                    fontFamily: "inherit",
                    cursor: disabled ? "wait" : "pointer",
                    opacity: disabled && !busy ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length],
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span className="font-heading" style={{ fontSize: 12, fontWeight: 900 }}>
                      {initials(player.displayName)}
                    </span>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {player.displayName}
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--muted-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {player.username ? `@${player.username}` : "Sin alias"}
                      {player.city ? ` · ${player.city}` : ""}
                    </span>
                  </span>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: busy ? "var(--muted)" : "#0a0a0a",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={busy ? "loader" : "message-square"} size={13} color={busy ? "var(--muted-fg)" : "#fff"} />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function SearchEmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 150,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--muted-fg)",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      <Icon name={icon} size={18} color="var(--muted-fg)" />
      {text}
    </div>
  );
}

function ConversationMenu({
  activeConv,
  messageCount,
  markingRead,
  onMarkRead,
  onOpenSupport,
  onViewProfile,
  onSoon,
}: {
  activeConv: ConvoLite;
  messageCount: number;
  markingRead: boolean;
  onMarkRead: () => void;
  onOpenSupport: () => void;
  onViewProfile: () => void;
  onSoon: () => void;
}) {
  const canMarkRead = messageCount > 0;
  const isMatch = activeConv.kind === "match";

  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        right: 0,
        top: "calc(100% + 8px)",
        zIndex: 20,
        width: 260,
        padding: 8,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "#fff",
        boxShadow: "0 16px 40px rgba(0,0,0,0.12)",
      }}
    >
      {activeConv.isOfficial ? (
        <div
          style={{
            padding: "10px 10px 12px",
            borderBottom: "1px solid var(--border)",
            marginBottom: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 900 }}>
            <OfficialVerifiedBadge size={14} />
            Canal oficial MATCHPOINT
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.4, marginTop: 5 }}>
            Solo lectura para avisos y recordatorios. Para pedir ayuda, usa Soporte.
          </div>
        </div>
      ) : isMatch ? (
        <div
          style={{
            padding: "10px",
            borderBottom: "1px solid var(--border)",
            marginBottom: 6,
            fontSize: 11,
            color: "var(--muted-fg)",
            lineHeight: 1.4,
          }}
        >
          <strong style={{ color: "#0a0a0a" }}>Chat del partido</strong>
          <br />
          Las acciones del match están en la barra principal.
        </div>
      ) : null}

      <MenuItem
        icon={markingRead ? "loader" : "check-check"}
        label={markingRead ? "Marcando..." : "Marcar como leído"}
        disabled={!canMarkRead || markingRead}
        onClick={onMarkRead}
      />
      {activeConv.isOfficial && (
        <MenuItem icon="life-buoy" label="Ir a Soporte" onClick={onOpenSupport} />
      )}
      {!activeConv.isOfficial && (
        <>
          <MenuItem
            icon="user"
            label="Ver perfil"
            disabled={!activeConv.otherUserId}
            onClick={onViewProfile}
          />
          {!isMatch && <MenuItem icon="shield-alert" label="Reportar o bloquear" onClick={onSoon} />}
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  disabled = false,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 10px",
        border: 0,
        borderRadius: 10,
        background: "transparent",
        color: disabled ? "var(--muted-fg)" : "#0a0a0a",
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "inherit",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Icon name={icon} size={13} color={disabled ? "var(--muted-fg)" : "#0a0a0a"} />
      {label}
    </button>
  );
}

function matchWhenLabel(match: ActiveMatch): string {
  if (match.reservationStartsAt && match.reservationEndsAt) {
    return `${formatShortDate(match.reservationStartsAt)} – ${timeOnly(match.reservationEndsAt)}`;
  }
  return formatShortDate(match.playedAt);
}

function matchVenueLabel(match: ActiveMatch): string {
  if (match.clubName && match.courtName) return `${match.clubName} · ${match.courtName}`;
  return match.clubName || match.courtName || "Lugar por confirmar";
}

function matchFormatLabel(match: ActiveMatch): string | null {
  if (match.plannedBestOf === 1) return "Set único";
  if (match.plannedBestOf) return `Mejor de ${match.plannedBestOf}`;
  return null;
}

function matchStatusHeadline(match: ActiveMatch, status: ConvoStatus | null): string {
  if (match.pendingAcceptance) return "Esperando aceptación del reto";
  if (status?.label) return status.label;
  if (match.status === "cancelled") return "Partido cancelado";
  if (match.status === "confirmed") return "Resultado confirmado";
  if (match.status === "disputed") return "Resultado en disputa";
  if (match.status === "reported") return "Resultado reportado";
  return "Partido agendado";
}

/** Panel plegable: resumen del partido + reserva + acciones en un solo bloque. */
function MatchChatDetailsPanel({
  match,
  meUserId,
  status,
  onMatchUpdated,
}: {
  match: ActiveMatch;
  meUserId: string;
  status: ConvoStatus | null;
  onMatchUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const when = matchWhenLabel(match);
  const venue = matchVenueLabel(match);
  const formatLabel = matchFormatLabel(match);
  const headline = matchStatusHeadline(match, status);
  const modeLabel = match.mode === "doubles" ? "Dobles" : "Singles";
  const isScheduled = match.status === "scheduled";

  return (
    <div
      style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(110deg, var(--primary-tint) 0%, #fff 92%)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: isScheduled ? "#0a0a0a" : "var(--muted)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={isScheduled ? "swords" : "calendar-check"} size={14} color="#fff" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--primary-active)",
              lineHeight: 1.1,
            }}
          >
            {headline}
          </div>
          <div
            className="font-heading"
            style={{
              marginTop: 1,
              fontWeight: 900,
              fontSize: 12.5,
              letterSpacing: "-0.02em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {venue}
          </div>
          <div
            style={{
              marginTop: 1,
              fontSize: 10,
              color: "var(--muted-fg)",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {when}
            {formatLabel ? ` · ${formatLabel}` : ""} · {modeLabel}
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontWeight: 800,
            color: "var(--muted-fg)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {open ? "Ocultar" : "Detalles"}
          <Icon
            name="chevron-down"
            size={14}
            color="var(--muted-fg)"
            style={{
              transition: "transform 200ms var(--ease)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "0 20px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderTop: "1px solid rgba(16,185,129,0.15)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {[
              { label: "Cuándo", value: when },
              { label: "Lugar", value: venue },
              { label: "Formato", value: formatLabel ? `${formatLabel} · ${modeLabel}` : modeLabel },
              {
                label: "Reserva",
                value: match.reservationId
                  ? match.reservationStatus === "cancelled"
                    ? "Cancelada"
                    : "Confirmada"
                  : "Sin reserva vinculada",
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid var(--border-soft)",
                }}
              >
                <div
                  style={{
                    fontSize: 8.5,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--muted-fg)",
                  }}
                >
                  {row.label}
                </div>
                <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 800, lineHeight: 1.35 }}>{row.value}</div>
              </div>
            ))}
          </div>

          {match.reservationId && match.reservationStatus !== "cancelled" && (
            <Link
              href="/dashboard/user/mis-reservas"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 800,
                color: "var(--primary)",
                alignSelf: "flex-start",
              }}
            >
              Ver en mis reservas
              <Icon name="arrow-right" size={12} color="var(--primary)" />
            </Link>
          )}

          {match.pendingAcceptance ? (
            <p style={{ margin: 0, fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.45 }}>
              Falta que todos acepten el reto. Los jugadores retados reciben una notificación con
              botones para aceptar o rechazar.
            </p>
          ) : (
            <MatchScorePanel match={match} meUserId={meUserId} onMatchUpdated={onMatchUpdated} />
          )}

          <MatchChatDetailsActions match={match} onMatchUpdated={onMatchUpdated} />
        </div>
      )}
    </div>
  );
}

function MatchChatDetailsActions({
  match,
  onMatchUpdated,
}: {
  match: ActiveMatch;
  onMatchUpdated: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");

  const canCancel = match.status === "scheduled" || match.status === "reported";
  const canReschedule = match.status === "scheduled";

  if (!canCancel && !canReschedule) {
    return null;
  }

  const doCancel = () => {
    setPending(true);
    void cancelMatch({ matchId: match.matchId }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Partido cancelado" });
      onMatchUpdated();
    });
  };

  const doReschedule = () => {
    if (!date) {
      toast({ icon: "alert-triangle", title: "Elige una fecha" });
      return;
    }
    setPending(true);
    const playedAt = new Date(`${date}T${time}:00`).toISOString();
    void rescheduleMatch({ matchId: match.matchId, playedAt }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo reprogramar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Partido reprogramado" });
      setReschedOpen(false);
      onMatchUpdated();
    });
  };

  const doReportNoShow = (noShowUserId: string, name: string) => {
    setPending(true);
    void reportNoShow({ matchId: match.matchId, noShowUserId }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo reportar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Inasistencia reportada", sub: `${name} afecta su fiabilidad.` });
      onMatchUpdated();
    });
  };

  // Reporte de inasistencia: solo si el feature está activo y ya pasó la hora.
  const showNoShow = match.reliabilityEnabled && match.matchTimePassed && match.others.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 10,
        paddingTop: 4,
        borderTop: "1px dashed var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {canReschedule && (
            <button
              onClick={() => setReschedOpen((v) => !v)}
              disabled={pending}
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 12px", fontSize: 11 }}
            >
              <Icon name="calendar-clock" size={12} />
              Reprogramar
            </button>
          )}
          <button
            onClick={doCancel}
            disabled={pending}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "#dc2626",
              padding: "6px 12px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 800,
              cursor: pending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {pending ? "…" : "Cancelar partido"}
          </button>
        </div>
      </div>
      {reschedOpen && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={matchInputStyle} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...matchInputStyle, maxWidth: 110 }} />
          <button className="btn btn-primary" disabled={pending} onClick={doReschedule} style={{ padding: "7px 14px", fontSize: 11 }}>
            {pending ? "…" : "Guardar"}
          </button>
        </div>
      )}
      {showNoShow && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
          <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>¿No apareció?</span>
          {match.others.map((o) => (
            <button
              key={o.id}
              onClick={() => doReportNoShow(o.id, o.name)}
              disabled={pending}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "#b45309",
                padding: "5px 11px",
                borderRadius: 9999,
                fontSize: 10.5,
                fontWeight: 800,
                cursor: pending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              <Icon name="user-x" size={11} color="#b45309" /> {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function parseSetValue(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function winnerFromSets(sets: { a: number; b: number }[], bestOf: number): "a" | "b" | null {
  const needed = Math.ceil(bestOf / 2);
  let winsA = 0;
  let winsB = 0;
  for (const set of sets) {
    if (set.a === set.b) return null;
    if (set.a > set.b) winsA += 1;
    else winsB += 1;
  }
  if (winsA >= needed) return "a";
  if (winsB >= needed) return "b";
  return null;
}

function MatchScorePanel({
  match,
  meUserId,
  onMatchUpdated,
}: {
  match: ActiveMatch;
  meUserId: string;
  onMatchUpdated: () => void;
}) {
  const toast = useToast();
  const bestOf = match.plannedBestOf ?? 1;
  const [pending, setPending] = useState(false);
  const [sets, setSets] = useState<Array<{ a: string; b: string }>>(() => {
    if (match.scoreSets?.length) {
      return match.scoreSets.map((s) => ({ a: String(s.a), b: String(s.b) }));
    }
    return Array.from({ length: 1 }, () => ({ a: "", b: "" }));
  });
  const [disputeReason, setDisputeReason] = useState("");

  const totalPlayers = match.teamAPlayerIds.length + match.teamBPlayerIds.length;
  const iConfirmed = match.confirmedBy.includes(meUserId);
  const parsedSets = sets
    .map((s) => {
      const a = parseSetValue(s.a);
      const b = parseSetValue(s.b);
      if (a == null || b == null) return null;
      return { a, b };
    })
    .filter((s): s is { a: number; b: number } => s != null);
  const previewWinner = winnerFromSets(parsedSets, bestOf);

  const submitScore = () => {
    if (!previewWinner) {
      toast({
        icon: "alert-triangle",
        title: "Marcador incompleto",
        sub:
          bestOf === 1
            ? "Ingresa el resultado del set."
            : `Ingresa los sets hasta que alguien gane ${Math.ceil(bestOf / 2)}.`,
      });
      return;
    }
    setPending(true);
    void reportScore({
      matchId: match.matchId,
      score: { sets: parsedSets, winner: previewWinner },
    }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo registrar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Marcador registrado", sub: "Los demás deben confirmarlo." });
      onMatchUpdated();
    });
  };

  const confirm = () => {
    setPending(true);
    void confirmScore({ matchId: match.matchId }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo confirmar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Marcador confirmado" });
      onMatchUpdated();
    });
  };

  const dispute = () => {
    if (disputeReason.trim().length < 3) {
      toast({ icon: "alert-triangle", title: "Cuéntanos qué está mal", sub: "Mínimo 3 caracteres." });
      return;
    }
    setPending(true);
    void disputeScore({ matchId: match.matchId, reason: disputeReason.trim() }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo disputar", sub: res.error.message });
        return;
      }
      toast({ icon: "info", title: "Marcador en disputa" });
      onMatchUpdated();
    });
  };

  if (match.status === "confirmed" && match.scoreSets?.length) {
    return (
      <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid var(--border-soft)" }}>
        <div className="label-mp" style={{ marginBottom: 8 }}>
          Resultado confirmado
        </div>
        {match.scoreSets.map((s, i) => (
          <div key={i} style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
            Set {i + 1}: Equipo A {s.a} – {s.b} Equipo B
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 6 }}>
          Ganador: Equipo {match.scoreWinner === "b" ? "B" : "A"} · validado por {match.confirmedBy.length} jugadores
        </div>
      </div>
    );
  }

  if (match.status === "reported" || match.status === "disputed") {
    const canReReport = match.status === "disputed";
    if (canReReport) {
      return (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid #fecaca" }}>
          <div className="label-mp" style={{ marginBottom: 8, color: "#dc2626" }}>
            Marcador en disputa — registra el correcto
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sets.map((set, index) => (
              <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                <input
                  value={set.a}
                  onChange={(e) =>
                    setSets((prev) => prev.map((row, i) => (i === index ? { ...row, a: e.target.value } : row)))
                  }
                  inputMode="numeric"
                  placeholder="Eq. A"
                  style={matchInputStyle}
                />
                <span style={{ fontSize: 10, fontWeight: 900, color: "var(--muted-fg)" }}>VS</span>
                <input
                  value={set.b}
                  onChange={(e) =>
                    setSets((prev) => prev.map((row, i) => (i === index ? { ...row, b: e.target.value } : row)))
                  }
                  inputMode="numeric"
                  placeholder="Eq. B"
                  style={matchInputStyle}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !previewWinner}
            onClick={submitScore}
            style={{ marginTop: 10, width: "100%", justifyContent: "center", fontSize: 11 }}
          >
            {pending ? "Guardando…" : "Registrar marcador corregido"}
          </button>
        </div>
      );
    }

    return (
      <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid var(--border-soft)" }}>
        <div className="label-mp" style={{ marginBottom: 8 }}>
          Marcador reportado
        </div>
        {(match.scoreSets ?? []).map((s, i) => (
          <div key={i} style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
            Set {i + 1}: Equipo A {s.a} – {s.b} Equipo B
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>
          Confirmaciones: {match.confirmedBy.length}/{totalPlayers}
        </div>
        {!iConfirmed && (
          <div style={{ marginTop: 10 }}>
            <input
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Motivo si disputas (opcional al confirmar)"
              style={{ ...matchInputStyle, width: "100%", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm} style={{ fontSize: 11 }}>
                Confirmar marcador
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending}
                onClick={dispute}
                style={{ fontSize: 11, color: "#dc2626", borderColor: "#fecaca" }}
              >
                Disputar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (match.status !== "scheduled") return null;

  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid var(--border-soft)" }}>
      <div className="label-mp" style={{ marginBottom: 8 }}>
        Registrar marcador{bestOf > 1 ? ` · BO${bestOf}` : " · set único"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sets.map((set, index) => (
          <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
            <input
              value={set.a}
              onChange={(e) =>
                setSets((prev) => prev.map((row, i) => (i === index ? { ...row, a: e.target.value } : row)))
              }
              inputMode="numeric"
              placeholder="Eq. A"
              style={matchInputStyle}
            />
            <span style={{ fontSize: 10, fontWeight: 900, color: "var(--muted-fg)" }}>VS</span>
            <input
              value={set.b}
              onChange={(e) =>
                setSets((prev) => prev.map((row, i) => (i === index ? { ...row, b: e.target.value } : row)))
              }
              inputMode="numeric"
              placeholder="Eq. B"
              style={matchInputStyle}
            />
          </div>
        ))}
      </div>
      {bestOf > 1 && sets.length < bestOf && (
        <button
          type="button"
          className="btn btn-outline"
          style={{ marginTop: 8, fontSize: 10.5 }}
          onClick={() => setSets((prev) => [...prev, { a: "", b: "" }])}
        >
          Agregar set
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending || !previewWinner}
        onClick={submitScore}
        style={{ marginTop: 10, width: "100%", justifyContent: "center", fontSize: 11 }}
      >
        {pending ? "Guardando…" : "Registrar marcador"}
      </button>
      <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.4 }}>
        Los demás jugadores deben confirmar el resultado. Si no coincide, pueden disputarlo.
      </p>
    </div>
  );
}

const matchInputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "inherit",
  background: "var(--muted)",
};
