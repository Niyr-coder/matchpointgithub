"use client";
import { useState, useEffect, useRef, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { openCashSession, closeCashSession, createTransaction, listCashSessions } from "@/server/actions/cash";
import { searchUsersForBooking } from "@/server/actions/reservations";

export type Method = "card" | "cash" | "transfer";
export type Tx = {
  id: string;
  t: string;
  who: string;
  concept: string;
  method: Method;
  amt: number;
};
export type CajaKpis = {
  cashCents: number;
  cashCount: number;
  cardCents: number;
  cardCount: number;
  transferCents: number;
  transferCount: number;
  refundsCents: number;
  refundsCount: number;
};
export type CajaData = {
  clubId: string | null;
  txs: Tx[];
  kpis: CajaKpis;
  totalLabel: string;
  sessionOpen: boolean;
};

const METHOD_LABEL: Record<Method, string> = {
  card: "TARJETA",
  cash: "EFECTIVO",
  transfer: "TRANSFER",
};
const METHOD_BG: Record<Method, string> = {
  card: "#0a0a0a",
  cash: "var(--primary)",
  transfer: "#0ea5e9",
};

const PLACEHOLDER_TX = 4;
const CAJA_TX_COLS = "80px 1fr 1fr 110px 100px 50px";

function dollars(c: number): string {
  return `$${Math.round(c / 100)}`;
}

function TxPlaceholderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: CAJA_TX_COLS,
        alignItems: "center",
        padding: "14px 16px",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <span className="font-heading" style={{ color: "var(--muted-fg)" }}>
        —
      </span>
      <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin transacciones hoy</span>
      <span style={{ color: "var(--muted-fg)", fontSize: 11.5 }}>—</span>
      <RSPill bg="var(--muted-fg)">—</RSPill>
      <span
        className="font-heading"
        style={{ fontSize: 14, fontWeight: 900, color: "var(--muted-fg)", textAlign: "right" }}
      >
        $—
      </span>
      <span />
    </div>
  );
}

// ── NuevoCobroModal ────────────────────────────────────────────────────────

type CobroKind = "reservation" | "class" | "proshop_sale" | "custom";
type ClienteResult = { id: string; displayName: string; username: string | null };

const KIND_OPTIONS: { value: CobroKind; label: string; icon: string }[] = [
  { value: "reservation", label: "Cancha", icon: "calendar" },
  { value: "class", label: "Clase", icon: "book-open" },
  { value: "proshop_sale", label: "Pro shop", icon: "shopping-bag" },
  { value: "custom", label: "Otro", icon: "tag" },
];

const METHOD_OPTIONS: { value: Method; label: string; icon: string }[] = [
  { value: "cash", label: "Efectivo", icon: "banknote" },
  { value: "card", label: "Tarjeta", icon: "credit-card" },
  { value: "transfer", label: "Transf.", icon: "arrow-left-right" },
];

function NuevoCobroModal({
  clubId,
  onClose,
}: {
  clubId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [searchPending, startSearchTransition] = useTransition();

  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteResults, setClienteResults] = useState<ClienteResult[]>([]);
  const [clienteUser, setClienteUser] = useState<{ id: string; name: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [kind, setKind] = useState<CobroKind>("custom");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    if (clienteUser) return;
    const q = clienteQuery.trim();
    if (q.length < 2) {
      setClienteResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const res = await searchUsersForBooking({ clubId, q });
        setClienteResults(res.ok ? res.data : []);
      });
    }, 250);
    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    };
  }, [clienteQuery, clienteUser, clubId]);

  const selectCliente = (r: ClienteResult) => {
    setClienteUser({ id: r.id, name: r.displayName });
    setClienteQuery(r.displayName);
    setClienteResults([]);
  };

  const clearCliente = () => {
    setClienteUser(null);
    setClienteQuery("");
    setClienteResults([]);
  };

  const handleSubmit = () => {
    const amtNum = Number(amount.replace(",", ".").trim());
    if (!amount.trim() || isNaN(amtNum) || amtNum <= 0) {
      setError("Ingresa un monto mayor que 0");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createTransaction({
        clubId,
        kind,
        amountCents: Math.round(amtNum * 100),
        currency: "USD",
        method,
        customerUserId: clienteUser?.id ?? undefined,
        customerName: clienteUser?.name ?? (clienteQuery.trim() || undefined),
      });
      if (res.ok) {
        toast({ icon: "check", title: "Cobro registrado" });
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ padding: 0, overflow: "hidden", width: 480, maxWidth: "100%" }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3
            className="font-heading"
            style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.015em", margin: 0 }}
          >
            Nuevo cobro<span className="dot">.</span>
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "var(--muted)",
              border: 0, cursor: "pointer", display: "inline-flex",
              alignItems: "center", justifyContent: "center", padding: 0,
            }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Cliente */}
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Cliente{" "}
              <span style={{ color: "var(--muted-fg)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
                (opcional)
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute", left: 12, top: "50%",
                  transform: "translateY(-50%)", color: "var(--muted-fg)", pointerEvents: "none",
                }}
              >
                <Icon name={clienteUser ? "user-check" : "search"} size={13} />
              </span>
              <input
                type="text"
                value={clienteQuery}
                onChange={(e) => {
                  if (clienteUser) clearCliente();
                  setClienteQuery(e.target.value);
                }}
                placeholder="Busca por nombre o username…"
                style={{ ...inputStyle, paddingLeft: 34, paddingRight: clienteUser ? 34 : 12 }}
              />
              {clienteUser && (
                <button
                  type="button"
                  onClick={clearCliente}
                  style={{
                    position: "absolute", right: 10, top: "50%",
                    transform: "translateY(-50%)", width: 20, height: 20,
                    borderRadius: "50%", border: 0, background: "rgba(10,10,10,0.1)",
                    cursor: "pointer", display: "inline-flex",
                    alignItems: "center", justifyContent: "center",
                  }}
                  aria-label="Quitar cliente"
                >
                  <Icon name="x" size={10} />
                </button>
              )}
            </div>

            {!clienteUser && clienteQuery.trim().length >= 2 && (
              <div
                style={{
                  border: "1px solid var(--border)", borderRadius: 8,
                  marginTop: 4, background: "#fff", maxHeight: 180, overflow: "auto",
                }}
              >
                {searchPending && (
                  <div style={{ padding: "9px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
                    Buscando…
                  </div>
                )}
                {!searchPending && clienteResults.length === 0 && (
                  <div style={{ padding: "9px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
                    Sin resultados — se usará el nombre ingresado.
                  </div>
                )}
                {clienteResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectCliente(r)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", width: "100%", border: 0,
                      borderBottom: "1px solid var(--border)", background: "#fff",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800 }}>{r.displayName}</div>
                      {r.username && (
                        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>@{r.username}</div>
                      )}
                    </div>
                    <Icon name="plus" size={13} color="var(--primary)" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tipo */}
          <div>
            <div className="label-mp" style={{ marginBottom: 8 }}>Tipo de cobro</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
              {KIND_OPTIONS.map((k) => {
                const active = kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    style={{
                      padding: "10px 6px", borderRadius: 8,
                      border: `1.5px solid ${active ? "#0a0a0a" : "var(--border)"}`,
                      background: active ? "#0a0a0a" : "#fff",
                      color: active ? "#fff" : "#0a0a0a",
                      cursor: "pointer", fontFamily: "inherit",
                      fontSize: 11, fontWeight: 900,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 6,
                    }}
                  >
                    <Icon name={k.icon} size={15} color={active ? "#fff" : "#0a0a0a"} />
                    {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monto + Método */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>Monto (USD)</div>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute", left: 12, top: "50%",
                    transform: "translateY(-50%)", color: "var(--muted-fg)",
                    fontSize: 14, fontWeight: 900, pointerEvents: "none",
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); if (error) setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="0.00"
                  style={{
                    ...inputStyle,
                    paddingLeft: 24,
                    borderColor: error ? "#dc2626" : "var(--border)",
                  }}
                />
              </div>
              {error && (
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, fontWeight: 700 }}>
                  {error}
                </div>
              )}
            </div>

            <div>
              <div className="label-mp" style={{ marginBottom: 8 }}>Método</div>
              <div style={{ display: "flex", gap: 6 }}>
                {METHOD_OPTIONS.map((m) => {
                  const active = method === m.value;
                  const bg = METHOD_BG[m.value];
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      title={m.label}
                      style={{
                        flex: 1, padding: "9px 4px", borderRadius: 8,
                        border: `1.5px solid ${active ? bg : "var(--border)"}`,
                        background: active ? bg : "#fff",
                        color: active ? "#fff" : "#0a0a0a",
                        cursor: "pointer", display: "flex",
                        flexDirection: "column", alignItems: "center", gap: 5,
                        fontSize: 10, fontWeight: 900, fontFamily: "inherit",
                      }}
                    >
                      <Icon name={m.icon} size={14} color={active ? "#fff" : "#0a0a0a"} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px", background: "#fafafa",
            borderTop: "1px solid var(--border)",
            display: "flex", justifyContent: "flex-end", gap: 8,
          }}
        >
          <button
            onClick={onClose}
            className="btn"
            disabled={isPending}
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="btn"
            disabled={isPending}
            style={{ background: "#0a0a0a", color: "#fff", border: "1px solid #0a0a0a" }}
          >
            <Icon name="check" size={13} color="#fff" />
            {isPending ? "Registrando…" : "Registrar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EmployeeCajaScreenView ─────────────────────────────────────────────────

export function EmployeeCajaScreenView({ data }: { data: CajaData }) {
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [showNuevoCobro, setShowNuevoCobro] = useState(false);

  const handleOpenCaja = async () => {
    if (!data.clubId) return;
    const floatStr = await ask({
      title: "Abrir caja",
      label: "Fondo inicial (USD)",
      initialValue: "0",
      validate: (v) => (/^\d+(\.\d+)?$/.test(v.trim()) ? null : "Solo números"),
      confirmLabel: "Abrir caja",
    });
    if (floatStr == null) return;
    startTransition(async () => {
      const res = await openCashSession({
        clubId: data.clubId!,
        openingFloatCents: Math.round(Number(floatStr) * 100),
      });
      if (res.ok) toast({ icon: "check", title: "Caja abierta" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const handleCierreZ = async () => {
    if (!data.clubId) return;
    const ok = await confirm({
      title: "Cerrar caja",
      body: "¿Cerrar la caja actual? Tendrás que contar efectivo.",
      confirmLabel: "Continuar",
    });
    if (!ok) return;
    const countStr = await ask({
      title: "Cierre Z",
      label: "Total contado en caja (USD)",
      placeholder: "ej. 320.50",
      required: true,
      validate: (v) => (/^\d+(\.\d+)?$/.test(v.trim()) ? null : "Solo números"),
      confirmLabel: "Cerrar caja",
      destructive: true,
    });
    if (countStr == null) return;
    startTransition(async () => {
      const sessions = await listCashSessions({ clubId: data.clubId!, status: "open", limit: 1 });
      if (!sessions.ok || sessions.data.length === 0) {
        toast({ icon: "alert-triangle", title: "Sin sesión abierta" });
        return;
      }
      const res = await closeCashSession({
        id: sessions.data[0].id,
        body: { closingCountedCents: Math.round(Number(countStr) * 100) },
      });
      if (res.ok) toast({ icon: "check", title: "Caja cerrada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "transactions", filter: `club_id=eq.${data.clubId}` },
          { table: "refunds" },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const cols: RSColumn<Tx>[] = [
    { k: "t", l: "Hora", render: (t) => <b className="font-heading">{t.t}</b> },
    { k: "who", l: "Cliente", render: (t) => <b style={{ fontSize: 12 }}>{t.who}</b> },
    { k: "concept", l: "Concepto" },
    {
      k: "method",
      l: "Método",
      render: (t) => <RSPill bg={METHOD_BG[t.method]}>{METHOD_LABEL[t.method]}</RSPill>,
    },
    {
      k: "amt",
      l: "Monto",
      align: "right",
      render: (t) => (
        <span
          className="font-heading"
          style={{ fontSize: 14, fontWeight: 900, color: t.amt < 0 ? "#dc2626" : "var(--primary)" }}
        >
          {(t.amt < 0 ? "–$" : "$") + Math.abs(t.amt).toFixed(2)}
        </span>
      ),
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: () => (
        <button
          style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "var(--muted)", border: 0, cursor: "pointer",
          }}
        >
          <Icon name="receipt" size={12} />
        </button>
      ),
    },
  ];

  const KPIS: [string, string, string, string, string][] = [
    [
      "Efectivo",
      dollars(data.kpis.cashCents),
      `${data.kpis.cashCount} cobro${data.kpis.cashCount === 1 ? "" : "s"}`,
      "#0a0a0a",
      "banknote",
    ],
    [
      "Tarjeta",
      dollars(data.kpis.cardCents),
      `${data.kpis.cardCount} cobro${data.kpis.cardCount === 1 ? "" : "s"}`,
      "var(--primary)",
      "credit-card",
    ],
    [
      "Transferencia",
      dollars(data.kpis.transferCents),
      `${data.kpis.transferCount} cobro${data.kpis.transferCount === 1 ? "" : "s"}`,
      "#0ea5e9",
      "arrow-left-right",
    ],
    [
      "Reembolsos",
      data.kpis.refundsCents > 0 ? `–${dollars(data.kpis.refundsCents)}` : "$0",
      `${data.kpis.refundsCount} caso${data.kpis.refundsCount === 1 ? "" : "s"}`,
      "#dc2626",
      "rotate-ccw",
    ],
  ];

  const hasTx = data.txs.length > 0;

  return (
    <>
      <RSHeader
        label="Caja · Turno"
        title={
          <>
            Caja del día <span className="dot">●</span> {data.totalLabel}
          </>
        }
        action={
          !data.sessionOpen ? (
            <button
              className="btn btn-primary"
              disabled={!data.clubId || isPending}
              onClick={handleOpenCaja}
            >
              <Icon name="unlock" size={13} color="#fff" />
              Abrir caja
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                style={{ background: "#fff", border: RS_BORDER }}
                onClick={handleCierreZ}
                disabled={isPending || !data.clubId}
              >
                <Icon name="printer" size={12} />
                Cierre Z
              </button>
              <button
                className="btn btn-primary"
                disabled={!data.clubId || isPending}
                onClick={() => setShowNuevoCobro(true)}
              >
                <Icon name="plus" size={13} color="#fff" />
                Nuevo cobro
              </button>
            </div>
          )
        }
      />

      <div className="mp-grid-form-4 gap-3.5">
        {KPIS.map(([l, v, sub, c, ic]) => (
          <div key={l} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="label-mp">{l}</div>
              <Icon name={ic} size={14} color={c} />
            </div>
            <div
              className="font-heading tabular"
              style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 4, color: c }}
            >
              {v}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {hasTx ? (
        <RSTable cols={cols} rows={data.txs} rowKey={(t) => t.id} />
      ) : (
        <div className="mp-table-scroll">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 580 }}>
            {Array.from({ length: PLACEHOLDER_TX }).map((_, i) => (
              <TxPlaceholderRow key={i} />
            ))}
          </div>
        </div>
      )}

      {showNuevoCobro && data.clubId && (
        <NuevoCobroModal
          clubId={data.clubId}
          onClose={() => setShowNuevoCobro(false)}
        />
      )}
    </>
  );
}
