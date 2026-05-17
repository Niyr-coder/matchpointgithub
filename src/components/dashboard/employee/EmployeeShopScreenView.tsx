// Client view del EmployeeShopScreen — layout 1:1 del mock.
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { createSale } from "@/server/actions/proshop";

export type ShopItem = {
  id: string;
  name: string;
  cat: string;
  price: number;
  stock: number;
  color: string;
  i: string;
};
export type ShopData = {
  clubId: string | null;
  items: ShopItem[];
};

const PLACEHOLDER_COUNT = 8;

function ProductPlaceholderCard() {
  return (
    <div
      style={{
        padding: 0,
        overflow: "hidden",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div
        style={{
          height: 100,
          background: "var(--muted)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="circle" size={40} color="var(--muted-fg)" />
        <div style={{ position: "absolute", top: 8, left: 8 }}>
          <RSPill bg="var(--muted-fg)">— en stock</RSPill>
        </div>
      </div>
      <div style={{ padding: 12 }}>
        <div
          style={{
            fontSize: 9.5,
            color: "var(--muted-fg)",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontWeight: 800,
          }}
        >
          —
        </div>
        <div
          className="font-heading"
          style={{
            fontSize: 13,
            fontWeight: 900,
            marginTop: 2,
            lineHeight: 1.2,
            color: "var(--muted-fg)",
          }}
        >
          Sin productos
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <span className="font-heading" style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-fg)" }}>
            $—
          </span>
          <button className="btn" style={{ fontSize: 10, padding: "6px 10px", opacity: 0.6 }} disabled>
            <Icon name="plus" size={11} />
            Vender
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmployeeShopScreenView({ data }: { data: ShopData }) {
  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleSell = async (productId: string, name: string) => {
    if (!data.clubId) return;
    const method = await ask({
      title: `Vender ${name}`,
      label: "Método de pago",
      initialValue: "cash",
      helper: "Opciones: cash, card, transfer",
      required: true,
      validate: (v) => (["cash", "card", "transfer"].includes(v.trim()) ? null : "Método inválido"),
      confirmLabel: "Registrar venta",
    });
    if (method == null) return;
    startTransition(async () => {
      const res = await createSale({
        clubId: data.clubId!,
        items: [{ productId, qty: 1 }],
        method: method.trim() as "cash" | "card" | "transfer",
      });
      if (res.ok) toast({ icon: "check", title: "Venta registrada", sub: name });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "products", filter: `club_id=eq.${data.clubId}` },
          { table: "inventory_movements" },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const hasItems = data.items.length > 0;

  return (
    <>
      <RSHeader
        label="Recepción · Pro shop"
        title="Venta rápida"
        action={
          <button
            className="btn btn-primary"
            disabled={!hasItems}
            style={{ opacity: hasItems ? 1 : 0.5 }}
          >
            <Icon name="shopping-cart" size={13} color="#fff" />
            Carro · 0
          </button>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {hasItems
          ? data.items.map((p) => (
              <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    height: 100,
                    background: p.color,
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={p.i} size={40} color="rgba(255,255,255,0.55)" />
                  <div style={{ position: "absolute", top: 8, left: 8 }}>
                    <RSPill bg={p.stock < 5 ? "#dc2626" : "var(--primary)"}>
                      {p.stock} en stock
                    </RSPill>
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "var(--muted-fg)",
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                      fontWeight: 800,
                    }}
                  >
                    {p.cat}
                  </div>
                  <div
                    className="font-heading"
                    style={{ fontSize: 13, fontWeight: 900, marginTop: 2, lineHeight: 1.2 }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <span className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
                      ${p.price}
                    </span>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 10, padding: "6px 10px" }}
                      disabled={p.stock <= 0 || isPending}
                      onClick={() => handleSell(p.id, p.name)}
                    >
                      <Icon name="plus" size={11} color="#fff" />
                      Vender
                    </button>
                  </div>
                </div>
              </div>
            ))
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => <ProductPlaceholderCard key={i} />)}
      </div>
    </>
  );
}
