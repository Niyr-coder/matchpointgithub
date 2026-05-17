// Client view de MensajesScreen — UI del mock original, data real.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { markRead, sendMessage } from "@/server/actions/messaging";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type ConvoLite = {
  id: string;
  name: string;
  kind: "dm" | "group" | "support" | "club_channel";
  isGroup: boolean;
  isSystem: boolean;
  memberCount: number;
  lastBody: string | null;
  lastSenderId: string | null;
  lastAt: string | null;
  unreadCount: number;
  otherUserId: string | null;
};

export type MessageLite = {
  id: string;
  senderId: string;
  body: string;
  kind: string;
  createdAt: string;
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#374151,#6b7280)",
];

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
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

export function MensajesScreenView({
  convos,
  messages,
  activeConv,
  meUserId,
}: {
  convos: ConvoLite[];
  messages: MessageLite[];
  activeConv: ConvoLite | null;
  meUserId: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const router = useRouter();

  // Marca como leída la conversación activa al verla / cuando llega un mensaje nuevo.
  // Evita re-disparar si el último mensaje ya fue marcado.
  const lastMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeConv || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    // Si el último mensaje lo mandé yo, no hace falta marcar (ya es "leído" por mí).
    if (lastMsg.senderId === meUserId) {
      lastMarkedRef.current = lastMsg.id;
      return;
    }
    if (lastMarkedRef.current === lastMsg.id) return;
    lastMarkedRef.current = lastMsg.id;
    void markRead({ id: activeConv.id, body: { lastMessageId: lastMsg.id } }).then((res) => {
      if (res.ok) router.refresh();
    });
  }, [activeConv, messages, meUserId, router]);

  const handleSend = async () => {
    if (sending || !activeConv) return;
    const body = draft.trim();
    if (body.length === 0) return;
    setSending(true);
    try {
      const res = await sendMessage({
        id: activeConv.id,
        body: { body, kind: "text" },
      });
      if (res.ok) {
        setDraft("");
        router.refresh();
      } else {
        toast({
          icon: "x",
          title: "No se envió",
          sub: res.error.message,
        });
      }
    } finally {
      setSending(false);
    }
  };

  // Realtime: cualquier mensaje en la conv activa + cambios en mis convos.
  useRealtimeRefresh(
    [
      ...(activeConv ? [{ table: "messages", filter: `conversation_id=eq.${activeConv.id}` }] : []),
      { table: "conversations" },
      ...(meUserId ? [{ table: "conversation_members", filter: `user_id=eq.${meUserId}` }] : []),
    ],
    { enabled: !!meUserId },
  );

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "300px 1fr",
        minHeight: 640,
      }}
    >
      {/* Sidebar conversaciones */}
      <div
        style={{
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
              }}
            >
              Mensajes<span className="dot">.</span>
            </div>
            <button
              style={{
                width: 28,
                height: 28,
                borderRadius: 9999,
                background: "#0a0a0a",
                color: "#fff",
                border: 0,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="pen-square" size={13} color="#fff" />
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: 9,
                color: "var(--muted-fg)",
              }}
            >
              <Icon name="search" size={13} />
            </span>
            <input
              placeholder="Buscar conversación…"
              style={{
                width: "100%",
                padding: "7px 12px 7px 32px",
                border: "1px solid var(--border)",
                borderRadius: 9999,
                fontFamily: "inherit",
                fontSize: 12,
                outline: "none",
                background: "var(--muted)",
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {convos.length === 0 ? (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "var(--muted-fg)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              Sin conversaciones aún. Inicia una desde un perfil de amigo.
            </div>
          ) : (
            convos.map((c, i) => (
              <Link
                key={c.id}
                href={`?conv=${c.id}`}
                scroll={false}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  background: activeConv?.id === c.id ? "var(--muted)" : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: c.isGroup
                        ? "linear-gradient(135deg,#3730a3,#6366f1)"
                        : c.isSystem
                        ? "#0a0a0a"
                        : AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                    }}
                  >
                    {c.isGroup ? (
                      <Icon name="users" size={16} color="#fff" />
                    ) : c.isSystem ? (
                      <Icon name="building-2" size={16} color="#fff" />
                    ) : (
                      <span className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>
                        {initials(c.name)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: c.unreadCount ? 800 : 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {c.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--muted-fg)",
                        flexShrink: 0,
                        marginLeft: 6,
                      }}
                    >
                      {relTime(c.lastAt)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11.5,
                        color: c.unreadCount ? "#0a0a0a" : "var(--muted-fg)",
                        fontWeight: c.unreadCount ? 600 : 400,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}
                    >
                      {c.lastBody ?? (c.isGroup ? `${c.memberCount} miembros` : "Sin mensajes aún")}
                    </span>
                    {c.unreadCount > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 900,
                          background: "var(--primary)",
                          color: "#fff",
                          padding: "2px 7px",
                          borderRadius: 9999,
                          flexShrink: 0,
                        }}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "#fafafa",
        }}
      >
        {activeConv ? (
          <>
            <div
              style={{
                padding: "14px 22px",
                borderBottom: "1px solid var(--border)",
                background: "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: activeConv.isGroup
                      ? "linear-gradient(135deg,#3730a3,#6366f1)"
                      : activeConv.isSystem
                      ? "#0a0a0a"
                      : "linear-gradient(135deg,#10b981,#047857)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                  }}
                >
                  {activeConv.isGroup ? (
                    <Icon name="users" size={14} color="#fff" />
                  ) : activeConv.isSystem ? (
                    <Icon name="building-2" size={14} color="#fff" />
                  ) : (
                    <span className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>
                      {initials(activeConv.name)}
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{activeConv.name}</div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted-fg)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {activeConv.isGroup
                      ? `${activeConv.memberCount} miembros`
                      : activeConv.isSystem
                      ? "Canal del sistema"
                      : "Mensaje directo"}
                  </div>
                </div>
              </div>
              <button className="icon-btn">
                <Icon name="more-horizontal" size={14} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {messages.length > 0 && (
                <div
                  style={{
                    alignSelf: "center",
                    padding: "4px 12px",
                    background: "rgba(0,0,0,0.05)",
                    borderRadius: 9999,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--muted-fg)",
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    marginBottom: 8,
                  }}
                >
                  Hoy
                </div>
              )}
              {messages.map((m) => {
                const mine = m.senderId === meUserId;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: mine ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "60%",
                        padding: "10px 14px",
                        borderRadius: 16,
                        background: mine ? "var(--primary)" : "#fff",
                        color: mine ? "#fff" : "#0a0a0a",
                        border: mine ? 0 : "1px solid var(--border)",
                        fontSize: 13,
                        lineHeight: 1.4,
                        borderBottomRightRadius: mine ? 4 : 16,
                        borderBottomLeftRadius: mine ? 16 : 4,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.body}
                      <div
                        style={{
                          fontSize: 9.5,
                          marginTop: 4,
                          opacity: 0.65,
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 4,
                          alignItems: "center",
                        }}
                      >
                        {timeOnly(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div
                  style={{
                    margin: "auto",
                    textAlign: "center",
                    color: "var(--muted-fg)",
                    fontSize: 13,
                  }}
                >
                  Aún sin mensajes en esta conversación. Escribe el primero.
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              style={{
                padding: 16,
                borderTop: "1px solid var(--border)",
                background: "#fff",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <button type="button" className="icon-btn">
                <Icon name="paperclip" size={14} />
              </button>
              <button type="button" className="icon-btn">
                <Icon name="image" size={14} />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe un mensaje…"
                style={{
                  flex: 1,
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
                disabled={!draft.trim() || sending}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  color: "#fff",
                  border: 0,
                  cursor: draft.trim() && !sending ? "pointer" : "not-allowed",
                  opacity: draft.trim() && !sending ? 1 : 0.5,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={sending ? "loader" : "send"} size={14} color="#fff" />
              </button>
            </form>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 40,
              textAlign: "center",
              color: "var(--muted-fg)",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "#fff",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 18,
              }}
            >
              <Icon name="message-square" size={28} color="var(--muted-fg)" />
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
                color: "#0a0a0a",
              }}
            >
              Elige una conversación<span className="dot">.</span>
            </div>
            <p style={{ fontSize: 13, marginTop: 8, maxWidth: 320 }}>
              {convos.length === 0
                ? "Aún no tienes conversaciones. Inicia una desde un perfil de amigo."
                : "Selecciona un chat de la lista para ver los mensajes."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
