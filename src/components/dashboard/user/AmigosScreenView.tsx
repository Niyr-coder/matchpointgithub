// Client view de AmigosScreen — recibe friends/requests/suggestions ya fetcheados.
"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import {
  acceptFriendRequest,
  searchPlayers,
  sendFriendRequest,
  type PlayerSearchResult,
} from "@/server/actions/friends";

export type FriendLite = {
  id: string;
  name: string;
  username: string | null;
  city: string;
  sport: string;
  level: number;
  // True para el perfil oficial MATCHPOINT. La card lo renderiza con
  // banner+logo MP, descripción corta y sin acciones Mensaje/Retar.
  isOfficial: boolean;
  // True si el user tiene MatchPoint+ activo. Muestra badge dorado en
  // la card. Derivado server-side via isPlanActive (cron-safe).
  isPremium: boolean;
};

export type RequestLite = FriendLite & {
  fromUserId: string;
};

type TabKey = "amigos" | "requests" | "sugerencias" | "descubrir";

const REQ_AVATARS = [
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function AmigosScreenView({
  friends,
  requests,
  suggestions,
  myCity,
  meUserId,
}: {
  friends: FriendLite[];
  requests: RequestLite[];
  suggestions: FriendLite[];
  myCity: string | null;
  meUserId: string | null;
}) {
  const [tab, setTab] = useState<TabKey>("amigos");
  const [q, setQ] = useState("");

  // Realtime: solicitudes nuevas, friendships nuevos.
  useRealtimeRefresh(
    meUserId
      ? [
          { table: "friend_requests", filter: `to_user_id=eq.${meUserId}` },
          { table: "friendships" },
        ]
      : [],
    { enabled: !!meUserId },
  );

  const tabs: { k: TabKey; l: string; n: number | null }[] = [
    { k: "amigos", l: "Mis amigos", n: friends.length },
    { k: "requests", l: "Solicitudes", n: requests.length },
    { k: "sugerencias", l: "Sugerencias", n: suggestions.length },
    { k: "descubrir", l: "Descubrir", n: null },
  ];

  const visibleList = useMemo(() => {
    const src = tab === "amigos" ? friends : tab === "sugerencias" ? suggestions : [];
    if (!q) return src;
    const needle = q.toLowerCase();
    return src.filter(
      (f) => f.name.toLowerCase().includes(needle) || f.city.toLowerCase().includes(needle),
    );
  }, [tab, q, friends, suggestions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="label-mp">Comunidad · Tu red de juego</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 className="font-heading display-md" style={{ margin: 0 }}>
          Amigos <span className="dot">●</span> {friends.length}
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: 11, color: "var(--muted-fg)" }}>
              <Icon name="search" size={13} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar amigos…"
              style={{
                padding: "9px 14px 9px 32px",
                border: "1px solid var(--border)",
                borderRadius: 9999,
                fontSize: 12.5,
                outline: "none",
                fontFamily: "inherit",
                minWidth: 220,
              }}
            />
          </div>
          <button className="btn btn-primary">
            <Icon name="user-plus" size={13} />
            Invitar
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "var(--muted)",
          borderRadius: 9999,
          alignSelf: "flex-start",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: "7px 16px",
              borderRadius: 9999,
              border: 0,
              background: tab === t.k ? "#fff" : "transparent",
              color: tab === t.k ? "#0a0a0a" : "var(--muted-fg)",
              fontWeight: tab === t.k ? 800 : 600,
              fontSize: 11.5,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: tab === t.k ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.l}
            {t.n !== null && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 900,
                  padding: "1px 6px",
                  borderRadius: 9999,
                  background: tab === t.k ? "#0a0a0a" : "transparent",
                  color: tab === t.k ? "#fff" : "var(--muted-fg)",
                  border: tab === t.k ? 0 : "1px solid var(--border)",
                }}
              >
                {t.n}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "descubrir" ? (
        <DiscoverPanel />
      ) : tab === "requests" ? (
        requests.length === 0 ? (
          <EmptyState
            icon="user-plus"
            title="Sin solicitudes pendientes"
            sub="Cuando alguien quiera ser tu amigo, aparecerá aquí."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.map((r, i) => (
              <div
                key={r.id}
                className="card"
                style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: REQ_AVATARS[i % REQ_AVATARS.length],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  <span className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>
                    {initials(r.name)}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                    Nivel {r.level.toFixed(1)} · {r.sport} · {r.city}
                  </div>
                </div>
                <button
                  className="btn"
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    padding: "8px 14px",
                  }}
                >
                  Rechazar
                </button>
                <button className="btn btn-primary">
                  <Icon name="check" size={12} />
                  Aceptar
                </button>
              </div>
            ))}
          </div>
        )
      ) : visibleList.length === 0 ? (
        <EmptyState
          icon={tab === "amigos" ? "users" : "user-plus"}
          title={
            tab === "amigos"
              ? friends.length === 0
                ? "Aún no tienes amigos en MatchPoint"
                : "Sin matches con esa búsqueda"
              : myCity == null
                ? "Configura tu ciudad para ver sugerencias"
                : `Sin jugadores nuevos en ${myCity}`
          }
          sub={
            tab === "amigos"
              ? "Acepta una solicitud o explora la pestaña de sugerencias."
              : "Pronto se sumarán más jugadores a tu zona."
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {visibleList.map((f, i) => (
            <FriendCard key={f.id} f={f} index={i} isSuggestion={tab === "sugerencias"} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div
      className="card"
      style={{
        padding: 40,
        textAlign: "center",
        color: "var(--muted-fg)",
      }}
    >
      <Icon name={icon} size={32} color="var(--muted-fg)" />
      <div
        className="font-heading"
        style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "#0a0a0a" }}
      >
        {title}
        <span className="dot">.</span>
      </div>
      <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>{sub}</p>
    </div>
  );
}

function FriendCard({
  f,
  index,
  isSuggestion,
}: {
  f: FriendLite;
  index: number;
  isSuggestion: boolean;
}) {
  // MATCHPOINT (perfil oficial): banner+logo MP, descripción corta,
  // sin Mensaje/Retar/rating/sport. Nombre clickable a su perfil oficial.
  if (f.isOfficial) {
    return <OfficialFriendCard f={f} />;
  }

  // Card normal de jugador. Nombre clickable a /players/[username] si existe.
  const profileHref = f.username ? `/dashboard/players/${f.username}` : null;
  const nameEl = (
    <div
      className="font-heading"
      style={{
        fontSize: 14,
        fontWeight: 900,
        letterSpacing: "-0.01em",
        lineHeight: 1.15,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {f.name}
      </span>
      {f.isPremium && <MpPlusBadge />}
    </div>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          position: "relative",
          height: 76,
          background: "linear-gradient(135deg, #064e3b, #10b981)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 70% 40%, rgba(255,255,255,0.15), transparent 60%)",
          }}
        />
      </div>
      <div style={{ padding: "0 16px 16px", position: "relative" }}>
        <div
          style={{
            marginTop: -34,
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: REQ_AVATARS[index % REQ_AVATARS.length],
                border: "4px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>
                {initials(f.name)}
              </span>
            </div>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 800,
              marginBottom: 6,
            }}
          >
            <Icon name="zap" size={10} color="#fbbf24" />
            {f.level.toFixed(1)}
          </div>
        </div>
        {profileHref ? (
          <Link
            href={profileHref}
            className="mp-friend-name-link"
            style={{ color: "inherit", textDecoration: "none", display: "block" }}
          >
            {nameEl}
          </Link>
        ) : (
          nameEl
        )}
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-fg)",
            marginTop: 2,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icon name="map-pin" size={10} />
          {f.city} · {f.sport}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {isSuggestion ? (
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 10.5, padding: "8px 10px" }}
            >
              <Icon name="user-plus" size={12} />
              Agregar
            </button>
          ) : (
            <>
              <button
                className="btn"
                style={{
                  flex: 1,
                  fontSize: 10.5,
                  padding: "8px 10px",
                  background: "#fff",
                  border: "1px solid var(--border)",
                }}
              >
                <Icon name="message-square" size={12} />
                Mensaje
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, fontSize: 10.5, padding: "8px 10px" }}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("mp-open-retar", {
                      detail: {
                        name: f.name,
                        level: f.level,
                        sport: f.sport,
                        city: f.city,
                        av: initials(f.name),
                        avBg: REQ_AVATARS[index % REQ_AVATARS.length],
                      },
                    }),
                  )
                }
              >
                <Icon name="swords" size={12} />
                Retar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Badge MP+ reusable ──────────────────────────────────────────────────
// Usado en FriendCard, RequestCard, DiscoverCard. Pequeño chip dorado
// junto al nombre. Tooltip "MatchPoint+".
function MpPlusBadge() {
  return (
    <span
      title="MatchPoint+ activo"
      aria-label="MatchPoint+ activo"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 5px",
        borderRadius: 4,
        background: "#facc15",
        color: "#0a0a0a",
        fontSize: 8.5,
        fontWeight: 900,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      <Icon name="crown" size={8} color="#0a0a0a" />
      MP+
    </span>
  );
}

// ── OfficialFriendCard: variante para MATCHPOINT ────────────────────────
// Banner+logo MP, descripción corta, sin acciones Mensaje/Retar (no se
// puede mensajear ni retar al perfil oficial). Nombre clickable a su
// página oficial (/dashboard/players/[username]).
function OfficialFriendCard({ f }: { f: FriendLite }) {
  const href = f.username ? `/dashboard/players/${f.username}` : null;
  const inner = (
    <>
      <div
        style={{
          position: "relative",
          height: 76,
          background:
            "linear-gradient(135deg, #064e3b 0%, #10b981 60%, #047857 100%)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.22), transparent 55%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            fontSize: 8.5,
            fontWeight: 900,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          ● OFICIAL
        </div>
      </div>
      <div style={{ padding: "0 16px 16px", position: "relative" }}>
        <div
          style={{
            marginTop: -34,
            marginBottom: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#10b981,#047857)",
              border: "4px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 22,
            }}
          >
            M
          </div>
        </div>
        <div
          className="font-heading"
          style={{
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {f.name}
          <span
            title="Cuenta oficial de la app"
            aria-label="Cuenta oficial de la app"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "var(--primary)",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            <Icon name="check" size={9} color="#fff" />
          </span>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--muted-fg)",
            marginTop: 6,
            lineHeight: 1.45,
          }}
        >
          Cuenta oficial de MatchPoint EC. Te enviamos novedades, recordatorios
          y respuestas de soporte.
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card mp-friend-official-card"
        style={{
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "inherit",
          textDecoration: "none",
        }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {inner}
    </div>
  );
}

// ── Descubrir: search global de jugadores en toda la app ────────────────
// Llama searchPlayers (debounced 350ms desde 2 chars). Por cada resultado
// muestra preview + botón cambiante según relationship.
function DiscoverPanel() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Debounce 350ms — evita spam de queries al server.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchPlayers({ q: q.trim(), limit: 30 })
        .then((res) => {
          if (res.ok) setResults(res.data);
          else toast({ icon: "alert-triangle", title: res.error.message });
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [q, toast]);

  const onSendRequest = (target: PlayerSearchResult) => {
    if (pending) return;
    startTransition(async () => {
      const r = await sendFriendRequest({ toUserId: target.userId });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `Solicitud enviada a ${target.displayName}` });
      setResults((prev) =>
        prev.map((p) =>
          p.userId === target.userId ? { ...p, relationship: "request_sent" } : p,
        ),
      );
    });
  };

  const onAccept = (target: PlayerSearchResult) => {
    if (pending) return;
    startTransition(async () => {
      // Necesitamos el requestId. Por ahora el shape de searchPlayers no lo
      // devuelve; lo dejamos como TODO honesto: abrir la tab "Solicitudes"
      // para aceptar desde ahí. Mejora futura: incluir requestId en el shape.
      toast({
        icon: "info",
        title: `${target.displayName} ya te envió solicitud`,
        sub: "Acéptala desde la pestaña Solicitudes.",
      });
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="label-mp" style={{ marginBottom: 8 }}>
          Buscar en toda la app
        </div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: 11, color: "var(--muted-fg)" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o @username del jugador…"
            autoFocus
            style={{
              width: "100%",
              padding: "10px 14px 10px 36px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 8 }}>
          {q.length < 2
            ? "Empieza a escribir para buscar (mínimo 2 letras)."
            : loading
              ? "Buscando…"
              : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {results.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {results.map((p, i) => (
            <DiscoverCard
              key={p.userId}
              player={p}
              avatarBg={REQ_AVATARS[i % REQ_AVATARS.length]}
              busy={pending}
              onSendRequest={() => onSendRequest(p)}
              onAccept={() => onAccept(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DiscoverCard({
  player,
  avatarBg,
  busy,
  onSendRequest,
  onAccept,
}: {
  player: PlayerSearchResult;
  avatarBg: string;
  busy: boolean;
  onSendRequest: () => void;
  onAccept: () => void;
}) {
  let ctaLabel = "Enviar solicitud";
  let ctaDisabled = false;
  let ctaIcon: string = "user-plus";
  let onClick: () => void = onSendRequest;
  let dim = false;

  // MATCHPOINT acepta automáticamente cualquier solicitud (trigger DB
  // tg_auto_accept_system_fr en mig 111). El flujo de Enviar Solicitud
  // funciona igual; en milisegundos pasa a "friends".
  if (player.relationship === "request_sent") {
    ctaLabel = "Enviada";
    ctaDisabled = true;
    ctaIcon = "clock";
    dim = true;
  } else if (player.relationship === "request_received") {
    ctaLabel = "Aceptar";
    ctaIcon = "check";
    onClick = onAccept;
  } else if (player.relationship === "friends") {
    ctaLabel = "Amigos";
    ctaDisabled = true;
    ctaIcon = "users";
    dim = true;
  }

  const isBlocked = ctaDisabled || busy;
  // Cualquier perfil con username es visitable. MATCHPOINT linkea a su
  // vista oficial (OfficialAccountView), otros usuarios a la VISTA PÚBLICA
  // de ProfileScreenView.
  const canVisitProfile = !!player.username;

  // Contenido del bloque avatar+name. Lo renderizamos dentro de un Link
  // (si canVisitProfile) o un div normal.
  const profileInner = (
    <>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: avatarBg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          flexShrink: 0,
        }}
      >
        <span className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>
          {initials(player.displayName)}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className={canVisitProfile ? "mp-discover-name" : undefined}
          style={{
            fontSize: 13,
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {player.displayName}
          </span>
          {player.isOfficial && (
            <span
              title="Cuenta oficial de la app"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--primary)",
                color: "#fff",
                flexShrink: 0,
              }}
              aria-label="Cuenta oficial de la app"
            >
              <Icon name="check" size={9} color="#fff" />
            </span>
          )}
          {!player.isOfficial && player.isPremium && <MpPlusBadge />}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {player.username ? `@${player.username}` : "Sin alias"}
          {player.city ? ` · ${player.city}` : ""}
        </div>
      </div>
    </>
  );

  return (
    <div className="card mp-discover-card" style={{ padding: 14 }}>
      {canVisitProfile ? (
        <Link
          href={`/dashboard/players/${player.username}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "inherit",
            textDecoration: "none",
          }}
        >
          {profileInner}
        </Link>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {profileInner}
        </div>
      )}
      {/* Botón full-width abajo: nunca se aplasta cuando el label crece y
          el row de avatar+name queda con respiración. */}
      <button
        type="button"
        onClick={onClick}
        disabled={isBlocked}
        className="mp-discover-cta"
        data-dim={dim ? "true" : "false"}
        style={{
          marginTop: 12,
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "9px 12px",
          borderRadius: 10,
          border: 0,
          background: dim ? "var(--muted)" : "#0a0a0a",
          color: dim ? "var(--muted-fg)" : "#fff",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontFamily: "inherit",
          cursor: isBlocked ? "default" : "pointer",
          pointerEvents: isBlocked && !busy ? "none" : "auto",
          opacity: busy ? 0.5 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <Icon name={ctaIcon} size={11} color={dim ? "var(--muted-fg)" : "#fff"} />
        {ctaLabel}
      </button>
    </div>
  );
}
