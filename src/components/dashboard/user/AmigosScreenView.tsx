"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { NameplateMark } from "@/components/dashboard/widgets/NameplateMark";
import {
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  searchPlayers,
  sendFriendRequest,
  type PlayerSearchResult,
} from "@/server/actions/friends";
import { startConversation } from "@/server/actions/messaging";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { REQ_AVATARS, initials, type FriendLite } from "../widgets/FriendCard";
import { MP_GRADIENT_SURFACE_SOCIAL_DARK } from "@/lib/ui/gradients";

export type { FriendLite };

export type RequestLite = FriendLite & {
  fromUserId: string;
  createdAt?: string | null;
};

type FilterKey = "todos" | "ciudad" | "nivel" | "cruces" | "nuevos";
type FriendWithUi = FriendLite & { affinity: number; avatarBg: string };

const tk = {
  card: "#fff",
  border: "#e5e5e5",
  borderSoft: "#f0efeb",
  ink: "#0a0a0a",
  muted: "#737373",
  mutedSoft: "#a3a3a3",
  accent: "#10b981",
  accentDeep: "#047857",
  accentSoft: "rgba(16,185,129,0.1)",
  gold: "var(--color-mp-amber)",
  goldRing: "color-mix(in srgb, var(--color-mp-amber) 30%, var(--border))",
  warm: "#f59e0b",
};

/** Evita re-animar mp-rise tras refresh o al cambiar filtros. */
const AMIGOS_CARD_ENTERED = new Set<string>();
const SMART_MATCHES_EXIT_MS = 180;
/** Mínimo de amigos para mostrar sugerencias MP+ (afinidad con datos reales). */
const SMART_MATCHES_MIN_FRIENDS = 10;

export function AmigosScreenView({
  friends,
  requests,
  suggestions,
  myCity,
  myLevel,
  meUserId,
  viewerIsPremium,
}: {
  friends: FriendLite[];
  requests: RequestLite[];
  suggestions: FriendLite[];
  myCity: string | null;
  myLevel: number | null;
  meUserId: string | null;
  viewerIsPremium: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverResults, setDiscoverResults] = useState<PlayerSearchResult[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverPending, startDiscoverTransition] = useTransition();
  const [smartMatchesHidden, setSmartMatchesHidden] = useState(false);
  const [smartMatchesClosing, setSmartMatchesClosing] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) setQuery(q);
  }, [searchParams]);

  useEffect(() => {
    if (!smartMatchesClosing) return;
    const handle = window.setTimeout(() => {
      setSmartMatchesHidden(true);
      setSmartMatchesClosing(false);
    }, SMART_MATCHES_EXIT_MS);
    return () => window.clearTimeout(handle);
  }, [smartMatchesClosing]);

  const globalSearchActive = query.trim().length >= 2;

  useRealtimeRefresh(
    meUserId
      ? [
          { table: "friend_requests", filter: `to_user_id=eq.${meUserId}` },
          { table: "friendships" },
          { table: "matches" },
        ]
      : [],
    { enabled: !!meUserId },
  );

  const enriched = useMemo<FriendWithUi[]>(
    () =>
      friends
        .map((friend, index) => ({
          ...friend,
          avatarBg: REQ_AVATARS[index % REQ_AVATARS.length],
          affinity: affinityScore(friend, myCity, myLevel),
        }))
        .sort((a, b) => b.affinity - a.affinity),
    [friends, myCity, myLevel],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setDiscoverResults([]);
      setDiscoverLoading(false);
      return;
    }
    setDiscoverLoading(true);
    const handle = window.setTimeout(() => {
      searchPlayers({ q, limit: 30 })
        .then((res) => {
          if (res.ok) setDiscoverResults(res.data);
          else toast({ icon: "alert-triangle", title: res.error.message });
        })
        .finally(() => setDiscoverLoading(false));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query, toast]);

  const sendDiscoverRequest = (player: PlayerSearchResult) => {
    startDiscoverTransition(async () => {
      const result = await sendFriendRequest({ toUserId: player.userId });
      if (!result.ok) {
        toast({ icon: "alert-triangle", title: result.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `Solicitud enviada a ${player.displayName}` });
      setDiscoverResults((prev) =>
        prev.map((item) =>
          item.userId === player.userId ? { ...item, relationship: "request_sent" } : item,
        ),
      );
      router.refresh();
    });
  };

  const visibleFriends = useMemo(() => {
    const needle = globalSearchActive ? "" : query.trim().toLowerCase();
    return enriched.filter((friend) => {
      if (needle) {
        const matchesQuery =
          friend.name.toLowerCase().includes(needle) ||
          friend.city.toLowerCase().includes(needle) ||
          (friend.username ?? "").toLowerCase().includes(needle);
        if (!matchesQuery) return false;
      }
      if (filter === "ciudad") return !!myCity && friend.city === myCity;
      if (filter === "nivel") return myLevel != null && Math.abs(friend.level - myLevel) <= 0.5;
      if (filter === "cruces") return (friend.matchesTogether ?? 0) > 0;
      if (filter === "nuevos") return (friend.matchesTogether ?? 0) === 0;
      return true;
    });
  }, [enriched, filter, myCity, myLevel, query, globalSearchActive]);

  const sameCity = friends.filter((friend) => !!myCity && friend.city === myCity).length;
  const closeLevel = friends.filter((friend) => myLevel != null && Math.abs(friend.level - myLevel) <= 0.5).length;
  const withCrosses = friends.filter((friend) => (friend.matchesTogether ?? 0) > 0).length;
  const recent = friends.filter((friend) => isRecent(friend.lastPlayedAt)).length;

  if (discoverOpen) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <button type="button" className="btn mp-press" onClick={() => setDiscoverOpen(false)} style={{ alignSelf: "flex-start", background: "#fff", border: `1px solid ${tk.border}` }}>
          <Icon name="arrow-left" size={13} />
          Volver a amigos
        </button>
        <DiscoverPanel />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }} data-screen-label="Amigos">
      <TopBar query={query} onQuery={setQuery} onDiscover={() => setDiscoverOpen(true)} />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi accent label="Amigos" value={friends.length} sub="en tu red" icon="users" />
        <Kpi label="Actividad real" value={recent} sub="con cruce reciente" icon="activity" />
        <Kpi label="Misma ciudad" value={sameCity} sub={myCity ?? "configura tu ciudad"} icon="map-pin" />
        <Kpi label="Nivel cercano" value={closeLevel} sub={myLevel != null ? `±0.5 de ${myLevel.toFixed(1)}` : "sin rating aún"} icon="target" />
      </section>

      {!smartMatchesHidden && friends.length >= SMART_MATCHES_MIN_FRIENDS && (
        <SmartMatches
          friends={enriched.slice(0, 3)}
          viewerIsPremium={viewerIsPremium}
          closing={smartMatchesClosing}
          onDismiss={() => setSmartMatchesClosing(true)}
        />
      )}

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <main className="order-2 lg:order-none flex flex-col gap-3.5 min-w-0">
          {query.trim().length === 1 ? (
            <p style={{ margin: 0, fontSize: 11.5, color: tk.muted, lineHeight: 1.45 }}>
              Escribe al menos 2 letras para buscar jugadores en toda la app.
            </p>
          ) : null}
          {!globalSearchActive ? (
            <Filters friends={friends} myCity={myCity} myLevel={myLevel} value={filter} onChange={setFilter} />
          ) : (
            <p style={{ margin: 0, fontSize: 11.5, color: tk.muted, lineHeight: 1.45 }}>
              Resultados en MATCHPOINT para “{query.trim()}”.
            </p>
          )}
          {globalSearchActive ? (
            discoverLoading ? (
              <div className="card" style={{ padding: 28, textAlign: "center", color: tk.muted }}>
                <Icon name="search" size={22} color={tk.muted} />
                <p style={{ margin: "10px 0 0", fontSize: 13 }}>Buscando jugadores…</p>
              </div>
            ) : discoverResults.length === 0 ? (
              <Empty
                icon="search"
                title="No encontramos jugadores"
                text={`Nadie coincide con “${query.trim()}”. Prueba otro nombre o @username.`}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {discoverResults.map((player, index) => (
                  <DiscoverCard
                    key={player.userId}
                    player={player}
                    avatarBg={REQ_AVATARS[index % REQ_AVATARS.length]}
                    busy={discoverPending}
                    onSend={() => sendDiscoverRequest(player)}
                  />
                ))}
              </div>
            )
          ) : visibleFriends.length === 0 ? (
            <Empty
              icon="users"
              title={friends.length === 0 ? "Aún no tienes amigos en MATCHPOINT" : "Sin amigos con ese filtro"}
              text={friends.length === 0 ? "Acepta solicitudes o descubre jugadores para armar tu red." : "Prueba otro filtro o escribe al menos 2 letras para buscar en la app."}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleFriends.map((friend, index) => (
                <FriendCardRedesign key={friend.id} friend={friend} staggerIndex={index} />
              ))}
            </div>
          )}
        </main>

        <aside className="order-1 lg:order-none grid grid-cols-1 lg:grid-cols-1 gap-3 min-w-0">
          <RequestsPanel requests={requests} />
          <SuggestionsPanel suggestions={suggestions} onDiscover={() => setDiscoverOpen(true)} />
          <NetworkPanel friends={friends} withCrosses={withCrosses} />
        </aside>
      </section>
    </div>
  );
}

function TopBar({ query, onQuery, onDiscover }: { query: string; onQuery: (value: string) => void; onDiscover: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div>
        <h1 className="font-heading" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 0.95, letterSpacing: "-0.035em", textTransform: "uppercase", color: tk.ink }}>
          Amigos
        </h1>
      </div>
      <div className="flex items-center gap-2 w-full sm:flex-1 sm:max-w-[420px] sm:min-w-0">
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <span style={{ position: "absolute", left: 12, top: 11, color: tk.muted }}>
            <Icon name="search" size={13} />
          </span>
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar por nombre o @username…"
            className="mp-amigos-search"
            style={{
              width: "100%",
              padding: "9px 14px 9px 32px",
              border: `1px solid ${tk.border}`,
              borderRadius: 9999,
              fontSize: 12.5,
              outline: "none",
              fontFamily: "inherit",
              background: "#fff",
            }}
          />
        </div>
        <button type="button" className="btn btn-primary mp-press" onClick={onDiscover} style={{ flexShrink: 0 }}>
          <Icon name="user-plus" size={13} />
          Invitar
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, accent = false }: { label: string; value: number | string; sub: string; icon: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? MP_GRADIENT_SURFACE_SOCIAL_DARK : tk.card,
        color: accent ? "#fff" : tk.ink,
        border: accent ? "1px solid rgba(255,255,255,0.1)" : `1px solid ${tk.border}`,
        borderRadius: "var(--radius-mp-card)",
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="label-mp" style={{ color: accent ? "rgba(255,255,255,0.5)" : tk.muted }}>{label}</span>
        <Icon name={icon} size={16} color={accent ? tk.accent : tk.mutedSoft} />
      </div>
      <div className="tabular font-heading" style={{ marginTop: 10, fontWeight: 900, fontSize: 36, lineHeight: 0.9, letterSpacing: "-0.035em", color: accent ? tk.accent : tk.ink }}>
        {value}
      </div>
      <div style={{ marginTop: 5, fontSize: 11.5, color: accent ? "rgba(255,255,255,0.6)" : tk.muted, fontWeight: 700 }}>{sub}</div>
    </div>
  );
}

function SmartMatches({
  friends,
  viewerIsPremium,
  closing,
  onDismiss,
}: {
  friends: FriendWithUi[];
  viewerIsPremium: boolean;
  closing: boolean;
  onDismiss: () => void;
}) {
  return (
    <section
      className={`mp-smart-matches-surface mp-amigos-smart-matches-exit${closing ? " is-closing" : ""} px-4 py-4 md:px-6 md:py-5`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-mp-sm)",
              background: "var(--color-mp-amber)",
              color: "var(--color-mp-black)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="sparkles" size={18} />
          </div>
          <div>
            <span
              className="label-mp"
              style={{ color: tk.gold, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            >
              Sugerencias por datos reales
              <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 700 }} aria-hidden>
                ·
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, letterSpacing: "0.12em" }}>
                <Icon name="crown" size={10} color="var(--color-mp-amber)" />
                MATCHPOINT+
              </span>
            </span>
            <div className="font-heading" style={{ fontWeight: 900, fontSize: 20, marginTop: 2, letterSpacing: "-0.025em", color: "#fff" }}>
              Mejores compañeros para retar ahora
            </div>
            <div className="mp-smart-matches-sub" style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
              Afinidad según ciudad, nivel y cruces confirmados. Sin partidos, el % es solo una estimación.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!viewerIsPremium && (
            <Link
              href="/dashboard/user/mi-plan?upgrade=premium"
              className="btn"
              style={{ background: "var(--color-mp-amber)", color: "var(--color-mp-black)", textDecoration: "none" }}
            >
              <Icon name="crown" size={13} />
              Activar MP+
            </Link>
          )}
          <button
            type="button"
            className="mp-press"
            onClick={onDismiss}
            disabled={closing}
            aria-label="Ocultar sugerencias"
            title="Ocultar hasta recargar"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 999,
              width: 32,
              height: 32,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <Icon name="x" size={14} color="rgba(255,255,255,0.85)" />
          </button>
        </div>
      </div>

      {friends.length === 0 ? (
        <Empty
          icon="sparkles"
          title="Aún no hay sugerencias"
          text="Agrega amigos o acepta solicitudes para calcular afinidad con datos reales."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ filter: viewerIsPremium ? "none" : "blur(3px)" }}>
          {friends.map((friend) => (
            <SmartPick key={friend.id} friend={friend} />
          ))}
        </div>
      )}
      {!viewerIsPremium && friends.length > 0 && (
        <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius-mp-card)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9999, background: "var(--card)", color: tk.gold, border: "1px solid var(--border)", fontWeight: 900, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", boxShadow: "var(--shadow-mp-card-hover)" }}>
            <Icon name="lock" size={12} />MATCHPOINT+
          </span>
        </div>
      )}
    </section>
  );
}

function SmartPick({ friend }: { friend: FriendWithUi }) {
  return (
    <div style={{ background: tk.card, border: `1px solid ${tk.border}`, borderRadius: 12, padding: "16px 18px", position: "relative" }}>
      <div style={{ position: "absolute", top: 12, right: 14, display: "flex", alignItems: "center", gap: 5 }}>
        <span className="tabular" style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "-0.02em", color: tk.gold }}>{friend.affinity}%</span>
        <Icon name="zap" size={11} color={tk.gold} />
      </div>
      <div className="flex items-center gap-3">
        <Avatar friend={friend} size={48} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <FriendName friend={friend} />
          <div className="flex gap-1 mt-1 items-center">
            <LevelChip level={friend.level} />
            <span style={{ fontSize: 10.5, color: tk.muted, fontWeight: 700 }}>· {friend.city}</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: tk.muted, fontWeight: 600, lineHeight: 1.45 }}>
        {suggestionReason(friend)}
      </div>
      <div style={{ marginTop: 12 }}>
        <FriendActions friend={friend} compact />
      </div>
    </div>
  );
}

function Filters({ friends, myCity, myLevel, value, onChange }: { friends: FriendLite[]; myCity: string | null; myLevel: number | null; value: FilterKey; onChange: (key: FilterKey) => void }) {
  const options = [
    { key: "todos" as const, label: "Todos", count: friends.length },
    { key: "ciudad" as const, label: "Mi ciudad", count: friends.filter((f) => !!myCity && f.city === myCity).length, icon: "map-pin" },
    { key: "nivel" as const, label: "Mi nivel", count: friends.filter((f) => myLevel != null && Math.abs(f.level - myLevel) <= 0.5).length, icon: "target" },
    { key: "cruces" as const, label: "Con cruces", count: friends.filter((f) => (f.matchesTogether ?? 0) > 0).length, icon: "activity" },
    { key: "nuevos" as const, label: "Nuevos", count: friends.filter((f) => (f.matchesTogether ?? 0) === 0).length, icon: "user-plus" },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="label-mp" style={{ marginRight: 6 }}>Filtrar</span>
      {options.map((item) => (
        <button key={item.key} type="button" className="mp-press" onClick={() => onChange(item.key)} style={{ padding: "7px 13px", borderRadius: 9999, background: value === item.key ? tk.ink : "#fff", color: value === item.key ? "#fff" : tk.ink, border: value === item.key ? 0 : `1px solid ${tk.border}`, fontWeight: 900, fontSize: 10.5, letterSpacing: "0.06em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, transition: "background 160ms var(--ease-out), color 160ms var(--ease-out), transform 120ms var(--ease-out)" }}>
          {item.icon && <Icon name={item.icon} size={11} />}
          {item.label}
          <span style={{ padding: "1px 6px", borderRadius: 9999, background: value === item.key ? "rgba(255,255,255,0.15)" : tk.borderSoft, color: value === item.key ? "#fff" : tk.muted, fontSize: 9, fontWeight: 900 }}>{item.count}</span>
        </button>
      ))}
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: tk.muted, fontWeight: 700 }}>Ordenado por <b style={{ color: tk.ink }}>afinidad</b></span>
    </div>
  );
}

function FriendCardRedesign({ friend, staggerIndex = 0 }: { friend: FriendWithUi; staggerIndex?: number }) {
  const playEnter = !AMIGOS_CARD_ENTERED.has(friend.id);
  if (playEnter) AMIGOS_CARD_ENTERED.add(friend.id);
  const enterStyle: CSSProperties | undefined = playEnter
    ? { animationDelay: `${Math.min(staggerIndex, 8) * 50}ms` }
    : undefined;

  return (
    <article
      className={playEnter ? "mp-rise" : undefined}
      style={{ background: tk.card, border: `1px solid ${tk.border}`, borderRadius: 12, padding: "16px 18px", ...enterStyle }}
    >
      <div className="flex items-center gap-3 mb-3">
        <Avatar friend={friend} size={52} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <FriendName friend={friend} />
          <div className="flex gap-1.5 mt-1 items-center flex-wrap">
            <LevelChip level={friend.level} />
            <span style={{ fontSize: 10.5, color: tk.muted, fontWeight: 700 }}>· {friend.city}</span>
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="label-mp" style={{ color: tk.muted, whiteSpace: "nowrap", flexShrink: 0 }}>Afinidad</span>
          <span className="tabular" style={{ fontSize: 12.5, fontWeight: 900, color: friend.affinity >= 85 ? tk.accent : tk.ink, flexShrink: 0 }}>{friend.affinity}%</span>
        </div>
        <div style={{ height: 4, background: tk.borderSoft, borderRadius: 999, overflow: "hidden" }}>
          <div
            className="mp-amigos-affinity-fill"
            style={{
              transform: `scaleX(${Math.max(0, Math.min(100, friend.affinity)) / 100})`,
              background: friend.affinity >= 85 ? tk.accent : tk.ink,
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 py-2.5" style={{ borderTop: `1px dashed ${tk.border}`, borderBottom: `1px dashed ${tk.border}` }}>
        <MiniStat label="Cruces" value={friend.matchesTogether ?? 0} />
        <MiniStat label="H2H" value={`${friend.h2hWins ?? 0}-${friend.h2hLosses ?? 0}`} accent={(friend.h2hWins ?? 0) >= (friend.h2hLosses ?? 0)} />
        <MiniStat label="Último" value={lastPlayedShort(friend.lastPlayedAt)} small />
      </div>
      <FriendActions friend={friend} />
    </article>
  );
}

function RequestsPanel({ requests }: { requests: RequestLite[] }) {
  return (
    <section className="card" style={{ padding: "16px 18px" }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tk.warm }} />
        <span className="label-mp" style={{ color: tk.warm }}>Solicitudes · {requests.length}</span>
      </div>
      {requests.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: tk.muted, lineHeight: 1.45 }}>No tienes solicitudes pendientes.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {requests.map((request, index) => (
            <RequestCard key={request.id} request={request} index={index} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestCard({ request, index }: { request: RequestLite; index: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const respond = (kind: "accept" | "reject") => {
    startTransition(async () => {
      const result = kind === "accept" ? await acceptFriendRequest({ requestId: request.id }) : await rejectFriendRequest({ requestId: request.id });
      if (!result.ok) {
        toast({ icon: "alert-triangle", title: result.error.message });
        return;
      }
      toast({ icon: kind === "accept" ? "check-circle-2" : "x", title: kind === "accept" ? `${request.name} ahora es tu amigo` : "Solicitud rechazada" });
      router.refresh();
    });
  };
  return (
    <div style={{ paddingBottom: 12, borderBottom: `1px solid ${tk.borderSoft}` }}>
      <div className="flex items-center gap-2.5">
        <Avatar friend={{ ...request, avatarBg: REQ_AVATARS[index % REQ_AVATARS.length] }} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <FriendName friend={request} small />
          <div className="flex gap-1.5 mt-1 items-center">
            <LevelChip level={request.level} />
            <span style={{ fontSize: 10.5, color: tk.muted, fontWeight: 700 }}>· {request.city}</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: tk.muted, fontWeight: 600, lineHeight: 1.4 }}>
        {request.createdAt ? `Te la envió ${formatRelativeDate(request.createdAt).toLowerCase()}.` : "Solicitud pendiente."}
      </div>
      <div className="flex gap-1.5 mt-2">
        <button type="button" disabled={pending} onClick={() => respond("reject")} className="btn mp-press" style={{ flex: 1, padding: "6px", background: "#fff", color: tk.muted, border: `1px solid ${tk.border}`, fontSize: 10 }}>Rechazar</button>
        <button type="button" disabled={pending} onClick={() => respond("accept")} className="btn btn-primary mp-press" style={{ flex: 1, padding: "6px", fontSize: 10 }}><Icon name="check" size={11} />Aceptar</button>
      </div>
    </div>
  );
}

function SuggestionsPanel({ suggestions, onDiscover }: { suggestions: FriendLite[]; onDiscover: () => void }) {
  return (
    <section className="card" style={{ padding: "16px 18px" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="label-mp">Sugerencias · {suggestions.length}</span>
        <button type="button" className="mp-press" onClick={onDiscover} style={{ border: 0, background: "transparent", color: tk.accentDeep, fontWeight: 900, fontSize: 10.5, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", borderRadius: 6, padding: "4px 6px" }}>Ver más</button>
      </div>
      {suggestions.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: tk.muted, lineHeight: 1.45 }}>No hay sugerencias nuevas con tu ciudad actual.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {suggestions.slice(0, 4).map((suggestion, index) => <SuggestionRow key={suggestion.id} suggestion={suggestion} index={index} />)}
        </div>
      )}
    </section>
  );
}

function SuggestionRow({ suggestion, index }: { suggestion: FriendLite; index: number }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const toast = useToast();
  return (
    <div className="flex items-center gap-2.5">
      <Avatar friend={{ ...suggestion, avatarBg: REQ_AVATARS[index % REQ_AVATARS.length] }} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <FriendName friend={suggestion} small />
        <div className="flex gap-1.5 items-center flex-wrap">
          <LevelChip level={suggestion.level} />
          <span style={{ fontSize: 10.5, color: tk.muted, fontWeight: 700 }}>· {suggestion.city}</span>
        </div>
      </div>
      <button type="button" disabled={pending || sent} onClick={() => startTransition(async () => {
        const result = await sendFriendRequest({ toUserId: suggestion.id });
        if (!result.ok) {
          toast({ icon: "alert-triangle", title: result.error.message });
          return;
        }
        setSent(true);
        toast({ icon: "check-circle-2", title: `Solicitud enviada a ${suggestion.name}` });
      })} className="mp-press" style={{ padding: "5px 10px", borderRadius: 9999, background: sent ? tk.borderSoft : tk.ink, color: sent ? tk.muted : "#fff", border: 0, fontWeight: 900, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", cursor: pending || sent ? "default" : "pointer", whiteSpace: "nowrap", transition: "background 160ms var(--ease-out), color 160ms var(--ease-out), transform 120ms var(--ease-out)" }}>
        {sent ? "Enviada" : "Agregar"}
      </button>
    </div>
  );
}

function NetworkPanel({ friends, withCrosses }: { friends: FriendLite[]; withCrosses: number }) {
  const totalCrosses = friends.reduce((sum, friend) => sum + (friend.matchesTogether ?? 0), 0);
  return (
    <section
      style={{
        padding: "18px 20px",
        overflow: "hidden",
        background: MP_GRADIENT_SURFACE_SOCIAL_DARK,
        color: "#fff",
        borderRadius: "var(--radius-mp-card)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)" }}>Tu red</div>
      <div className="font-heading" style={{ marginTop: 8, fontWeight: 900, fontSize: 24, letterSpacing: "-0.025em" }}>{withCrosses} con historial</div>
      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.45 }}>
        {totalCrosses} cruces confirmados con amigos. Los estados online, distancia y disponibilidad no existen en el modelo local actual.
      </p>
    </section>
  );
}

function FriendActions({ friend, compact = false }: { friend: FriendLite; compact?: boolean }) {
  const [msgPending, startMsg] = useTransition();
  const [removePending, startRemove] = useTransition();
  const [removeArmed, setRemoveArmed] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const challenge = () => {
    window.dispatchEvent(new CustomEvent("mp-open-retar", { detail: { id: friend.id, name: friend.name, level: friend.level, sport: friend.sport, city: friend.city, av: initials(friend.name), avBg: REQ_AVATARS[Math.abs(hashString(friend.id)) % REQ_AVATARS.length] } }));
  };
  const confirmRemove = () => {
    startRemove(async () => {
      const result = await removeFriend({ userId: friend.id });
      if (!result.ok) {
        toast({ icon: "alert-triangle", title: result.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `${friend.name} salió de tus amigos` });
      setRemoveArmed(false);
      router.refresh();
    });
  };

  useEffect(() => {
    if (!removeArmed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !removePending) setRemoveArmed(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [removeArmed, removePending]);

  if (!compact && removeArmed) {
    return (
      <div
        role="group"
        aria-label={`Confirmar eliminar a ${friend.name}`}
        className="mp-amigos-confirm-block"
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #fecaca",
          background: "#fef2f2",
        }}
      >
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: tk.muted, lineHeight: 1.45, fontWeight: 600 }}>
          ¿Quitar a <strong style={{ color: tk.ink }}>{friend.name}</strong> de tus amigos?
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn mp-press"
            disabled={removePending}
            onClick={() => setRemoveArmed(false)}
            style={{ flex: 1, padding: "8px 10px", background: "#fff", color: tk.ink, border: `1px solid ${tk.border}`, fontSize: 10.5 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn mp-press"
            disabled={removePending}
            onClick={confirmRemove}
            style={{
              flex: 1,
              padding: "8px 10px",
              background: "#dc2626",
              color: "#fff",
              border: 0,
              fontSize: 10.5,
              opacity: removePending ? 0.7 : 1,
            }}
          >
            <Icon name="trash-2" size={12} color="#fff" />
            {removePending ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <button type="button" className="btn mp-press" disabled={msgPending} onClick={() => startMsg(async () => {
        const result = await startConversation({ kind: "dm", memberIds: [friend.id] });
        if (!result.ok) {
          toast({ icon: "alert-triangle", title: result.error.message });
          return;
        }
        router.push(`/dashboard/user/chat?conv=${result.data.id}`);
      })} style={{ flex: 1, padding: compact ? "8px 10px" : "9px 10px", background: "#fff", color: tk.ink, border: `1px solid ${tk.border}`, fontSize: 10.5, opacity: msgPending ? 0.6 : 1 }}>
        <Icon name="message-square" size={12} />{msgPending ? "Abriendo..." : "Chat"}
      </button>
      <button type="button" className="btn btn-primary mp-press" onClick={challenge} style={{ flex: 1, padding: compact ? "8px 10px" : "9px 10px", fontSize: 10.5 }}>
        <Icon name="swords" size={12} />Retar
      </button>
      {!compact && (
        <button
          type="button"
          className="btn mp-press"
          disabled={removePending}
          aria-label={`Eliminar a ${friend.name}`}
          title="Eliminar amigo"
          onClick={() => setRemoveArmed(true)}
          style={{ width: 38, padding: 0, background: "#fff", border: `1px solid ${tk.border}`, color: tk.muted, opacity: removePending ? 0.6 : 1 }}
        >
          <Icon name="trash-2" size={12} />
        </button>
      )}
    </div>
  );
}

function Avatar({ friend, size }: { friend: FriendLite & { avatarBg?: string }; size: number }) {
  if (friend.isOfficial) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: tk.ink, border: "3px solid #fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span className="dot" style={{ fontSize: size * 0.42, lineHeight: 1 }}>●</span>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: friend.avatarBg ?? REQ_AVATARS[Math.abs(hashString(friend.id)) % REQ_AVATARS.length], border: "3px solid #fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: size * 0.34, letterSpacing: "-0.04em", overflow: "hidden", flexShrink: 0, boxShadow: "0 0 0 1px rgba(0,0,0,0.06)" }}>
      {friend.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={friend.avatarUrl} alt={friend.name} width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : initials(friend.name)}
    </div>
  );
}

function FriendName({ friend, small = false }: { friend: FriendLite; small?: boolean }) {
  const inner = (
    <span className="font-heading" style={{ fontWeight: 900, fontSize: small ? 12.5 : 16, letterSpacing: "-0.015em", color: tk.ink, display: "inline-flex", alignItems: "center", gap: 0, maxWidth: "100%" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{friend.name}</span>
      <NameplateMark nameplateKey={friend.isOfficial ? "support" : undefined} size="sm" />
    </span>
  );
  if (!friend.username) return inner;
  return <Link href={`/dashboard/user/players/${friend.username}`} style={{ display: "inline-flex", maxWidth: "100%", color: "inherit", textDecoration: "none" }}>{inner}</Link>;
}

function LevelChip({ level }: { level: number }) {
  return (
    <span
      className="tabular"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: 9999,
        background: tk.accentSoft,
        color: tk.accentDeep,
        fontWeight: 900,
        fontSize: 10,
        letterSpacing: "-0.02em",
      }}
    >
      {level.toFixed(2)}
    </span>
  );
}

function MiniStat({ label, value, accent = false, small = false }: { label: string; value: string | number; accent?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", color: tk.muted, textTransform: "uppercase" }}>{label}</div>
      <div className="tabular font-heading" style={{ marginTop: 3, fontWeight: 900, fontSize: small ? 11 : 16, color: accent ? tk.accent : tk.ink, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="card" style={{ padding: 34, textAlign: "center", color: tk.muted }}>
      <Icon name={icon} size={30} color={tk.muted} />
      <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: tk.ink }}>{title}<span className="dot">.</span></div>
      <p style={{ fontSize: 13, margin: "8px auto 0", maxWidth: 420, lineHeight: 1.45 }}>{text}</p>
    </div>
  );
}

/** Sin cruces confirmados: techo bajo (perfil). Con historial: sube con partidos y H2H. */
function affinityScore(friend: FriendLite, myCity: string | null, myLevel: number | null): number {
  const matches = friend.matchesTogether ?? 0;
  if (matches === 0) {
    let score = 22;
    if (myCity && friend.city === myCity) score += 14;
    if (myLevel != null) {
      score += Math.max(0, 18 - Math.round(Math.abs(friend.level - myLevel) * 12));
    }
    return Math.max(18, Math.min(52, score));
  }
  let score = 38;
  if (myCity && friend.city === myCity) score += 10;
  if (myLevel != null) {
    score += Math.max(0, 14 - Math.round(Math.abs(friend.level - myLevel) * 10));
  }
  score += Math.min(30, matches * 5);
  score += Math.min(10, (friend.h2hWins ?? 0) * 3 + (friend.h2hLosses ?? 0) * 2);
  if (isRecent(friend.lastPlayedAt)) score += 10;
  return Math.max(42, Math.min(98, score));
}

function suggestionReason(friend: FriendLite): string {
  if ((friend.matchesTogether ?? 0) > 0) return `${friend.matchesTogether} cruces confirmados · H2H ${friend.h2hWins ?? 0}-${friend.h2hLosses ?? 0}`;
  return `Nivel ${friend.level.toFixed(1)} · ${friend.city}. Aún no registran cruces confirmados.`;
}

function lastPlayedShort(value: string | null | undefined): string {
  if (!value) return "—";
  return formatRelativeDate(value).replace("Hace ", "");
}

function formatRelativeDate(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (!Number.isFinite(diff) || diff < day) return "Hoy";
  const days = Math.floor(diff / day);
  if (days < 7) return `Hace ${days} día${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Hace ${weeks} sem`;
  const months = Math.floor(days / 30);
  return `Hace ${months} mes${months === 1 ? "" : "es"}`;
}

function isRecent(value: string | null | undefined): boolean {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() <= 14 * 24 * 60 * 60 * 1000;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return hash;
}

function DiscoverPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const handle = setTimeout(() => {
      searchPlayers({ q: query.trim(), limit: 30 })
        .then((res) => {
          if (res.ok) setResults(res.data);
          else toast({ icon: "alert-triangle", title: res.error.message });
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query, toast]);

  const send = (player: PlayerSearchResult) => {
    startTransition(async () => {
      const result = await sendFriendRequest({ toUserId: player.userId });
      if (!result.ok) {
        toast({ icon: "alert-triangle", title: result.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `Solicitud enviada a ${player.displayName}` });
      setResults((prev) => prev.map((item) => item.userId === player.userId ? { ...item, relationship: "request_sent" } : item));
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="label-mp" style={{ marginBottom: 8 }}>Buscar en toda la app</div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: 11, color: tk.muted }}><Icon name="search" size={14} /></span>
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (value.trim().length < 2) {
                setResults([]);
                setLoading(false);
              } else {
                setLoading(true);
              }
            }}
            placeholder="Nombre o @username del jugador..."
            autoFocus
            className="mp-amigos-search"
            style={{ width: "100%", padding: "10px 14px 10px 36px", border: `1px solid ${tk.border}`, borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit" }}
          />
        </div>
        <div style={{ fontSize: 11, color: tk.muted, marginTop: 8 }}>
          {query.length < 2 ? "Empieza a escribir para buscar (mínimo 2 letras)." : loading ? "Buscando..." : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
        </div>
      </div>
      {results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map((player, index) => <DiscoverCard key={player.userId} player={player} avatarBg={REQ_AVATARS[index % REQ_AVATARS.length]} busy={pending} onSend={() => send(player)} />)}
        </div>
      )}
    </div>
  );
}

function DiscoverCard({ player, avatarBg, busy, onSend }: { player: PlayerSearchResult; avatarBg: string; busy: boolean; onSend: () => void }) {
  const relationship = player.relationship;
  const dim = relationship === "request_sent" || relationship === "friends";
  const disabled = dim || busy;
  const label = relationship === "request_sent" ? "Enviada" : relationship === "friends" ? "Amigos" : relationship === "request_received" ? "Aceptar en solicitudes" : "Enviar solicitud";
  const icon = relationship === "request_sent" ? "clock" : relationship === "friends" ? "users" : relationship === "request_received" ? "check" : "user-plus";
  const profile = (
    <>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: avatarBg, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, overflow: "hidden" }}>
        {player.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.avatarUrl} alt={player.displayName} width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : <span className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>{initials(player.displayName)}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-flex", alignItems: "center", gap: 0, maxWidth: "100%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.displayName}</span>
          <NameplateMark nameplateKey={player.isOfficial ? "support" : undefined} size="sm" />
        </div>
        <div style={{ fontSize: 11, color: tk.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.username ? `@${player.username}` : "Sin alias"}{player.city ? ` · ${player.city}` : ""}</div>
      </div>
    </>
  );
  return (
    <div className="card" style={{ padding: 14 }}>
      {player.username ? <Link href={`/dashboard/user/players/${player.username}`} style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>{profile}</Link> : <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{profile}</div>}
      <button type="button" className={disabled || relationship === "request_received" ? undefined : "mp-press"} onClick={relationship === "request_received" ? undefined : onSend} disabled={disabled || relationship === "request_received"} style={{ marginTop: 12, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: 0, background: dim ? tk.borderSoft : tk.ink, color: dim ? tk.muted : "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "inherit", cursor: disabled || relationship === "request_received" ? "default" : "pointer", opacity: busy ? 0.5 : 1, whiteSpace: "nowrap", transition: "background 160ms var(--ease-out), opacity 160ms var(--ease-out), transform 120ms var(--ease-out)" }}>
        <Icon name={icon} size={11} color={dim ? tk.muted : "#fff"} />{label}
      </button>
    </div>
  );
}
