// Client view de AdminSupportScreen — cola + historial + panel de atención.
"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { assignTicket, getTicket, replyToTicket, updateTicketStatus } from "@/server/actions/support";
import { useToast } from "../ToastProvider";
import { ticketStatusPalette } from "@/lib/support/ticket-display";
import type { Ticket, TicketDetail } from "@/lib/schemas/ops";

export type Prio = "alta" | "media" | "baja";
export type SupportView = "open" | "history";

export type TicketRow = {
  ticketId: string;
  assigneeId: string | null;
  id: string;
  who: string;
  subj: string;
  when: string;
  updatedWhen: string;
  prio: Prio;
  cat: string;
  status: Ticket["status"];
};

export type SupportData = {
  rows: TicketRow[];
  historyRows: TicketRow[];
  openCount: number;
  historyCount: number;
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

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        borderRadius: 9999,
        background: active ? "#0a0a0a" : "#fff",
        color: active ? "#fff" : "#0a0a0a",
        border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`,
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {label}
      <span style={{ opacity: active ? 0.75 : 0.55 }}>{count}</span>
    </button>
  );
}

function EmptyQueue({ message }: { message: string }) {
  return (
    <div className="card" style={{ padding: "28px 20px", textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)" }}>{message}</p>
    </div>
  );
}

export function AdminSupportScreenView({
  data,
  initialFocusTicketId = null,
  initialView = "open",
}: {
  data: SupportData;
  initialFocusTicketId?: string | null;
  initialView?: SupportView;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [actionBusy, setActionBusy] = useState(false);
  const [view, setView] = useState<SupportView>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(initialFocusTicketId);
  const [detailData, setDetailData] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState(false);

  useRealtimeRefresh([{ table: "tickets" }, { table: "ticket_messages" }], { debounceMs: 4000 });

  useEffect(() => {
    if (!selectedId) {
      setDetailData(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void getTicket({ id: selectedId }).then((res) => {
      if (cancelled) return;
      setDetailLoading(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cargar el ticket", sub: res.error.message });
        setSelectedId(null);
        return;
      }
      setDetailData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  const findRow = (ticketId: string) =>
    data.rows.find((r) => r.ticketId === ticketId) ?? data.historyRows.find((r) => r.ticketId === ticketId);

  const syncUrl = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const closeModal = () => {
    setSelectedId(null);
    syncUrl((params) => {
      params.delete("focus");
    });
  };

  const switchView = (next: SupportView) => {
    setView(next);
    syncUrl((params) => {
      if (next === "history") params.set("view", "history");
      else params.delete("view");
    });
  };

  const refreshDetail = async (ticketId: string) => {
    const res = await getTicket({ id: ticketId });
    if (res.ok) setDetailData(res.data);
  };

  const openTicket = (ticketId: string, assignIfNeeded = true) => {
    if (pending) return;
    startTransition(async () => {
      const row = findRow(ticketId);
      const isHistory = row ? ["resolved", "closed"].includes(row.status) : view === "history";
      const mine = row?.assigneeId === data.currentAdminId;
      if (!isHistory && assignIfNeeded && !mine && data.currentAdminId) {
        const res = await assignTicket({ id: ticketId, assigneeId: data.currentAdminId });
        if (!res.ok) {
          toast({ icon: "alert-triangle", title: "No se pudo asignar", sub: res.error.message });
          return;
        }
        toast({ icon: "check", title: "Ticket asignado a ti" });
        router.refresh();
      }
      setSelectedId(ticketId);
    });
  };

  const assignToMe = (ticketIds: string[]) => {
    if (pending || ticketIds.length === 0 || !data.currentAdminId) return;
    startTransition(async () => {
      const results = await Promise.all(
        ticketIds.map((id) => assignTicket({ id, assigneeId: data.currentAdminId })),
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
        if (ticketIds.length === 1) setSelectedId(ticketIds[0]!);
      }
      router.refresh();
    });
  };

  const sendReply = async () => {
    if (!selectedId || reply.trim().length < 1 || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await replyToTicket({
        id: selectedId,
        body: { body: reply.trim(), internal: internalNote },
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo enviar", sub: res.error.message });
        return;
      }
      setReply("");
      if (!internalNote) {
        const statusRes = await updateTicketStatus({ id: selectedId, status: "waiting_user" });
        if (!statusRes.ok) {
          toast({ icon: "alert-triangle", title: "Respuesta enviada, pero no se actualizó el estado", sub: statusRes.error.message });
        }
      }
      await refreshDetail(selectedId);
      router.refresh();
      toast({ icon: "check", title: internalNote ? "Nota interna guardada" : "Respuesta enviada" });
    } finally {
      setActionBusy(false);
    }
  };

  const setStatus = async (status: "waiting_user" | "resolved" | "closed") => {
    if (!selectedId || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await updateTicketStatus({ id: selectedId, status });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo actualizar", sub: res.error.message });
        return;
      }
      toast({
        icon: "check",
        title: status === "resolved" ? "Ticket resuelto" : status === "closed" ? "Ticket cerrado" : "Esperando respuesta del usuario",
      });
      if (status === "resolved" || status === "closed") {
        closeModal();
      } else {
        await refreshDetail(selectedId);
      }
      router.refresh();
    } finally {
      setActionBusy(false);
    }
  };

  const busy = pending || actionBusy;

  const isOpenView = view === "open";
  const activeRows = isOpenView ? data.rows : data.historyRows;
  const unassignedRows = data.rows.filter((r) => !r.assigneeId);

  const KPIS: [string, string, string][] = [
    ["SLA en riesgo", String(data.kpis.slaAtRisk), "#dc2626"],
    ["Alta prio", String(data.kpis.altaCount), "#dc2626"],
    ["Media", String(data.kpis.mediaCount), "#fbbf24"],
    ["Baja", String(data.kpis.bajaCount), "var(--muted-fg)"],
  ];

  const openCols: RSColumn<TicketRow>[] = [
    {
      k: "id",
      l: "ID",
      render: (t) => (
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "var(--muted-fg)" }}>
          {t.id}
        </span>
      ),
    },
    {
      k: "subj",
      l: "Asunto",
      render: (t) => (
        <button
          type="button"
          onClick={() => openTicket(t.ticketId, false)}
          style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>{t.subj}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t.who} · {t.cat}
            {t.assigneeId === data.currentAdminId ? " · asignado a ti" : t.assigneeId ? " · en curso" : ""}
          </div>
        </button>
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
      render: (t) => {
        const mine = t.assigneeId === data.currentAdminId;
        return (
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => openTicket(t.ticketId, !mine)}
            style={{ fontSize: 10.5 }}
          >
            {mine ? "Ver" : "Atender"}
          </button>
        );
      },
    },
  ];

  const historyCols: RSColumn<TicketRow>[] = [
    {
      k: "id",
      l: "ID",
      render: (t) => (
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "var(--muted-fg)" }}>
          {t.id}
        </span>
      ),
    },
    {
      k: "subj",
      l: "Asunto",
      render: (t) => (
        <button
          type="button"
          onClick={() => openTicket(t.ticketId, false)}
          style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>{t.subj}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {t.who} · {t.cat}
          </div>
        </button>
      ),
    },
    {
      k: "status",
      l: "Estado",
      render: (t) => {
        const p = ticketStatusPalette(t.status);
        return <RSPill bg={p.bg}>{p.l}</RSPill>;
      },
    },
    {
      k: "updatedWhen",
      l: "Cerrado",
      render: (t) => <span style={{ color: "var(--muted-fg)" }}>{t.updatedWhen}</span>,
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (t) => (
        <button
          className="btn"
          disabled={pending}
          onClick={() => openTicket(t.ticketId, false)}
          style={{ fontSize: 10.5, background: "#fff", border: "1px solid var(--border)" }}
        >
          Ver hilo
        </button>
      ),
    },
  ];

  const selectedRow = selectedId ? findRow(selectedId) : null;
  const isClosedTicket =
    detailData != null && ["resolved", "closed"].includes(detailData.ticket.status);

  return (
    <>
      <RSHeader
        label="Plataforma · Soporte"
        title={
          isOpenView ? (
            <>
              Tickets <span className="dot">●</span> {data.openCount} abiertos
            </>
          ) : (
            <>Historial · {data.historyCount} resueltos o cerrados</>
          )
        }
        action={
          isOpenView ? (
            <button
              className="btn btn-primary"
              disabled={pending || unassignedRows.length === 0 || !data.currentAdminId}
              onClick={() => assignToMe(unassignedRows.map((r) => r.ticketId))}
            >
              <Icon name="user" size={13} />
              Asignar a mí
            </button>
          ) : null
        }
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <TabButton
          active={isOpenView}
          onClick={() => switchView("open")}
          label="Cola abierta"
          count={data.openCount}
        />
        <TabButton
          active={!isOpenView}
          onClick={() => switchView("history")}
          label="Historial"
          count={data.historyCount}
        />
      </div>

      {isOpenView ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {KPIS.map(([l, v, c]) => (
            <div key={l} className="card" style={{ padding: 14 }}>
              <div className="label-mp">{l}</div>
              <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, marginTop: 5, color: c }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeRows.length > 0 ? (
        <RSTable cols={isOpenView ? openCols : historyCols} rows={activeRows} rowKey={(t) => t.ticketId} />
      ) : (
        <EmptyQueue
          message={
            isOpenView
              ? "No hay tickets abiertos en la cola."
              : "Aún no hay tickets resueltos ni cerrados."
          }
        />
      )}

      {selectedId ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={closeModal}
        >
          <div
            className="card"
            style={{
              width: "min(640px, 100%)",
              maxHeight: "min(85vh, 780px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="label-mp" style={{ color: "var(--primary)" }}>
                  {detailData?.ticket.code ?? selectedRow?.id ?? "Ticket"}
                </div>
                <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
                  {detailData?.ticket.subject ?? selectedRow?.subj ?? "Cargando…"}
                </h3>
                {detailData ? (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-fg)" }}>
                    {selectedRow?.who ?? "Usuario"} · {ticketStatusPalette(detailData.ticket.status).l} · {detailData.ticket.category}
                  </div>
                ) : null}
              </div>
              <button type="button" className="btn" style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 10px" }} onClick={closeModal} aria-label="Cerrar">
                <Icon name="x" size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {detailLoading ? (
                <p style={{ color: "var(--muted-fg)", fontSize: 13 }}>Cargando conversación…</p>
              ) : (
                (detailData?.messages ?? []).map((m) => {
                  const isInternal = m.internal;
                  const isOpener = m.authorId === detailData?.ticket.openerId;
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isOpener ? "flex-start" : "flex-end",
                        maxWidth: "88%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: isInternal ? "#fef3c7" : isOpener ? "var(--muted)" : "var(--color-mp-primary-light)",
                        border: isInternal ? "1px dashed #fbbf24" : "1px solid transparent",
                        fontSize: 13,
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {isInternal ? (
                        <div className="label-mp" style={{ fontSize: 9, color: "#92400e", marginBottom: 4 }}>
                          Nota interna
                        </div>
                      ) : null}
                      {m.body}
                    </div>
                  );
                })
              )}
            </div>

            {isClosedTicket ? (
              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--muted-fg)" }}>
                Ticket cerrado — solo lectura del hilo.
              </div>
            ) : detailData ? (
              <>
                <div style={{ padding: "12px 20px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn" style={{ fontSize: 10.5, background: "#fff", border: "1px solid var(--border)" }} disabled={busy} onClick={() => void setStatus("waiting_user")}>
                    Pedir info
                  </button>
                  <button type="button" className="btn" style={{ fontSize: 10.5, background: "#fff", border: "1px solid var(--border)" }} disabled={busy} onClick={() => void setStatus("resolved")}>
                    Resolver
                  </button>
                  <button type="button" className="btn" style={{ fontSize: 10.5, background: "#fff", border: "1px solid var(--border)" }} disabled={busy} onClick={() => void setStatus("closed")}>
                    Cerrar
                  </button>
                </div>
                <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--muted-fg)", cursor: "pointer" }}>
                    <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} />
                    Nota interna (no la ve el usuario)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={internalNote ? "Nota para el equipo…" : "Respuesta al usuario…"}
                      disabled={busy}
                      style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13 }}
                    />
                    <button type="button" className="btn btn-primary" disabled={busy || !reply.trim()} onClick={() => void sendReply()}>
                      {busy ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
