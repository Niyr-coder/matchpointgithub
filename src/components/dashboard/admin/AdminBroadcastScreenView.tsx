// Client view de AdminBroadcastScreen — layout 1:1 (AdminPower.jsx 267-360).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { cancelBroadcast, createBroadcast, dispatchBroadcast } from "@/server/actions/marketing";

export type Kind = "push" | "email" | "banner" | "in-app";
export type SentRow = {
  id: string;
  t: string;
  kind: Kind;
  audience: string;
  reach: string;
  open: string;
  when: string;
};
export type DraftRow = {
  id: string;
  t: string;
  kind: Kind;
  audience: string;
  scheduled: string;
  st: "live" | "scheduled";
};
export type BroadcastData = { sent: SentRow[]; drafts: DraftRow[] };

const KIND_I: Record<Kind, string> = {
  push: "smartphone",
  email: "mail",
  banner: "megaphone",
  "in-app": "message-square",
};
const KIND_C: Record<Kind, string> = {
  push: "#7c3aed",
  email: "#0ea5e9",
  banner: "#fbbf24",
  "in-app": "var(--primary)",
};

const COMPOSER_TYPES: { k: Kind; l: string; i: string }[] = [
  { k: "push", l: "Push", i: "smartphone" },
  { k: "email", l: "Email", i: "mail" },
  { k: "banner", l: "Banner", i: "megaphone" },
  { k: "in-app", l: "In-app", i: "message-square" },
];

const PLACEHOLDER_SENT_COUNT = 3;
const PLACEHOLDER_DRAFT_COUNT = 2;

function DraftPlaceholder() {
  return (
    <div
      style={{
        padding: 14,
        display: "grid",
        gridTemplateColumns: "36px 1fr auto auto",
        gap: 14,
        alignItems: "center",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: "var(--muted)",
          color: "var(--muted-fg)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="bell" size={16} color="var(--muted-fg)" />
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--muted-fg)" }}>Sin programadas</div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>— · —</div>
      </div>
      <RSPill bg="var(--muted-fg)">—</RSPill>
      <span />
    </div>
  );
}

function SentPlaceholderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "50px 1fr 1fr 90px 90px 100px",
        alignItems: "center",
        padding: "14px 16px",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "var(--muted)",
          color: "var(--muted-fg)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="bell" size={13} color="var(--muted-fg)" />
      </div>
      <span style={{ fontWeight: 800, color: "var(--muted-fg)" }}>Sin envíos</span>
      <span style={{ color: "var(--muted-fg)" }}>—</span>
      <b className="font-heading" style={{ textAlign: "right", color: "var(--muted-fg)" }}>—</b>
      <b style={{ textAlign: "right", color: "var(--muted-fg)" }}>—</b>
      <span style={{ color: "var(--muted-fg)" }}>—</span>
    </div>
  );
}

export function AdminBroadcastScreenView({ data }: { data: BroadcastData }) {
  useRealtimeRefresh([{ table: "broadcasts" }, { table: "broadcast_recipients" }], { debounceMs: 4000 });
  const toast = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("push");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const handleCancel = async (id: string, label: string) => {
    if (cancellingId) return;
    if (!window.confirm(`Cancelar la campaña "${label}"?`)) return;
    setCancellingId(id);
    try {
      const res = await cancelBroadcast({ id });
      if (res.ok) {
        toast({ icon: "check", title: "Campaña cancelada", sub: label });
        router.refresh();
      } else {
        const msg =
          res.error.code === "BROADCASTS.NOT_CANCELLABLE"
            ? "Ya fue enviada — no se puede cancelar"
            : res.error.message;
        toast({ icon: "x", title: "No se pudo cancelar", sub: msg });
      }
    } finally {
      setCancellingId(null);
    }
  };

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      toast({ icon: "alert-triangle", title: "Falta título o mensaje" });
      return;
    }
    startTransition(async () => {
      const channel = kind === "in-app" || kind === "banner" ? "inapp" : kind;
      const created = await createBroadcast({
        scope: "platform",
        title,
        body,
        channels: [channel],
        targetFilter: {},
      });
      if (!created.ok) {
        toast({ icon: "alert-triangle", title: "Error", sub: created.error.message });
        return;
      }
      const dispatched = await dispatchBroadcast({ id: created.data.id });
      if (!dispatched.ok) {
        toast({
          icon: "alert-triangle",
          title: "Borrador creado, pero no se envió",
          sub: dispatched.error.message,
        });
        return;
      }
      toast({
        icon: "send",
        title: dispatched.data.sent > 0 ? "Campaña enviada" : "Campaña enviada (sin destinatarios)",
        sub: `${dispatched.data.sent} ${dispatched.data.sent === 1 ? "destinatario" : "destinatarios"}`,
      });
      setTitle("");
      setBody("");
    });
  };

  const hasSent = data.sent.length > 0;
  const hasDrafts = data.drafts.length > 0;

  const cols: RSColumn<SentRow>[] = [
    {
      k: "kind",
      l: "Tipo",
      render: (x) => (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: KIND_C[x.kind],
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={KIND_I[x.kind]} size={13} color="#fff" />
        </div>
      ),
    },
    { k: "t", l: "Mensaje", render: (x) => <span style={{ fontWeight: 800 }}>{x.t}</span> },
    { k: "audience", l: "Audiencia" },
    {
      k: "reach",
      l: "Alcance",
      align: "right",
      render: (x) => <b className="font-heading">{x.reach}</b>,
    },
    {
      k: "open",
      l: "Open rate",
      align: "right",
      render: (x) => <b style={{ color: x.open === "—" ? "var(--muted-fg)" : "var(--primary)" }}>{x.open}</b>,
    },
    {
      k: "when",
      l: "Enviado",
      render: (x) => <span style={{ color: "var(--muted-fg)" }}>{x.when}</span>,
    },
  ];

  return (
    <>
      <PolHero
        tone="dark"
        wm="BROADCAST"
        accent="#fbbf24"
        label="Plataforma · Comunicaciones masivas"
        title="Habla con todos"
        sub="Push, email, banner y mensajes in-app. Segmenta por rol, ciudad, nivel o actividad."
        right={
          <button className="btn btn-primary">
            <Icon name="send" size={13} />
            Nueva campaña
          </button>
        }
      />

      <div className="card" style={{ padding: 22 }}>
        <div className="label-mp" style={{ marginBottom: 12 }}>
          Composer · enviar ahora
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 220px", gap: 14 }}>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Tipo
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {COMPOSER_TYPES.map((o) => {
                const on = kind === o.k;
                return (
                  <button
                    key={o.k}
                    onClick={() => setKind(o.k)}
                    style={{
                      padding: "10px 6px",
                      borderRadius: 8,
                      border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: on ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <Icon name={o.i} size={13} color={on ? "var(--primary)" : "#0a0a0a"} />
                    <div style={{ fontSize: 10, fontWeight: 800, marginTop: 4 }}>{o.l}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Contenido
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título corto · 60 caracteres"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12.5,
                fontFamily: "inherit",
                marginBottom: 8,
              }}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Texto del mensaje…"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "inherit",
                minHeight: 64,
                resize: "none",
              }}
            />
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Audiencia
            </div>
            <select
              defaultValue=""
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "inherit",
                marginBottom: 8,
              }}
            >
              <option value="">Selecciona audiencia…</option>
              <option>Toda la plataforma</option>
              <option>Owners de club</option>
              <option>Coaches</option>
              <option>Usuarios sin actividad 30d</option>
            </select>
            <div
              style={{
                padding: "8px 11px",
                background: "var(--muted)",
                borderRadius: 8,
                fontSize: 11,
                marginBottom: 8,
              }}
            >
              <span style={{ color: "var(--muted-fg)" }}>Alcance estimado: </span>
              <b style={{ color: "var(--primary)" }}>—</b>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleSend}
              disabled={isPending}
            >
              <Icon name="send" size={12} />
              {isPending ? "Enviando…" : "Enviar ahora"}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: "4px 0 12px",
          }}
        >
          Programadas & automatizaciones<span className="dot">.</span>
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hasDrafts
            ? data.drafts.map((d) => (
                <div
                  key={d.id}
                  className="card"
                  style={{
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "36px 1fr auto auto",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: KIND_C[d.kind],
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={KIND_I[d.kind]} size={16} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 900 }}>{d.t}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                      {d.audience} · {d.scheduled}
                    </div>
                  </div>
                  <RSPill bg={d.st === "live" ? "var(--primary)" : "#fbbf24"}>
                    {d.st === "live" ? "● ACTIVA" : "⏱ PROGRAMADA"}
                  </RSPill>
                  <button
                    onClick={() => handleCancel(d.id, d.t)}
                    disabled={cancellingId === d.id}
                    className="btn"
                    style={{
                      background: "#fff",
                      border: "1px solid #fca5a5",
                      color: "#b91c1c",
                      fontSize: 10.5,
                      opacity: cancellingId === d.id ? 0.6 : 1,
                    }}
                  >
                    {cancellingId === d.id ? "Cancelando…" : "Cancelar"}
                  </button>
                </div>
              ))
            : Array.from({ length: PLACEHOLDER_DRAFT_COUNT }).map((_, k) => (
                <DraftPlaceholder key={k} />
              ))}
        </div>
      </div>

      <div>
        <h2
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: "4px 0 12px",
          }}
        >
          Últimos envíos<span className="dot">.</span>
        </h2>
        {hasSent ? (
          <RSTable cols={cols} rows={data.sent} rowKey={(x) => x.id} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: PLACEHOLDER_SENT_COUNT }).map((_, k) => (
              <SentPlaceholderRow key={k} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
