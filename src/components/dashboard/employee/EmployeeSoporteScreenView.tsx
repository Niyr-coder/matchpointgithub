// Client view del EmployeeSoporteScreen — layout 1:1 del mock.
"use client";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { createTicket, updateTicketStatus } from "@/server/actions/support";

export type Status = "open" | "in-progress" | "closed";
export type TicketRow = {
  id: string;
  t: string;
  kind: string;
  when: string;
  st: Status;
};
export type SoporteData = {
  clubId: string | null;
  tickets: TicketRow[];
};

const ST_COLOR: Record<Status, string> = {
  open: "#dc2626",
  "in-progress": "#fbbf24",
  closed: "var(--primary)",
};
const ST_L: Record<Status, string> = {
  open: "ABIERTO",
  "in-progress": "EN CURSO",
  closed: "RESUELTO",
};

const SEVERITIES: [string, string][] = [
  ["Alta", "#dc2626"],
  ["Media", "#fbbf24"],
  ["Baja", "var(--muted-fg)"],
];

const PLACEHOLDER_COUNT = 3;

function TicketPlaceholderCard() {
  return (
    <div
      style={{
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--muted-fg)" }}>
          Sin tickets recientes
        </div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>— · —</div>
      </div>
      <RSPill bg="var(--muted-fg)">—</RSPill>
    </div>
  );
}

const CATEGORY_MAP: Record<string, "maintenance" | "system" | "customer" | "other"> = {
  Mantenimiento: "maintenance",
  "Sistema / POS": "system",
  Cliente: "customer",
  Otro: "other",
};

export function EmployeeSoporteScreenView({ data }: { data: SoporteData }) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [isStatusPending, startStatusTransition] = useTransition();
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [cat, setCat] = useState<string>("Mantenimiento");
  const [sev, setSev] = useState<"low" | "medium" | "high">("medium");
  const [desc, setDesc] = useState("");

  const handleSend = () => {
    if (!data.clubId) return;
    if (!desc.trim()) {
      toast({ icon: "alert-triangle", title: "Falta descripción" });
      return;
    }
    startTransition(async () => {
      const res = await createTicket({
        clubId: data.clubId,
        subject: desc.slice(0, 80),
        body: desc,
        category: CATEGORY_MAP[cat] ?? "other",
        severity: sev,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Ticket enviado" });
        setDesc("");
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "tickets", filter: `club_id=eq.${data.clubId}` },
          { table: "ticket_messages" },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const hasTickets = data.tickets.length > 0;

  return (
    <>
      <RSHeader
        label="Recepción · Soporte"
        title="Reportar problema"
        action={
          <button
            className="btn btn-primary"
            disabled={!data.clubId}
            style={{ opacity: data.clubId ? 1 : 0.5 }}
            onClick={() => {
              descRef.current?.focus();
              descRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <Icon name="plus" size={13} color="#fff" />
            Nuevo ticket
          </button>
        }
      />

      <div className="card" style={{ padding: 18 }}>
        <h2
          className="font-heading"
          style={{
            fontSize: 14,
            fontWeight: 900,
            textTransform: "uppercase",
            margin: "0 0 12px",
          }}
        >
          Nuevo reporte rápido<span className="dot">.</span>
        </h2>
        <div className="mp-grid-form-2 gap-2.5">
          <div>
            <div className="label-mp" style={{ marginBottom: 5 }}>
              Tipo
            </div>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              <option>Mantenimiento</option>
              <option>Sistema / POS</option>
              <option>Cliente</option>
              <option>Otro</option>
            </select>
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 5 }}>
              Severidad
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {SEVERITIES.map(([l, c]) => {
                const code = l === "Alta" ? "high" : l === "Media" ? "medium" : "low";
                const on = sev === code;
                return (
                  <button
                    key={l}
                    onClick={() => setSev(code)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 8,
                      border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: on ? "#ecfdf5" : "#fff",
                      fontWeight: 800,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      color: c,
                    }}
                  >
                    ● {l}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="label-mp" style={{ marginBottom: 5 }}>
              Descripción
            </div>
            <textarea
              ref={descRef}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Describe el problema con detalle…"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "inherit",
                minHeight: 80,
                resize: "none",
              }}
            />
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={handleSend}
          disabled={isPending || !data.clubId}
        >
          <Icon name="send" size={13} color="#fff" />
          {isPending ? "Enviando…" : "Enviar ticket"}
        </button>
      </div>

      <div className="label-mp">Tickets recientes del club</div>
      {hasTickets
        ? data.tickets.map((t) => (
            <div key={t.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>{t.t}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                    {t.kind} · {t.when}
                  </div>
                </div>
                <RSPill bg={ST_COLOR[t.st]}>{ST_L[t.st]}</RSPill>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {t.st === "open" && (
                  <button
                    className="btn"
                    style={{ fontSize: 10, padding: "5px 11px", background: "#fff", border: "1px solid var(--border)" }}
                    disabled={isStatusPending || !data.clubId}
                    onClick={() => {
                      startStatusTransition(async () => {
                        const res = await updateTicketStatus({ id: t.id, status: "in_progress" });
                        if (!res.ok) toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
                      });
                    }}
                  >
                    Marcar en curso
                  </button>
                )}
                {t.st === "in-progress" && (
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 10, padding: "5px 11px" }}
                    disabled={isStatusPending || !data.clubId}
                    onClick={() => {
                      startStatusTransition(async () => {
                        const res = await updateTicketStatus({ id: t.id, status: "resolved" });
                        if (!res.ok) toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
                      });
                    }}
                  >
                    <Icon name="check" size={11} color="#fff" />
                    Resolver
                  </button>
                )}
              </div>
            </div>
          ))
        : Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => <TicketPlaceholderCard key={i} />)}
    </>
  );
}
