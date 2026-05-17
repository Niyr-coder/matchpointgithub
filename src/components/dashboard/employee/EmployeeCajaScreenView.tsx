// Client view del EmployeeCajaScreen — layout 1:1 del mock.
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { openCashSession, closeCashSession, createTransaction, listCashSessions } from "@/server/actions/cash";

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

function dollars(c: number): string {
  return `$${Math.round(c / 100)}`;
}

function TxPlaceholderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 1fr 110px 100px 50px",
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

export function EmployeeCajaScreenView({ data }: { data: CajaData }) {
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleNewCobro = async () => {
    if (!data.clubId) return;
    const amountStr = await ask({
      title: "Nuevo cobro · 1/3",
      label: "Monto (USD)",
      placeholder: "ej. 25",
      required: true,
      validate: (v) => (/^\d+(\.\d+)?$/.test(v.trim()) && Number(v) > 0 ? null : "Solo números mayores que 0"),
      confirmLabel: "Siguiente",
    });
    if (amountStr == null) return;
    const method = await ask({
      title: "Nuevo cobro · 2/3",
      label: "Método",
      initialValue: "cash",
      helper: "Opciones: cash, card, transfer",
      required: true,
      validate: (v) => (["cash", "card", "transfer"].includes(v.trim()) ? null : "Método inválido"),
      confirmLabel: "Siguiente",
    });
    if (method == null) return;
    const concept = await ask({
      title: "Nuevo cobro · 3/3",
      label: "Concepto",
      initialValue: "Venta",
      placeholder: "Descripción del cobro",
      confirmLabel: "Registrar",
    });
    if (concept == null) return;
    startTransition(async () => {
      const res = await createTransaction({
        clubId: data.clubId!,
        kind: "custom",
        amountCents: Math.round(Number(amountStr) * 100),
        currency: "USD",
        method: method.trim() as "cash" | "card" | "transfer",
        customerName: concept.trim() || "Venta",
      });
      if (res.ok) toast({ icon: "check", title: "Cobro registrado" });
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

  void openCashSession; // exposed via Cierre Z indirectly; keep import used

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
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: t.amt < 0 ? "#dc2626" : "var(--primary)",
          }}
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
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--muted)",
            border: 0,
            cursor: "pointer",
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
              style={{ opacity: data.clubId ? 1 : 0.5 }}
              onClick={handleNewCobro}
            >
              <Icon name="plus" size={13} color="#fff" />
              Nuevo cobro
            </button>
          </div>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {KPIS.map(([l, v, sub, c, ic]) => (
          <div key={l} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="label-mp">{l}</div>
              <Icon name={ic} size={14} color={c} />
            </div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                marginTop: 4,
                color: c,
              }}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: PLACEHOLDER_TX }).map((_, i) => (
            <TxPlaceholderRow key={i} />
          ))}
        </div>
      )}
    </>
  );
}
