// Client view de AmigosScreen — recibe friends/requests/suggestions ya fetcheados.
"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type FriendLite = {
  id: string;
  name: string;
  city: string;
  sport: string;
  level: number;
};

export type RequestLite = FriendLite & {
  fromUserId: string;
};

type TabKey = "amigos" | "requests" | "sugerencias";

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

  const tabs: { k: TabKey; l: string; n: number }[] = [
    { k: "amigos", l: "Mis amigos", n: friends.length },
    { k: "requests", l: "Solicitudes", n: requests.length },
    { k: "sugerencias", l: "Sugerencias", n: suggestions.length },
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
          </button>
        ))}
      </div>

      {tab === "requests" ? (
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
        <div
          className="font-heading"
          style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.15 }}
        >
          {f.name}
        </div>
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
