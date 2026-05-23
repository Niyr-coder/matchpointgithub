"use client";

// Reusable approval queue.
// W1 (MAT-4) builds it; W2 (MAT-5) reuses it for club membership payments.
// Anatomy spec: docs/ux/ApprovalQueue.md (UX Kit Ola A §1).
//
// - Table on >=768px, cards on <768px.
// - Click row or "Ver" → right slide-in drawer with renderDetail.
// - Approve fires onApprove(item) after a confirm dialog (irreversible notice).
// - Reject fires onReject(item, reason) — reason required, with quick templates.
// - Toast/refresh are the consumer's responsibility; drawer auto-closes on success.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

export type ApprovalQueueColumn<T> = {
  key: string;
  label: string;
  render: (item: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: number;
  hideOnMobile?: boolean;
};

export type ApprovalQueueProps<T> = {
  items: T[];
  columns: ApprovalQueueColumn<T>[];
  getItemId: (item: T) => string;
  getItemSearchText?: (item: T) => string;
  isLoading?: boolean;
  emptyState?: { title: string; description?: string; icon?: string };
  errorState?: { title: string; onRetry?: () => void } | null;

  renderDetail: (item: T) => ReactNode;
  detailTitle: (item: T) => string;
  detailSubtitle?: (item: T) => string;

  onApprove: (item: T) => Promise<void>;
  onReject: (item: T, reason: string) => Promise<void>;
  approveLabel?: string;
  rejectLabel?: string;
  approveConfirmTitle?: (item: T) => string;
  approveConfirmBody?: (item: T) => string;
  irreversibleNotice?: string;
  rejectTemplates?: string[];

  searchPlaceholder?: string;
  pendingNoun?: { singular: string; plural: string };
};

const DEFAULT_REJECT_TEMPLATES = [
  "Comprobante ilegible. Por favor, súbelo de nuevo en mejor calidad.",
  "Monto no coincide con el del plan/featuring solicitado.",
  "Datos del pago no coinciden con el comprobante.",
];

export function ApprovalQueue<T>({
  items,
  columns,
  getItemId,
  getItemSearchText,
  isLoading,
  emptyState,
  errorState,
  renderDetail,
  detailTitle,
  detailSubtitle,
  onApprove,
  onReject,
  approveLabel = "Aprobar",
  rejectLabel = "Rechazar",
  approveConfirmTitle,
  approveConfirmBody,
  irreversibleNotice = "Esta acción no se puede deshacer.",
  rejectTemplates = DEFAULT_REJECT_TEMPLATES,
  searchPlaceholder,
  pendingNoun = { singular: "pendiente", plural: "pendientes" },
}: ApprovalQueueProps<T>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<T | null>(null);
  const [rejecting, setRejecting] = useState<T | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim() || !getItemSearchText) return items;
    const q = search.trim().toLowerCase();
    return items.filter((it) => getItemSearchText(it).toLowerCase().includes(q));
  }, [items, search, getItemSearchText]);

  const openItem = openId == null ? null : items.find((i) => getItemId(i) === openId) ?? null;

  const closeDrawer = useCallback(() => setOpenId(null), []);

  const handleApproveClick = (item: T) => setConfirming(item);
  const handleRejectClick = (item: T) => setRejecting(item);

  const doApprove = async (item: T) => {
    const id = getItemId(item);
    setBusyId(id);
    try {
      await onApprove(item);
      setConfirming(null);
      if (openId === id) setOpenId(null);
    } finally {
      setBusyId(null);
    }
  };

  const doReject = async (item: T, reason: string) => {
    const id = getItemId(item);
    setBusyId(id);
    try {
      await onReject(item, reason);
      setRejecting(null);
      if (openId === id) setOpenId(null);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <QueueSkeleton columns={columns} />;
  if (errorState) {
    return (
      <div
        style={{
          padding: "28px 16px",
          border: "1px dashed var(--border)",
          borderRadius: 12,
          textAlign: "center",
          background: "#fff",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Icon name="alert-triangle" size={22} color="#b45309" />
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
          {errorState.title}
        </div>
        {errorState.onRetry && (
          <button className="btn btn-outline" onClick={errorState.onRetry}>
            <Icon name="refresh-cw" size={12} /> Reintentar
          </button>
        )}
      </div>
    );
  }

  if (filtered.length === 0) {
    const e = emptyState ?? {
      title: "Todo al día",
      description: "No hay items pendientes de aprobación.",
    };
    return (
      <div
        style={{
          padding: "28px 16px",
          border: "1px dashed var(--border)",
          borderRadius: 12,
          textAlign: "center",
          background: "#fff",
          color: "var(--muted-fg)",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Icon name={e.icon ?? "check-circle-2"} size={22} color="#047857" />
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a" }}>{e.title}</div>
        {e.description && (
          <div style={{ fontSize: 11.5, marginTop: 6 }}>{e.description}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(getItemSearchText || searchPlaceholder) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {getItemSearchText && (
            <div
              style={{
                position: "relative",
                flex: "1 1 240px",
                minWidth: 200,
                maxWidth: 360,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted-fg)",
                  pointerEvents: "none",
                }}
              >
                <Icon name="search" size={13} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder ?? "Buscar…"}
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 30px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  outline: "none",
                  background: "#fff",
                }}
              />
            </div>
          )}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            ● {filtered.length}{" "}
            {filtered.length === 1 ? pendingNoun.singular : pendingNoun.plural}
          </span>
        </div>
      )}

      {/* Desktop table */}
      <div
        className="aq-table-wrap"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--muted)" }}>
              <th style={{ width: 18, padding: "10px 4px 10px 14px" }} aria-hidden />
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.hideOnMobile ? "aq-hide-mobile" : undefined}
                  style={{
                    padding: "10px 12px",
                    textAlign: c.align ?? "left",
                    fontSize: 9.5,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--muted-fg)",
                    whiteSpace: "nowrap",
                    width: c.width,
                  }}
                >
                  {c.label}
                </th>
              ))}
              <th style={{ padding: "10px 14px 10px 12px", textAlign: "right" }}>
                <span className="aq-sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const id = getItemId(item);
              const isBusy = busyId === id;
              return (
                <tr
                  key={id}
                  onClick={() => setOpenId(id)}
                  style={{
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) e.stopPropagation();
                  }}
                >
                  <td style={{ padding: "12px 4px 12px 14px", verticalAlign: "middle" }}>
                    <span
                      aria-hidden
                      title="Pendiente"
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#f59e0b",
                      }}
                    />
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={c.hideOnMobile ? "aq-hide-mobile" : undefined}
                      style={{
                        padding: "12px",
                        textAlign: c.align ?? "left",
                        verticalAlign: "middle",
                      }}
                    >
                      {c.render(item)}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "12px 14px 12px 12px",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <button
                        className="btn"
                        style={{
                          background: "#fff",
                          border: "1px solid var(--border)",
                          padding: "6px 10px",
                          fontSize: 11,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(id);
                        }}
                      >
                        Ver
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApproveClick(item);
                        }}
                        style={{ padding: "6px 10px", fontSize: 11 }}
                      >
                        <Icon name="check" size={12} color="#fff" /> {approveLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards (CSS toggles via classes below) */}

      {openItem && (
        <ApprovalDrawer
          title={detailTitle(openItem)}
          subtitle={detailSubtitle?.(openItem)}
          onClose={closeDrawer}
          onApprove={() => handleApproveClick(openItem)}
          onReject={() => handleRejectClick(openItem)}
          approveLabel={approveLabel}
          rejectLabel={rejectLabel}
          isBusy={busyId === getItemId(openItem)}
        >
          {renderDetail(openItem)}
        </ApprovalDrawer>
      )}

      {confirming && (
        <ApprovalConfirmDialog
          title={
            approveConfirmTitle
              ? approveConfirmTitle(confirming)
              : `Confirmar ${approveLabel.toLowerCase()}`
          }
          body={
            approveConfirmBody
              ? approveConfirmBody(confirming)
              : "Vas a aprobar este item. La acción se aplicará inmediatamente."
          }
          irreversibleNotice={irreversibleNotice}
          confirmLabel={`Confirmar y ${approveLabel.toLowerCase()}`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => doApprove(confirming)}
          isBusy={busyId === getItemId(confirming)}
        />
      )}

      {rejecting && (
        <ApprovalRejectDialog
          templates={rejectTemplates}
          confirmLabel={rejectLabel}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => doReject(rejecting, reason)}
          isBusy={busyId === getItemId(rejecting)}
        />
      )}

      <style jsx global>{`
        @media (max-width: 767px) {
          .aq-table-wrap .aq-hide-mobile {
            display: none !important;
          }
        }
        .aq-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────
function ApprovalDrawer({
  title,
  subtitle,
  onClose,
  onApprove,
  onReject,
  approveLabel,
  rejectLabel,
  isBusy,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  approveLabel: string;
  rejectLabel: string;
  isBusy: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          height: "100%",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 24px rgba(10,10,10,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <button
            onClick={onClose}
            aria-label="Volver"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: 0,
              padding: 4,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--muted-fg)",
              cursor: "pointer",
            }}
          >
            <Icon name="arrow-left" size={13} /> Volver
          </button>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--muted)",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        <div style={{ padding: "16px 22px 8px" }}>
          <div
            className="label-mp"
            style={{ color: "var(--primary)", marginBottom: 4 }}
          >
            ● Solicitud de aprobación
          </div>
          <h2
            className="font-heading"
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            {title}
            <span className="dot">.</span>
          </h2>
          {subtitle && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-fg)" }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 22px 22px" }}>
          {children}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            background: "#fafafa",
            position: "sticky",
            bottom: 0,
          }}
        >
          <button
            className="btn"
            onClick={onReject}
            disabled={isBusy}
            style={{
              background: "#fff",
              color: "#dc2626",
              border: "1px solid #fecaca",
              fontWeight: 800,
              minHeight: 44,
            }}
          >
            <Icon name="x" size={13} color="#dc2626" /> {rejectLabel}
          </button>
          <button
            className="btn btn-primary"
            onClick={onApprove}
            disabled={isBusy}
            style={{ minHeight: 44 }}
          >
            <Icon name="check" size={13} color="#fff" />{" "}
            {isBusy ? "…" : approveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────
function ApprovalConfirmDialog({
  title,
  body,
  irreversibleNotice,
  confirmLabel,
  onCancel,
  onConfirm,
  isBusy,
}: {
  title: string;
  body: string;
  irreversibleNotice: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 460, maxWidth: "100%", padding: 0, overflow: "hidden" }}
      >
        <div style={{ padding: "16px 22px 8px" }}>
          <h3
            className="font-heading"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.015em",
            }}
          >
            {title}
            <span className="dot">.</span>
          </h3>
        </div>
        <div style={{ padding: "8px 22px 16px", fontSize: 13, lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>{body}</p>
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "#fef3c7",
              borderRadius: 8,
              border: "1px solid #fde68a",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12,
              color: "#92400e",
            }}
          >
            <Icon name="alert-triangle" size={13} color="#b45309" />
            <span>{irreversibleNotice}</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            background: "#fafafa",
          }}
        >
          <button
            className="btn"
            onClick={onCancel}
            disabled={isBusy}
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={isBusy}
          >
            <Icon name="check" size={13} color="#fff" /> {isBusy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject dialog ─────────────────────────────────────────────────────────
function ApprovalRejectDialog({
  templates,
  confirmLabel,
  onCancel,
  onConfirm,
  isBusy,
}: {
  templates: string[];
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  isBusy: boolean;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 10;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 520, maxWidth: "100%", padding: 0, overflow: "hidden" }}
      >
        <div style={{ padding: "16px 22px 8px" }}>
          <h3
            className="font-heading"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.015em",
            }}
          >
            {confirmLabel}
            <span className="dot">.</span>
          </h3>
        </div>
        <div
          style={{
            padding: "8px 22px 16px",
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <label
            className="label-mp"
            style={{ display: "block", marginBottom: 0 }}
          >
            Motivo del rechazo *
          </label>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explicá por qué se rechaza. Este texto se le envía al usuario."
            style={{
              width: "100%",
              minHeight: 110,
              padding: "10px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontFamily: "inherit",
              fontSize: 13,
              resize: "vertical",
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: tooShort ? "#b45309" : "var(--muted-fg)",
            }}
          >
            {tooShort
              ? `Escribe al menos 10 caracteres (${reason.trim().length}/10).`
              : "Este motivo se le enviará al usuario."}
          </div>
          {templates.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                }}
              >
                Plantillas rápidas
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {templates.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setReason(t)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 9999,
                      border: "1px dashed var(--border)",
                      background: "#fafafa",
                      fontSize: 11.5,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {t.length > 38 ? t.slice(0, 36) + "…" : t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            background: "#fafafa",
          }}
        >
          <button
            className="btn"
            onClick={onCancel}
            disabled={isBusy}
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            className="btn"
            onClick={() => onConfirm(reason.trim())}
            disabled={isBusy || tooShort}
            style={{
              background: tooShort ? "#fca5a5" : "#dc2626",
              color: "#fff",
              border:
                "1px solid " + (tooShort ? "#fca5a5" : "#dc2626"),
              cursor: tooShort ? "not-allowed" : "pointer",
              opacity: isBusy ? 0.7 : 1,
            }}
          >
            <Icon name="x" size={13} color="#fff" />{" "}
            {isBusy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function QueueSkeleton<T>({ columns }: { columns: ApprovalQueueColumn<T>[] }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: `18px repeat(${columns.length}, 1fr) 160px`,
            gap: 12,
            padding: "14px",
            borderTop: i > 0 ? "1px solid var(--border)" : 0,
            alignItems: "center",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--muted)",
            }}
          />
          {Array.from({ length: columns.length + 1 }).map((__, j) => (
            <span
              key={j}
              style={{
                height: 12,
                borderRadius: 4,
                background: "var(--muted)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
