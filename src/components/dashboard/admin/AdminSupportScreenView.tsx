// Client view de AdminSupportScreen — layout 1:1 (RoleScreens2.jsx 33-57).
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { assignTicket } from "@/server/actions/support";
import { useToast } from "../ToastProvider";

export type Prio = "alta" | "media" | "baja";
export type TicketRow = {
  ticketId: string;
  assigneeId: string | null;
  id: string;
  who: string;
  subj: string;
  when: string;
  prio: Prio;
  cat: string;
};
export type SupportData = {
  rows: TicketRow[];
  openCount: number;
  currentAdminId: string;
  kpis: {
    slaAtRisk: number;
    altaCount: number;
    mediaCount: number;
    bajaCount: number;
  };
};

const PRIO_C: Record<Prio, string> = {
  alta: "#dc2626",
  media: "#fbbf24",
  baja: "var(--muted-fg)",
};

const PLACEHOLDER_COUNT = 4;

function TicketPlaceholderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 130px 110px 90px",
        alignItems: "center",
        padding: "14px 16px",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "var(--muted-fg)" }}>
        #—
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)" }}>Sin tickets</div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>— · —</div>
      </div>
      <span style={{ color: "var(--muted-fg)" }}>—</span>
      <RSPill bg="var(--muted-fg)">—</RSPill>
      <span />
    </div>
  );
}

export function AdminSupportScreenView({ data }: { data: SupportData }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  useRealtimeRefresh([{ table: "tickets" }, { table: "ticket_messages" }], { debounceMs: 4000 });

  const hasRows = data.rows.length > 0;
  const unassignedRows = data.rows.filter((r) => !r.assigneeId);

  const assignToMe = (ticketIds: string[]) => {
    if (pending || ticketIds.length === 0 || !data.currentAdminId) return;
    startTransition(async () => {
      const results = await Promise.all(
        ticketIds.map((id) =>
          assignTicket({ id, assigneeId: data.currentAdminId }),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        toast({
          icon: "alert-triangle",
          title: failed === ticketIds.length
            ? "No se pudieron asignar los tickets"
            : `Se asignaron ${ticketIds.length - failed} de ${ticketIds.length} tickets`,
        });
      } else {
        toast({
          icon: "check",
          title: ticketIds.length === 1 ? "Ticket asignado a ti" : "Tickets asignados a ti",
        });
      }
      router.refresh();
    });
  };

  const KPIS: [string, string, string][] = [
    ["SLA en riesgo", String(data.kpis.slaAtRisk), "#dc2626"],
    ["Alta prio", String(data.kpis.altaCount), "#dc2626"],
    ["Media", String(data.kpis.mediaCount), "#fbbf24"],
    ["Baja", String(data.kpis.bajaCount), "var(--muted-fg)"],
  ];

  const cols: RSColumn<TicketRow>[] = [
    {
      k: "id",
      l: "ID",
      render: (t) => (
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10.5,
            color: "var(--muted-fg)",
          }}
        >
          {t.id}
        </span>
      ),
    },
    {
      k: "subj",
      l: "Asunto",
      render: (t) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>{t.subj}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t.who} · {t.cat}
          </div>
        </div>
      ),
    },
    {
      k: "when",
      l: "Abierto",
      render: (t) => <span style={{ color: "var(--muted-fg)" }}>{t.when}</span>,
    },
    { k: "prio", l: "Prioridad", render: (t) => <RSPill bg={PRIO_C[t.prio]}>{t.prio}</RSPill> },
    {
      k: "a",
      l: "",
      align: "right",
      render: (t) => (
        <button
          className="btn btn-primary"
          disabled={pending || t.assigneeId === data.currentAdminId}
          onClick={() => assignToMe([t.ticketId])}
          style={{ fontSize: 10.5 }}
        >
          Atender
        </button>
      ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Plataforma · Soporte"
        title={
          <>
            Tickets <span className="dot">●</span> {data.openCount} abiertos
          </>
        }
        action={
          <button
            className="btn btn-primary"
            disabled={pending || unassignedRows.length === 0 || !data.currentAdminId}
            onClick={() => assignToMe(unassignedRows.map((r) => r.ticketId))}
          >
            <Icon name="user" size={13} />
            Asignar a mí
          </button>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {KPIS.map(([l, v, c]) => (
          <div key={l} className="card" style={{ padding: 14 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading"
              style={{ fontSize: 22, fontWeight: 900, marginTop: 5, color: c }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
      {hasRows ? (
        <RSTable cols={cols} rows={data.rows} rowKey={(t) => t.id} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => (
            <TicketPlaceholderRow key={k} />
          ))}
        </div>
      )}
    </>
  );
}
