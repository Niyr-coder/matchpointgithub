"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  updateSalesLeadAdmin,
  type AdminSalesData,
  type AdminSalesLead,
} from "@/server/actions/admin/sales";
import { SALES_LEAD_STATUSES, type SalesLeadPriority, type SalesLeadStatus } from "@/lib/sales/crm";
import { SALES_LEAD_TYPE_LABELS } from "@/lib/schemas/sales-leads";

type MutationResult = { ok: boolean; data?: AdminSalesLead; error?: { message: string } };

const STATUS_META: Record<SalesLeadStatus, { label: string; bg: string; color: string }> = {
  new: { label: "Nuevo", bg: "#eef2ff", color: "#3730a3" },
  qualified: { label: "Calificado", bg: "#ecfdf5", color: "#047857" },
  contacted: { label: "Contactado", bg: "#e0f2fe", color: "#0369a1" },
  demo_scheduled: { label: "Demo agendada", bg: "#fef3c7", color: "#92400e" },
  demo_completed: { label: "Demo realizada", bg: "#fef3c7", color: "#92400e" },
  pilot: { label: "Piloto", bg: "#f3e8ff", color: "#7e22ce" },
  proposal_sent: { label: "Propuesta enviada", bg: "#fff7ed", color: "#c2410c" },
  won: { label: "Ganado", bg: "#dcfce7", color: "#166534" },
  lost: { label: "Perdido", bg: "#fee2e2", color: "#991b1b" },
  nurture: { label: "Nutrir", bg: "var(--muted)", color: "var(--muted-fg)" },
};

const PRIORITY_META: Record<SalesLeadPriority, { label: string; color: string }> = {
  low: { label: "Baja", color: "var(--muted-fg)" },
  medium: { label: "Media", color: "#0369a1" },
  high: { label: "Alta", color: "#b91c1c" },
};

function money(cents: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dateLabel(iso: string | null): string {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function toInputDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromInputDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function leadTypeLabel(type: string): string {
  return SALES_LEAD_TYPE_LABELS[type as keyof typeof SALES_LEAD_TYPE_LABELS] ?? type;
}

function statusLabel(status: SalesLeadStatus): string {
  return STATUS_META[status].label;
}

function sourceLabel(sourceUrl: string | null, sourceCampaign: string | null): string {
  if (sourceCampaign) return sourceCampaign;
  if (!sourceUrl) return "Manual";
  try {
    return new URL(sourceUrl).pathname;
  } catch {
    return sourceUrl;
  }
}

function Pill({ status }: { status: SalesLeadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

export function AdminSalesScreenView({ initialData }: { initialData: AdminSalesData }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState<string | null>(initialData.leads[0]?.id ?? null);
  const [statusFilter, setStatusFilter] = useState<"all" | SalesLeadStatus>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [draftNotes, setDraftNotes] = useState(initialData.leads[0]?.notes ?? "");
  const [draftLostReason, setDraftLostReason] = useState(initialData.leads[0]?.lostReason ?? "");
  const [draftFollowUp, setDraftFollowUp] = useState(toInputDateTime(initialData.leads[0]?.nextFollowUpAt ?? null));
  const [pending, startTransition] = useTransition();

  useRealtimeRefresh([{ table: "sales_leads" }], { debounceMs: 4000 });

  const filtered = useMemo(() => {
    return data.leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (typeFilter !== "all" && lead.leadType !== typeFilter) return false;
      return true;
    });
  }, [data.leads, statusFilter, typeFilter]);

  const selected = data.leads.find((lead) => lead.id === selectedId) ?? filtered[0] ?? null;

  function syncSelected(next: AdminSalesLead | null) {
    setSelectedId(next?.id ?? null);
    setDraftNotes(next?.notes ?? "");
    setDraftLostReason(next?.lostReason ?? "");
    setDraftFollowUp(toInputDateTime(next?.nextFollowUpAt ?? null));
  }

  function replaceLead(next: AdminSalesLead) {
    setData((prev) => ({
      ...prev,
      leads: prev.leads.map((lead) => (lead.id === next.id ? next : lead)),
    }));
    syncSelected(next);
  }

  function run(fn: () => Promise<MutationResult>, okMessage: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok && res.data) {
        replaceLead(res.data);
        toast({ icon: "check", title: okMessage });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error?.message });
      }
    });
  }

  function updateSelected(patch: Record<string, unknown>, message: string) {
    if (!selected) return;
    run(() => updateSalesLeadAdmin({ leadId: selected.id, ...patch }) as Promise<MutationResult>, message);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Monetización · Ventas</div>
        <h1
          className="font-heading mp-admin-page-title"
          style={{
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            lineHeight: 1,
            margin: "8px 0 0",
          }}
        >
          CRM de ventas<span className="dot">.</span>
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
          Leads reales desde los formularios públicos. La lectura y edición son solo para admins.
        </p>
      </div>

      <div className="mp-admin-kpis-5">
        <Kpi label="Leads" value={String(data.totals.total)} icon="inbox" />
        <Kpi label="Nuevos" value={String(data.totals.newCount)} icon="sparkles" />
        <Kpi label="Demos" value={String(data.totals.demoCount)} icon="calendar-check" />
        <Kpi label="Seguimientos vencidos" value={String(data.totals.dueFollowUps)} icon="clock" />
        <Kpi label="Valor estimado" value={money(data.totals.expectedValueCents)} icon="wallet" />
      </div>

      <div className="mp-admin-sales-split">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="label-mp">Inbox</div>
              <h2 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
                Pipeline comercial<span className="dot">.</span>
              </h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | SalesLeadStatus)} style={selectStyle}>
                <option value="all">Todos los estados</option>
                {SALES_LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
                <option value="all">Todos los tipos</option>
                {Object.entries(SALES_LEAD_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 34, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
              No hay leads con estos filtros.
            </div>
          ) : (
            <div className="mp-table-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    <Th>Lead</Th>
                    <Th>Tipo</Th>
                    <Th>Estado</Th>
                    <Th>Seguimiento</Th>
                    <Th>Origen</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => syncSelected(lead)}
                      style={{
                        borderTop: "1px solid var(--border)",
                        cursor: "pointer",
                        background: selected?.id === lead.id ? "rgba(16,185,129,0.06)" : "#fff",
                      }}
                    >
                      <Td>
                        <div style={{ fontWeight: 900 }}>{lead.businessName ?? lead.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                          {lead.name} · {lead.email}
                        </div>
                      </Td>
                      <Td>{leadTypeLabel(lead.leadType)}</Td>
                      <Td><Pill status={lead.status} /></Td>
                      <Td>{dateLabel(lead.nextFollowUpAt)}</Td>
                      <Td>
                        <span style={{ color: "var(--muted-fg)", fontSize: 11 }}>
                          {sourceLabel(lead.sourceUrl, lead.sourceCampaign)}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card" style={{ padding: 18, position: "sticky", top: 90 }}>
          {selected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div className="label-mp">Detalle</div>
                    <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", margin: "4px 0 0", textTransform: "uppercase" }}>
                      {selected.businessName ?? selected.name}<span className="dot">.</span>
                    </h2>
                  </div>
                  <Pill status={selected.status} />
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 8, lineHeight: 1.5 }}>
                  {selected.name} · <a href={`mailto:${selected.email}`} style={{ color: "var(--primary)", fontWeight: 800 }}>{selected.email}</a>
                  {selected.phone ? <> · {selected.phone}</> : null}
                </div>
              </div>

              {selected.message && (
                <div style={{ padding: 12, borderRadius: 10, background: "var(--muted)", fontSize: 12.5, color: "#0a0a0a", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {selected.message}
                </div>
              )}

              <Field label="Estado">
                <select
                  value={selected.status}
                  disabled={pending}
                  onChange={(e) => updateSelected({ status: e.target.value }, "Estado actualizado")}
                  style={inputStyle}
                >
                  {SALES_LEAD_STATUSES.map((status) => (
                    <option key={status} value={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              </Field>

              <div className="mp-tournament-form-grid-2">
                <Field label="Prioridad">
                  <select
                    value={selected.priority}
                    disabled={pending}
                    onChange={(e) => updateSelected({ priority: e.target.value }, "Prioridad actualizada")}
                    style={inputStyle}
                  >
                    {Object.entries(PRIORITY_META).map(([value, meta]) => (
                      <option key={value} value={value}>{meta.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Próximo seguimiento">
                  <input
                    type="datetime-local"
                    value={draftFollowUp}
                    onChange={(e) => setDraftFollowUp(e.target.value)}
                    onBlur={() => updateSelected({ nextFollowUpAt: fromInputDateTime(draftFollowUp) }, "Seguimiento actualizado")}
                    disabled={pending}
                    style={inputStyle}
                  />
                </Field>
              </div>

              <Field label="Notas">
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={6}
                  maxLength={5000}
                  disabled={pending}
                  placeholder="Agrega próximos pasos, objeciones, ciudad, deporte o contexto de la llamada."
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>

              <Field label="Motivo de pérdida">
                <input
                  value={draftLostReason}
                  onChange={(e) => setDraftLostReason(e.target.value)}
                  maxLength={500}
                  disabled={pending}
                  placeholder="Solo si el lead se marca como perdido."
                  style={inputStyle}
                />
              </Field>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" disabled={pending} onClick={() => updateSelected({ notes: draftNotes, lostReason: draftLostReason || null, nextFollowUpAt: fromInputDateTime(draftFollowUp) }, "Lead guardado")}>
                  <Icon name="save" size={13} color="#fff" />
                  Guardar detalle
                </button>
                <button className="btn" disabled={pending} onClick={() => updateSelected({ status: "won" }, "Lead marcado como ganado")} style={{ background: "#fff", border: "1px solid var(--border)" }}>
                  Ganado
                </button>
                <button className="btn" disabled={pending} onClick={() => updateSelected({ status: "lost", lostReason: draftLostReason || "Sin motivo registrado" }, "Lead marcado como perdido")} style={{ background: "#fff", border: "1px solid var(--border)" }}>
                  Perdido
                </button>
              </div>

              <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.5 }}>
                Creado el {dateLabel(selected.occurredAt)}. Fuente: {selected.sourceUrl ?? "sin URL"}.
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
              Selecciona un lead para ver el detalle.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "#fff",
  fontSize: 12,
  fontFamily: "inherit",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "#fff",
  fontSize: 12.5,
  fontFamily: "inherit",
  outline: "none",
};

function Kpi({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={13} color="var(--primary)" />
        </span>
        <span className="label-mp">{label}</span>
      </div>
      <div className="font-heading" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="label-mp" style={{ fontSize: 9.5 }}>{label}</span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-fg)" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "12px 14px", fontSize: 12.5, verticalAlign: "top" }}>{children}</td>;
}
