"use client";
// Empleado · Pro shop & bar v2 — POS + inventario + catálogo + movimientos.
// Catálogo, stock y ventas son reales (tablas products / sales / inventory_movements
// / transactions vía `fn_create_sale`). El carrito vive en estado local del POS hasta
// `Cobrar`, momento en el que se persiste la venta. Stock se refresca en vivo via
// Supabase realtime sobre `inventory_movements`.
import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import {
  createProshopProduct,
  createSale,
  adjustProshopStock,
  updateProshopProduct,
} from "@/server/actions/proshop";
import type { ProShopData, PSCategory, PSProduct } from "./EmployeeProShopScreen";

type CartItem = PSProduct & { qty: number };

type PaymentMethod = "cash" | "transfer" | "card" | "wallet";

const PROSHOP_INV_COLS = "38px 1.8fr 100px 0.8fr 110px 130px";

const PAY_METHODS: { k: PaymentMethod; l: string; icon: string }[] = [
  { k: "cash", l: "Efectivo", icon: "banknote" },
  { k: "transfer", l: "Transfer.", icon: "arrow-left-right" },
  { k: "wallet", l: "Billetera", icon: "smartphone" },
  { k: "card", l: "Tarjeta", icon: "credit-card" },
];

// Categorías visuales reservadas: "all" siempre primero; las demás vienen de DB.
function buildCatTabs(categories: PSCategory[]) {
  return [
    { k: "all", l: "Todos", icon: "grid-3x3" },
    ...categories.map((c) => ({ k: c.slug, l: c.name, icon: iconForSlug(c.slug) })),
  ];
}

function iconForSlug(slug: string | null): string {
  const s = (slug ?? "").toLowerCase();
  if (s.includes("paleta") || s.includes("racket")) return "circle";
  if (s.includes("pelota") || s.includes("ball")) return "circle-dot";
  if (s.includes("ropa") || s.includes("shirt") || s.includes("apparel")) return "shirt";
  if (s.includes("bar") || s.includes("drink") || s.includes("bebida")) return "cup-soda";
  if (s.includes("snack") || s.includes("food")) return "sandwich";
  if (s.includes("access") || s.includes("bolso") || s.includes("bag")) return "briefcase";
  return "circle";
}

function formatMoney(cents: number, currency: string): string {
  const v = cents / 100;
  // Mantenemos formato corto sin Intl para que el rendering server/client coincida.
  return `${currency === "USD" ? "$" : ""}${v.toFixed(2)}${currency !== "USD" ? " " + currency : ""}`;
}

export function EmployeeProShopView({ data }: { data: ProShopData }) {
  const toast = useToast();
  const [tab, setTab] = useState<"pos" | "inv" | "cat" | "mov">("pos");
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "products", filter: `club_id=eq.${data.clubId}` },
          { table: "inventory_movements" },
          { table: "sales", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId, debounceMs: 500 },
  );

  const productById = useMemo(() => {
    const m = new Map<string, PSProduct>();
    for (const p of data.products) m.set(p.id, p);
    return m;
  }, [data.products]);

  const cartItems = useMemo<CartItem[]>(() => {
    const items: CartItem[] = [];
    for (const [id, qty] of Object.entries(cart)) {
      const p = productById.get(id);
      if (p) items.push({ ...p, qty });
    }
    return items;
  }, [cart, productById]);

  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartSubtotalCents = cartItems.reduce((s, i) => s + i.priceCents * i.qty, 0);
  const cartCurrency =
    cartItems[0]?.currency ?? data.defaultCurrency;

  const lowStock = data.products.filter(
    (p) => p.active && p.stock > 0 && p.stock <= p.lowStockThreshold,
  );

  const addToCart = (id: string) => {
    const p = productById.get(id);
    if (!p) return;
    setCart((c) => {
      const have = c[id] ?? 0;
      // Clamp a stock disponible.
      if (have + 1 > p.stock) {
        toast({ icon: "alert-triangle", title: `Solo quedan ${p.stock} en stock`, sub: p.name });
        return c;
      }
      return { ...c, [id]: have + 1 };
    });
  };

  const removeFromCart = (id: string) =>
    setCart((c) => {
      const n = { ...c };
      if ((n[id] ?? 0) > 1) n[id]--;
      else delete n[id];
      return n;
    });

  const clearCart = () => setCart({});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolHero
        tone="dark"
        wm="SHOP"
        accent="#10b981"
        label="Recepción · Tienda & bar"
        title="Venta y stock"
        sub={
          data.clubId
            ? "Cobra rápido, controla el stock, sube productos nuevos. Todo desde la caja."
            : "Sin club activo. Pedí a un owner que te asigne un club."
        }
        right={
          data.cashSession ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 9999,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                <span style={{ opacity: 0.6 }}>Efectivo turno:</span>{" "}
                <b style={{ color: "var(--primary)" }}>
                  {formatMoney(data.cashSession.cashSalesCents, data.defaultCurrency)}
                </b>
              </div>
              {lowStock.length > 0 && (
                <button
                  onClick={() => setTab("inv")}
                  className="btn"
                  style={{
                    background: "rgba(220,38,38,0.18)",
                    color: "#fff",
                    border: "1px solid rgba(220,38,38,0.4)",
                  }}
                >
                  <Icon name="alert-triangle" size={13} color="#fca5a5" />
                  {lowStock.length} en bajo stock
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                background: "rgba(251,191,36,0.18)",
                border: "1px solid rgba(251,191,36,0.4)",
                color: "#fbbf24",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              ⚠ Caja cerrada · ventas en efectivo requieren caja abierta
            </div>
          )
        }
      />

      <div className="card" style={{ padding: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(
          [
            {
              k: "pos",
              l: "Punto de venta",
              icon: "scan-line",
              sub: cartCount > 0 ? "· " + cartCount + " items" : "",
              badge: null as number | null,
            },
            {
              k: "inv",
              l: "Inventario",
              icon: "boxes",
              sub: "",
              badge: lowStock.length > 0 ? lowStock.length : null,
            },
            {
              k: "cat",
              l: "Catálogo",
              icon: "layout-grid",
              sub: data.products.length + " productos",
              badge: null,
            },
            {
              k: "mov",
              l: "Movimientos",
              icon: "receipt-text",
              sub: data.todaySales.length + " ventas hoy",
              badge: null,
            },
          ] as const
        ).map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                flex: "1 1 160px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 14px",
                borderRadius: 8,
                background: on ? "#0a0a0a" : "transparent",
                color: on ? "#fff" : "#0a0a0a",
                border: 0,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <Icon name={t.icon} size={15} color={on ? "var(--primary)" : "#0a0a0a"} />
              <span style={{ fontSize: 12.5, fontWeight: 900 }}>{t.l}</span>
              {t.sub && (
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{t.sub}</span>
              )}
              {t.badge != null && (
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: 9999,
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 900,
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "pos" && (
          <POSTab
            data={data}
            cat={cat}
            setCat={setCat}
            search={search}
            setSearch={setSearch}
            cart={cart}
            cartItems={cartItems}
            cartCount={cartCount}
            cartSubtotalCents={cartSubtotalCents}
            cartCurrency={cartCurrency}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            clearCart={clearCart}
            payMethod={payMethod}
            setPayMethod={setPayMethod}
            customerName={customerName}
            setCustomerName={setCustomerName}
          />
        )}
        {tab === "inv" && <InventarioTab data={data} lowStock={lowStock} />}
        {tab === "cat" && <CatalogoTab data={data} />}
        {tab === "mov" && <MovimientosTab data={data} />}
      </div>
    </div>
  );
}

// ── POS tab ────────────────────────────────────────────────────────────
type POSTabProps = {
  data: ProShopData;
  cat: string;
  setCat: (k: string) => void;
  search: string;
  setSearch: (v: string) => void;
  cart: Record<string, number>;
  cartItems: CartItem[];
  cartCount: number;
  cartSubtotalCents: number;
  cartCurrency: string;
  addToCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  payMethod: PaymentMethod;
  setPayMethod: (k: PaymentMethod) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
};

function POSTab({
  data,
  cat,
  setCat,
  search,
  setSearch,
  cart,
  cartItems,
  cartCount,
  cartSubtotalCents,
  cartCurrency,
  addToCart,
  removeFromCart,
  clearCart,
  payMethod,
  setPayMethod,
  customerName,
  setCustomerName,
}: POSTabProps) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const catTabs = useMemo(() => buildCatTabs(data.categories), [data.categories]);

  const filtered = useMemo(() => {
    let list = data.products.filter((p) => p.active);
    if (cat !== "all") list = list.filter((p) => p.catSlug === cat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [data.products, cat, search]);

  const countByCat = (k: string) => {
    if (k === "all") return data.products.filter((p) => p.active).length;
    return data.products.filter((p) => p.active && p.catSlug === k).length;
  };

  const charge = async () => {
    if (!data.clubId || cartItems.length === 0) return;
    const okConfirm = await confirm({
      title: "Confirmar venta",
      body: `${cartCount} producto${cartCount === 1 ? "" : "s"} · ${formatMoney(
        cartSubtotalCents,
        cartCurrency,
      )} · ${payMethodLabel(payMethod)}${customerName.trim() ? ` · Cliente: ${customerName.trim()}` : ""}\n\nAl confirmar, el stock se descuenta y la venta queda registrada.`,
      confirmLabel: "Cobrar",
      cancelLabel: "Cancelar",
    });
    if (!okConfirm) return;

    startTransition(async () => {
      const res = await createSale({
        clubId: data.clubId!,
        items: cartItems.map((i) => ({ productId: i.id, qty: i.qty })),
        method: payMethod,
        customerName: customerName.trim() || null,
      });
      if (res.ok) {
        toast({
          icon: "check-circle-2",
          title: `Venta registrada · ${formatMoney(cartSubtotalCents, cartCurrency)}`,
          sub: `${cartCount} item${cartCount === 1 ? "" : "s"} · ${payMethodLabel(payMethod)}`,
        });
        clearCart();
        setCustomerName("");
      } else {
        const msg = friendlySaleError(res.error.code, res.error.message);
        toast({ icon: "alert-triangle", title: "No se pudo cobrar", sub: msg });
      }
    });
  };

  const hasProducts = data.products.filter((p) => p.active).length > 0;

  return (
    <div
      className="mp-shop-pos mp-grid-split-cart gap-4"
      style={{ alignItems: "flex-start" }}
    >
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div
            style={{
              flex: "1 1 220px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 9999,
              border: "1px solid var(--border)",
              background: "#fff",
            }}
          >
            <Icon name="search" size={14} color="var(--muted-fg)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto o SKU…"
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                fontSize: 12,
                fontFamily: "inherit",
                background: "transparent",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  display: "inline-flex",
                }}
              >
                <Icon name="x" size={13} color="var(--muted-fg)" />
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {catTabs.map((c) => {
            const on = cat === c.k;
            return (
              <button
                key={c.k}
                onClick={() => setCat(c.k)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 9999,
                  background: on ? "var(--primary)" : "#fff",
                  color: on ? "#fff" : "#0a0a0a",
                  border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Icon name={c.icon} size={13} color={on ? "#fff" : undefined} />
                {c.l}
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 9999,
                    background: on ? "rgba(255,255,255,0.22)" : "var(--muted)",
                    fontSize: 9.5,
                    fontWeight: 900,
                  }}
                >
                  {countByCat(c.k)}
                </span>
              </button>
            );
          })}
        </div>

        {!hasProducts ? (
          <div
            className="card"
            style={{
              padding: 40,
              textAlign: "center",
              border: "1px dashed var(--border)",
              background: "#fafafa",
            }}
          >
            <Icon name="package-x" size={32} color="var(--muted-fg)" />
            <h3 style={{ marginTop: 12, fontSize: 14, fontWeight: 900 }}>
              Catálogo vacío
            </h3>
            <p style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted-fg)" }}>
              Pedile al owner que cargue productos en inventario, o creá uno desde la pestaña Catálogo.
            </p>
          </div>
        ) : (
          <div className="mp-shop-grid mp-grid-form-4 gap-3">
            {filtered.map((p) => {
              const inCart = cart[p.id] || 0;
              const low = p.stock > 0 && p.stock <= p.lowStockThreshold;
              const out = p.stock <= 0;
              return (
                <button
                  key={p.id}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: "hidden",
                    position: "relative",
                    opacity: out ? 0.5 : 1,
                    cursor: out ? "not-allowed" : "pointer",
                    border: "1px solid var(--border)",
                    textAlign: "left",
                    fontFamily: "inherit",
                    background: "var(--card, #fff)",
                  }}
                  disabled={out}
                  onClick={() => !out && addToCart(p.id)}
                >
                  <div
                    style={{
                      height: 80,
                      background: p.coverUrl ? `url(${p.coverUrl}) center/cover` : p.bg,
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {!p.coverUrl && (
                      <Icon name={p.icon} size={32} color="rgba(255,255,255,0.65)" />
                    )}
                    <div
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        padding: "2px 7px",
                        borderRadius: 9999,
                        background: out
                          ? "#7c1d1d"
                          : low
                            ? "#dc2626"
                            : "rgba(0,0,0,0.5)",
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {out ? "AGOTADO" : p.stock + " STOCK"}
                    </div>
                    {inCart > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: "var(--primary)",
                          color: "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 900,
                          border: "2px solid #fff",
                        }}
                      >
                        {inCart}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 10 }}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 900,
                        lineHeight: 1.25,
                        minHeight: 28,
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 6,
                      }}
                    >
                      <span
                        className="font-heading tabular"
                        style={{
                          fontSize: 17,
                          fontWeight: 900,
                          letterSpacing: "-0.025em",
                        }}
                      >
                        {formatMoney(p.priceCents, p.currency)}
                      </span>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: out ? "var(--muted)" : "var(--primary)",
                          color: "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name="plus" size={13} color="#fff" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: 24,
                  textAlign: "center",
                  color: "var(--muted-fg)",
                  fontSize: 11.5,
                }}
              >
                No encontramos productos. Probá otra búsqueda o cambia de categoría.
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="card mp-shop-cart"
        style={{ padding: 0, overflow: "hidden", position: "sticky", top: 80 }}
      >
        <div
          style={{
            padding: 16,
            background: "#0a0a0a",
            color: "#fff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>
              ● Carrito
            </div>
            <h3
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              Venta actual
            </h3>
          </div>
          {cartCount > 0 && (
            <button
              onClick={clearCart}
              style={{
                padding: "4px 10px",
                borderRadius: 9999,
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
                fontSize: 10,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Vaciar
            </button>
          )}
        </div>
        <div className="mp-table-scroll" style={{ maxHeight: 280, overflowY: "auto" }}>
          {cartItems.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
              <Icon name="shopping-cart" size={28} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8, fontSize: 11.5 }}>
                Toca cualquier producto para añadir.
              </div>
            </div>
          )}
          {cartItems.map((it) => (
            <div
              key={it.id}
              className="mp-table-row"
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr 90px 24px",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
                borderTop: "1px dashed var(--border)",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: it.coverUrl ? `url(${it.coverUrl}) center/cover` : it.bg,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!it.coverUrl && (
                  <Icon name={it.icon} size={13} color="rgba(255,255,255,0.8)" />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {it.name}
                </div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>
                  {formatMoney(it.priceCents, it.currency)} c/u
                </div>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={() => removeFromCart(it.id)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: "var(--muted)",
                    border: 0,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="minus" size={10} />
                </button>
                <span
                  className="font-heading tabular"
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    minWidth: 18,
                    textAlign: "center",
                  }}
                >
                  {it.qty}
                </span>
                <button
                  onClick={() => addToCart(it.id)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: "var(--primary)",
                    color: "#fff",
                    border: 0,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="plus" size={10} color="#fff" />
                </button>
              </div>
              <span
                className="font-heading tabular"
                style={{ fontSize: 12, fontWeight: 900, textAlign: "right" }}
              >
                {formatMoney(it.priceCents * it.qty, it.currency)}
              </span>
            </div>
          ))}
        </div>
        {cartItems.length > 0 && (
          <>
            <div
              style={{
                padding: "12px 14px",
                borderTop: "1px solid var(--border)",
                background: "var(--muted)",
              }}
            >
              <div className="label-mp" style={{ marginBottom: 6 }}>
                Cliente (opcional)
              </div>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre o socio"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  fontSize: 11,
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 900 }}>TOTAL</span>
                <span
                  className="font-heading tabular"
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    letterSpacing: "-0.035em",
                    color: "var(--primary)",
                  }}
                >
                  {formatMoney(cartSubtotalCents, cartCurrency)}
                </span>
              </div>
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <div className="label-mp" style={{ marginBottom: 6 }}>
                Pago
              </div>
              <div className="mp-grid-form-4 gap-1" style={{ marginBottom: 10 }}>
                {PAY_METHODS.map((m) => {
                  const on = payMethod === m.k;
                  return (
                    <button
                      key={m.k}
                      onClick={() => setPayMethod(m.k)}
                      style={{
                        padding: "8px 4px",
                        borderRadius: 8,
                        background: on ? "#0a0a0a" : "#fff",
                        color: on ? "#fff" : "#0a0a0a",
                        border: on ? "1px solid #0a0a0a" : "1px solid var(--border)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 3,
                        fontFamily: "inherit",
                      }}
                    >
                      <Icon
                        name={m.icon}
                        size={14}
                        color={on ? "var(--primary)" : "#0a0a0a"}
                      />
                      <span
                        style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.05em" }}
                      >
                        {m.l}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px 16px", fontSize: 13 }}
                onClick={charge}
                disabled={isPending}
              >
                <Icon name="check-circle-2" size={15} color="#fff" />
                {isPending
                  ? "Procesando…"
                  : `Cobrar ${formatMoney(cartSubtotalCents, cartCurrency)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function payMethodLabel(m: PaymentMethod): string {
  return PAY_METHODS.find((p) => p.k === m)?.l ?? m;
}

function friendlySaleError(code: string, message: string): string {
  switch (code) {
    case "PROSHOP.OUT_OF_STOCK":
      return "Stock insuficiente. Refresca el catálogo (otro vendedor pudo haber vendido).";
    case "PROSHOP.INACTIVE":
      return "Algún producto fue desactivado. Quítalo del carrito.";
    case "PROSHOP.CURRENCY_MIXED":
      return "Los productos deben ser de la misma moneda.";
    case "CASH.SESSION_CLOSED":
      return "Abre una sesión de caja antes de vender en efectivo.";
    case "AUTH.ROLE_REQUIRED":
      return "No tienes permiso para vender en este club.";
    default:
      return message || "Error desconocido";
  }
}

// ── Inventario tab ─────────────────────────────────────────────────────
function InventarioTab({
  data,
  lowStock,
}: {
  data: ProShopData;
  lowStock: PSProduct[];
}) {
  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const replenish = (p: PSProduct) => {
    startTransition(async () => {
      const raw = await ask({
        title: `+ Stock · ${p.name}`,
        label: "Unidades a sumar",
        initialValue: "1",
        placeholder: "Ej. 10",
        required: true,
        validate: (v) => {
          const n = Number(v.trim());
          if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n))
            return "Ingresa un entero positivo";
          return null;
        },
        confirmLabel: "Sumar al stock",
      });
      if (raw == null) return;
      const delta = Number(raw.trim());
      const res = await adjustProshopStock({
        productId: p.id,
        delta,
        reason: "purchase",
      });
      if (res.ok)
        toast({ icon: "check", title: `+${delta} ${p.name}`, sub: "Stock actualizado" });
      else
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const adjust = (p: PSProduct) => {
    startTransition(async () => {
      const raw = await ask({
        title: `Ajustar stock · ${p.name}`,
        label: `Stock actual: ${p.stock}. Ingresa delta (puede ser negativo)`,
        initialValue: "-1",
        placeholder: "Ej. -2 (merma) o +5 (corrección)",
        required: true,
        validate: (v) => {
          const n = Number(v.trim());
          if (!Number.isFinite(n) || n === 0 || !Number.isInteger(n))
            return "Ingresa un entero distinto de 0";
          if ((p.stock + n) < 0) return `Stock no puede quedar negativo (actual ${p.stock})`;
          return null;
        },
        confirmLabel: "Ajustar",
      });
      if (raw == null) return;
      const delta = Number(raw.trim());
      const reasonRaw = await ask({
        title: "Motivo del ajuste",
        label: "adjustment / damaged / return",
        initialValue: delta < 0 ? "damaged" : "adjustment",
        required: true,
        validate: (v) =>
          ["adjustment", "damaged", "return"].includes(v.trim())
            ? null
            : "adjustment, damaged o return",
        confirmLabel: "Registrar",
      });
      if (reasonRaw == null) return;
      const res = await adjustProshopStock({
        productId: p.id,
        delta,
        reason: reasonRaw.trim() as "adjustment" | "damaged" | "return",
      });
      if (res.ok)
        toast({
          icon: "check",
          title: `${delta > 0 ? "+" : ""}${delta} ${p.name}`,
          sub: "Stock ajustado",
        });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const skus = data.products.length;
  const totalStock = data.products.reduce((s, p) => s + p.stock, 0);
  const inventoryValueCents = data.products.reduce(
    (s, p) => s + p.stock * p.priceCents,
    0,
  );

  return (
    <>
      <div className="mp-shop-stats mp-grid-form-4 gap-3.5" style={{ marginBottom: 16 }}>
        {[
          { l: "SKUs", v: String(skus), sub: `${data.categories.length} categorías`, color: "#0a0a0a" },
          { l: "Bajo stock", v: String(lowStock.length), sub: "necesitan reposición", color: "#dc2626" },
          {
            l: "Stock total",
            v: String(totalStock),
            sub: "unidades en bodega",
            color: "var(--primary)",
          },
          {
            l: "Valor inventario",
            v: formatMoney(inventoryValueCents, data.defaultCurrency),
            sub: "a precio venta",
            color: "#fbbf24",
          },
        ].map((k) => (
          <div key={k.l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{k.l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.035em",
                marginTop: 8,
                color: k.color,
              }}
            >
              {k.v}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div
          className="card"
          style={{
            padding: 18,
            marginBottom: 14,
            background: "rgba(220,38,38,0.04)",
            border: "1px solid rgba(220,38,38,0.25)",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div className="label-mp" style={{ color: "#dc2626" }}>
              ⚠ Bajo stock · acción requerida
            </div>
            <h3
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              {lowStock.length} producto{lowStock.length === 1 ? "" : "s"} por reponer
              <span className="dot">.</span>
            </h3>
          </div>
          <div className="mp-shop-low mp-grid-form-3 gap-2.5">
            {lowStock.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: 12,
                  background: "#fff",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: p.coverUrl ? `url(${p.coverUrl}) center/cover` : p.bg,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {!p.coverUrl && (
                    <Icon name={p.icon} size={16} color="rgba(255,255,255,0.85)" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "#dc2626",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                    }}
                  >
                    ● {p.stock} de {p.lowStockThreshold} mín.
                  </div>
                </div>
                <button
                  className="btn"
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    fontSize: 9.5,
                    padding: "5px 10px",
                  }}
                  disabled={isPending}
                  onClick={() => replenish(p)}
                >
                  + Reponer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 22px 14px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label-mp">Stock · todos los productos</div>
            <h3
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              Inventario completo<span className="dot">.</span>
            </h3>
          </div>
        </div>
        <div className="mp-table-scroll">
          <div>
            <div
              className="mp-table-row"
              style={{
                display: "grid",
                gridTemplateColumns: PROSHOP_INV_COLS,
                gap: 12,
                alignItems: "center",
                padding: "10px 22px",
                background: "var(--muted)",
              }}
            >
              <div />
              <div className="label-mp">Producto</div>
              <div className="label-mp">Categoría</div>
              <div className="label-mp">Stock</div>
              <div className="label-mp" style={{ textAlign: "right" }}>
                Precio
              </div>
              <div className="label-mp" style={{ textAlign: "right" }}>
                Acción
              </div>
            </div>
            {data.products.length === 0 && (
              <div
                style={{
                  padding: 28,
                  textAlign: "center",
                  color: "var(--muted-fg)",
                  fontSize: 11.5,
                }}
              >
                Aún no hay productos. Carga uno desde la pestaña Catálogo.
              </div>
            )}
            {data.products.map((p, i) => {
              const lvl = Math.min(100, (p.stock / Math.max(1, p.lowStockThreshold * 3)) * 100);
              const barColor =
                p.stock <= 0
                  ? "#7c1d1d"
                  : p.stock <= p.lowStockThreshold
                    ? "#dc2626"
                    : p.stock <= p.lowStockThreshold * 2
                      ? "#fbbf24"
                      : "#10b981";
              return (
                <div
                  key={p.id}
                  className="mp-table-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: PROSHOP_INV_COLS,
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 22px",
                    borderTop: i === 0 ? 0 : "1px dashed var(--border)",
                    opacity: p.active ? 1 : 0.55,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      background: p.coverUrl ? `url(${p.coverUrl}) center/cover` : p.bg,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {!p.coverUrl && (
                      <Icon name={p.icon} size={13} color="rgba(255,255,255,0.85)" />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>
                      {p.name}
                      {!p.active && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 9,
                            color: "var(--muted-fg)",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          (inactivo)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>
                      {p.sku ? `SKU ${p.sku} · ` : ""}mínimo {p.lowStockThreshold}
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 9999,
                        background: "var(--muted)",
                        fontSize: 9.5,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {p.cat}
                    </span>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span
                        className="font-heading tabular"
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          letterSpacing: "-0.02em",
                          color: p.stock <= p.lowStockThreshold ? "#dc2626" : "#0a0a0a",
                        }}
                      >
                        {p.stock}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>
                        / mín {p.lowStockThreshold}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 3,
                        background: "var(--muted)",
                        borderRadius: 9999,
                        marginTop: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{ height: "100%", width: lvl + "%", background: barColor }}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      className="font-heading tabular"
                      style={{ fontSize: 14, fontWeight: 900 }}
                    >
                      {formatMoney(p.priceCents, p.currency)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button
                      className="btn"
                      style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        fontSize: 9.5,
                        padding: "5px 10px",
                      }}
                      disabled={isPending}
                      onClick={() => replenish(p)}
                    >
                      <Icon name="plus" size={10} />+ Stock
                    </button>
                    <button
                      onClick={() => adjust(p)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: "var(--muted)",
                        border: 0,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Ajustar stock (merma / corrección)"
                      disabled={isPending}
                    >
                      <Icon name="sliders" size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Catálogo tab ───────────────────────────────────────────────────────
function CatalogoTab({ data }: { data: ProShopData }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    sku: "",
    price: "",
    stock: "0",
    minStock: "5",
    categoryId: data.categories[0]?.id ?? "",
  });

  const reset = () =>
    setForm({
      name: "",
      sku: "",
      price: "",
      stock: "0",
      minStock: "5",
      categoryId: data.categories[0]?.id ?? "",
    });

  const submit = () => {
    if (!data.clubId) {
      toast({ icon: "alert-triangle", title: "Sin club activo" });
      return;
    }
    const name = form.name.trim();
    if (!name) {
      toast({ icon: "alert-triangle", title: "Ingresa un nombre" });
      return;
    }
    const priceFloat = Number(form.price.replace(",", "."));
    if (!Number.isFinite(priceFloat) || priceFloat < 0) {
      toast({ icon: "alert-triangle", title: "Precio inválido" });
      return;
    }
    const stock = Number(form.stock);
    const minStock = Number(form.minStock);
    if (!Number.isInteger(stock) || stock < 0) {
      toast({ icon: "alert-triangle", title: "Stock inicial inválido" });
      return;
    }
    if (!Number.isInteger(minStock) || minStock < 0) {
      toast({ icon: "alert-triangle", title: "Mínimo inválido" });
      return;
    }
    startTransition(async () => {
      const res = await createProshopProduct({
        clubId: data.clubId!,
        name,
        sku: form.sku.trim() || null,
        priceCents: Math.round(priceFloat * 100),
        currency: data.defaultCurrency,
        stock,
        lowStockThreshold: minStock,
        categoryId: form.categoryId || null,
        active: true,
      });
      if (res.ok) {
        toast({ icon: "check-circle-2", title: `Publicado · ${name}` });
        reset();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo publicar",
          sub: res.error.message,
        });
      }
    });
  };

  const toggleActive = (p: PSProduct) => {
    startTransition(async () => {
      if (p.active) {
        const ok = await confirm({
          title: `Desactivar ${p.name}?`,
          body: "El producto deja de aparecer en el POS y en la tienda pública. El stock no se modifica. Puedes reactivarlo cuando quieras.",
          confirmLabel: "Desactivar",
        });
        if (!ok) return;
      }
      const res = await updateProshopProduct({
        productId: p.id,
        patch: { active: !p.active },
      });
      if (res.ok)
        toast({
          icon: "check",
          title: p.active ? "Desactivado" : "Reactivado",
          sub: p.name,
        });
      else
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <div
      className="mp-shop-cat mp-grid-split-wide gap-4"
      style={{ alignItems: "flex-start" }}
    >
      <div className="card" style={{ padding: 20, position: "sticky", top: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: "var(--primary)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="package-plus" size={17} color="#fff" />
          </div>
          <div>
            <div className="label-mp">Nuevo producto</div>
            <h3
              className="font-heading"
              style={{
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              Subir al catálogo<span className="dot">.</span>
            </h3>
          </div>
        </div>
        <FormField label="Nombre">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ej. Wilson Pro Staff x3"
            style={inputStyle}
          />
        </FormField>
        <FormField label="SKU (opcional)">
          <input
            value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            placeholder="Ej. WPS-3"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Categoría">
          <select
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            style={inputStyle}
          >
            <option value="">Sin categoría</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="mp-grid-form-2 gap-2" style={{ marginBottom: 12 }}>
          <FormField label={`Precio (${data.defaultCurrency})`}>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 12,
                  color: "var(--muted-fg)",
                  fontWeight: 800,
                }}
              >
                $
              </span>
              <input
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
                inputMode="decimal"
                style={{ ...inputStyle, paddingLeft: 22 }}
              />
            </div>
          </FormField>
          <FormField label="Stock inicial">
            <input
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              placeholder="0"
              inputMode="numeric"
              style={inputStyle}
            />
          </FormField>
        </div>
        <FormField label="Mínimo (low stock)">
          <input
            value={form.minStock}
            onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
            placeholder="5"
            inputMode="numeric"
            style={inputStyle}
          />
        </FormField>
        <button
          className="btn btn-primary"
          style={{ width: "100%", fontSize: 12, marginTop: 4 }}
          disabled={isPending || !data.clubId}
          onClick={submit}
        >
          <Icon name="check" size={13} color="#fff" />
          {isPending ? "Publicando…" : "Publicar al catálogo"}
        </button>
        <div
          style={{
            marginTop: 10,
            fontSize: 10,
            color: "var(--muted-fg)",
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          El producto aparece de inmediato en el POS y en la tienda pública.
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
            gap: 10,
          }}
        >
          <h3
            className="font-heading"
            style={{
              fontSize: 17,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Catálogo actual<span className="dot">.</span>
          </h3>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {data.products.length} producto{data.products.length === 1 ? "" : "s"} ·{" "}
            {data.categories.length} categorías
          </span>
        </div>
        {data.products.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 30,
              textAlign: "center",
              color: "var(--muted-fg)",
              fontSize: 12,
              border: "1px dashed var(--border)",
              background: "#fafafa",
            }}
          >
            Sin productos. Sube el primero desde el form de la izquierda.
          </div>
        ) : (
          <div className="mp-shop-catgrid mp-grid-form-3 gap-2.5">
            {data.products.map((p) => (
              <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    height: 70,
                    background: p.coverUrl ? `url(${p.coverUrl}) center/cover` : p.bg,
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {!p.coverUrl && (
                    <Icon name={p.icon} size={26} color="rgba(255,255,255,0.75)" />
                  )}
                  <button
                    onClick={() => toggleActive(p)}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(0,0,0,0.55)",
                      color: "#fff",
                      border: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: "0.06em",
                    }}
                    disabled={isPending}
                  >
                    {p.active ? "DESACTIVAR" : "ACTIVAR"}
                  </button>
                </div>
                <div style={{ padding: 10 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "var(--muted-fg)",
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {p.cat}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      marginTop: 2,
                      lineHeight: 1.25,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 6,
                      fontSize: 10,
                    }}
                  >
                    <span
                      className="font-heading tabular"
                      style={{ fontSize: 13, fontWeight: 900 }}
                    >
                      {formatMoney(p.priceCents, p.currency)}
                    </span>
                    <span style={{ color: "var(--muted-fg)" }}>{p.stock} stock</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          display: "block",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "inherit",
};

// ── Movimientos tab ────────────────────────────────────────────────────
function MovimientosTab({ data }: { data: ProShopData }) {
  const txns = data.todaySales;
  const todayTotal = txns.reduce((s, t) => s + t.totalCents, 0);
  const cashTotal = txns
    .filter((t) => t.method === "cash")
    .reduce((s, t) => s + t.totalCents, 0);
  const digitalTotal = txns
    .filter((t) => t.method === "transfer" || t.method === "wallet" || t.method === "card")
    .reduce((s, t) => s + t.totalCents, 0);
  const ticketAvgCents = txns.length > 0 ? Math.round(todayTotal / txns.length) : 0;
  const currency = data.defaultCurrency;

  const methodColor: Record<string, string> = {
    cash: "#10b981",
    transfer: "#0ea5e9",
    wallet: "#7c3aed",
    card: "#fbbf24",
  };
  const methodLabel: Record<string, string> = {
    cash: "Efectivo",
    transfer: "Transferencia",
    wallet: "Billetera",
    card: "Tarjeta",
    free: "Cortesía",
  };

  return (
    <>
      <div className="mp-shop-stats mp-grid-form-4 gap-3.5" style={{ marginBottom: 16 }}>
        {[
          {
            l: "Ventas hoy",
            v: formatMoney(todayTotal, currency),
            sub: txns.length + " transacciones",
            color: "var(--primary)",
            icon: "trending-up",
          },
          {
            l: "Caja efectivo",
            v: formatMoney(cashTotal, currency),
            sub: "a entregar al cierre",
            color: "#0a0a0a",
            icon: "banknote",
          },
          {
            l: "Digital",
            v: formatMoney(digitalTotal, currency),
            sub: "transfer + tarjeta + billetera",
            color: "#0ea5e9",
            icon: "smartphone",
          },
          {
            l: "Ticket promedio",
            v: formatMoney(ticketAvgCents, currency),
            sub: txns.length === 0 ? "sin ventas aún" : `${txns.length} ventas`,
            color: "#fbbf24",
            icon: "receipt",
          },
        ].map((k) => (
          <div
            key={k.l}
            className="card"
            style={{ padding: 16, position: "relative", overflow: "hidden" }}
          >
            <div
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--muted)",
                color: k.color,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={k.icon} size={15} color={k.color} />
            </div>
            <div className="label-mp" style={{ paddingRight: 40 }}>
              {k.l}
            </div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: "-0.035em",
                marginTop: 8,
                color: k.color,
              }}
            >
              {k.v}
            </div>
            <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 22px 14px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div>
            <div className="label-mp">Hoy</div>
            <h3
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              Movimientos del día<span className="dot">.</span>
            </h3>
          </div>
        </div>
        {txns.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              color: "var(--muted-fg)",
              fontSize: 11.5,
            }}
          >
            Sin ventas registradas hoy.
          </div>
        ) : (
          <div className="mp-table-scroll">
          {txns.map((t, i) => (
            <div
              key={t.id}
              className="mp-table-row"
              style={{
                display: "grid",
                gridTemplateColumns: "50px 1fr 110px 90px",
                gap: 10,
                alignItems: "center",
                padding: "11px 22px",
                borderTop: i === 0 ? 0 : "1px dashed var(--border)",
              }}
            >
              <span
                style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}
                className="tabular"
              >
                {t.time}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800 }}>{t.customer}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted-fg)",
                    marginTop: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {t.itemsLabel}
                </div>
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  padding: "2px 7px",
                  borderRadius: 9999,
                  background: (methodColor[t.method] ?? "#a1a1aa") + "22",
                  color: methodColor[t.method] ?? "#a1a1aa",
                  letterSpacing: "0.08em",
                  textAlign: "center",
                  justifySelf: "flex-start",
                  textTransform: "uppercase",
                }}
              >
                {(methodLabel[t.method] ?? t.method).toUpperCase()}
              </span>
              <span
                className="font-heading tabular"
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  textAlign: "right",
                  color: "var(--primary)",
                }}
              >
                +{formatMoney(t.totalCents, t.currency)}
              </span>
            </div>
          ))}
          </div>
        )}
      </div>
    </>
  );
}
