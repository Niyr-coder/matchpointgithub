// CarritoModal — migrado 1:1 desde ui_kits/dashboard/CarritoModal.jsx
// 4 vistas: mini (drawer derecha) | full | checkout | success
// Eventos: 'mp-open-carrito' (detail: { view }), 'mp-add-to-cart', 'mp-cart-changed'
// Expone window.mpCart helper (count/add/inc/dec/remove/clear/open)
"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";

type CartItem = {
  sku: string;
  name: string;
  cat: string;
  color: string;
  icon: string;
  qty: number;
  price: number;
  was?: number;
};

type View = "mini" | "full" | "checkout" | "success";

const CR_KEY = "mp-cart";
const CR_DEFAULT: CartItem[] = [
  { sku: "BP-V04-BLK", name: "Bullpadel Vertex 04", cat: "Paleta · Pickleball", color: "linear-gradient(135deg,#0a0a0a,#27272a)", icon: "circle", qty: 1, price: 189, was: 229 },
  { sku: "HD-PRO-3", name: "Pelotas Head Pro x3", cat: "Pelotas · 3 unid.", color: "linear-gradient(135deg,#facc15,#ca8a04)", icon: "circle-dot", qty: 2, price: 9, was: 12 },
  { sku: "MP-TEE-M", name: "Polera Match Tech", cat: "Ropa · Talla M", color: "linear-gradient(135deg,#10b981,#047857)", icon: "shirt", qty: 1, price: 25 },
];

function crLoad(): CartItem[] {
  try {
    const raw = localStorage.getItem(CR_KEY);
    if (raw) return JSON.parse(raw) as CartItem[];
  } catch {}
  return CR_DEFAULT;
}

function crSave(items: CartItem[]) {
  try {
    localStorage.setItem(CR_KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new Event("mp-cart-changed"));
}

const crFmt = (n: number) => "$" + n.toFixed(2);
const crGhost: CSSProperties = { background: "#fff", border: "1px solid var(--border)" };

type MpCartApi = {
  get: () => CartItem[];
  count: () => number;
  add: (it: Partial<CartItem>) => void;
  inc: (sku: string) => void;
  dec: (sku: string) => void;
  remove: (sku: string) => void;
  clear: () => void;
  open: (v?: View) => void;
};

export function CarritoModal() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("mini");
  const [items, setItems] = useState<CartItem[]>([]);
  const toast = useToast();

  // Inicial: hidratar items en effect (SSR-safe)
  useEffect(() => {
    setItems(crLoad());
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: View }>).detail;
      setOpen(true);
      setView(detail?.view || "mini");
    };
    const onAdd = (e: Event) => {
      const it = (e as CustomEvent<Partial<CartItem>>).detail || {};
      setItems((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((x) => x.sku === it.sku);
        if (idx >= 0) {
          next[idx] = { ...next[idx], qty: next[idx].qty + (it.qty || 1) };
        } else {
          next.push({
            sku: it.sku || "UNKNOWN",
            name: it.name || "Producto",
            cat: it.cat || "—",
            color: it.color || "linear-gradient(135deg,#0a0a0a,#374151)",
            icon: it.icon || "shopping-bag",
            qty: it.qty || 1,
            price: it.price || 0,
            was: it.was,
          });
        }
        crSave(next);
        return next;
      });
      toast({ icon: "shopping-cart", title: "Añadido al carro", sub: it.name });
    };
    const onChanged = () => setItems(crLoad());
    window.addEventListener("mp-open-carrito", onOpen);
    window.addEventListener("mp-add-to-cart", onAdd);
    window.addEventListener("mp-cart-changed", onChanged);
    return () => {
      window.removeEventListener("mp-open-carrito", onOpen);
      window.removeEventListener("mp-add-to-cart", onAdd);
      window.removeEventListener("mp-cart-changed", onChanged);
    };
  }, [toast]);

  // Expone window.mpCart helper
  useEffect(() => {
    const api: MpCartApi = {
      get: () => crLoad(),
      count: () => crLoad().reduce((s, x) => s + x.qty, 0),
      add: (it) => window.dispatchEvent(new CustomEvent("mp-add-to-cart", { detail: it })),
      inc: (sku) => {
        const n = crLoad().map((x) => (x.sku === sku ? { ...x, qty: x.qty + 1 } : x));
        crSave(n);
        setItems(n);
      },
      dec: (sku) => {
        const n = crLoad().flatMap((x) =>
          x.sku === sku ? (x.qty <= 1 ? [] : [{ ...x, qty: x.qty - 1 }]) : [x]
        );
        crSave(n);
        setItems(n);
      },
      remove: (sku) => {
        const n = crLoad().filter((x) => x.sku !== sku);
        crSave(n);
        setItems(n);
      },
      clear: () => {
        crSave([]);
        setItems([]);
      },
      open: (v) =>
        window.dispatchEvent(new CustomEvent("mp-open-carrito", { detail: { view: v } })),
    };
    (window as unknown as { mpCart?: MpCartApi }).mpCart = api;
  }, []);

  if (!open) return null;
  const close = () => setOpen(false);
  const subtotal = items.reduce((s, x) => s + x.price * x.qty, 0);
  const shipping = subtotal >= 50 ? 0 : 4.5;
  const discount = items.length ? 3.3 : 0;
  const tax = subtotal * 0.12;
  const total = subtotal - discount + shipping + tax;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: view !== "mini" ? "blur(4px)" : "none",
        zIndex: 1000,
        display: "flex",
        justifyContent: view === "mini" ? "flex-end" : "center",
        alignItems: view === "mini" ? "stretch" : "center",
        padding: view === "mini" ? 0 : 24,
        fontFamily: "inherit",
      }}
    >
      {view === "mini" && (
        <CRMini close={close} items={items} subtotal={subtotal} setView={setView} />
      )}
      {view === "full" && (
        <CRFull
          close={close}
          items={items}
          subtotal={subtotal}
          discount={discount}
          shipping={shipping}
          tax={tax}
          total={total}
          setView={setView}
        />
      )}
      {view === "checkout" && (
        <CRCheckout close={close} items={items} total={total} setView={setView} />
      )}
      {view === "success" && <CRSuccess close={close} />}
    </div>
  );
}

function getCart(): MpCartApi {
  return (
    (window as unknown as { mpCart?: MpCartApi }).mpCart || {
      get: () => [],
      count: () => 0,
      add: () => {},
      inc: () => {},
      dec: () => {},
      remove: () => {},
      clear: () => {},
      open: () => {},
    }
  );
}

// ── Mini drawer ──────────────────────────────────────────────────────
function CRMini({
  close,
  items,
  subtotal,
  setView,
}: {
  close: () => void;
  items: CartItem[];
  subtotal: number;
  setView: (v: View) => void;
}) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 420,
        maxWidth: "100%",
        height: "100%",
        background: "#fff",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        transform: enter ? "none" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Tu carro
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            {items.length} producto{items.length !== 1 && "s"}
            <span style={{ color: "var(--primary)" }}>.</span>
          </div>
        </div>
        <button
          onClick={close}
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
            padding: 0,
            lineHeight: 1,
          }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "var(--muted)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="shopping-cart" size={26} color="var(--muted-fg)" />
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Tu carro está vacío
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
            Agrega productos desde la tienda
          </div>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={close}>
            Seguir comprando
          </button>
        </div>
      ) : (
        <>
          <div style={{ padding: "12px 20px 6px" }}>
            {subtotal < 50 ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10.5,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ color: "var(--muted-fg)" }}>
                    Te faltan{" "}
                    <b style={{ color: "var(--primary)" }}>${(50 - subtotal).toFixed(2)}</b> para
                    envío gratis
                  </span>
                  <span style={{ fontWeight: 800 }}>{crFmt(subtotal)} / $50</span>
                </div>
                <div
                  style={{
                    height: 5,
                    background: "var(--muted)",
                    borderRadius: 9999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: Math.min(100, (subtotal / 50) * 100) + "%",
                      background: "linear-gradient(90deg, var(--primary), #fbbf24)",
                    }}
                  />
                </div>
              </>
            ) : (
              <div style={{ fontSize: 10.5, color: "var(--primary)", fontWeight: 800 }}>
                ● Envío gratis desbloqueado
              </div>
            )}
          </div>

          <div
            style={{
              padding: "14px 20px",
              overflow: "auto",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {items.map((it) => (
              <div
                key={it.sku}
                style={{
                  display: "flex",
                  gap: 12,
                  paddingBottom: 12,
                  borderBottom: "1px dashed var(--border)",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    background: it.color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={it.icon} size={20} color="rgba(255,255,255,0.55)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 900,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.2,
                    }}
                  >
                    {it.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>
                    {it.cat}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <QtyControl sku={it.sku} qty={it.qty} />
                    <div
                      className="font-heading"
                      style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em" }}
                    >
                      {crFmt(it.price * it.qty)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: 8,
                border: "1.5px dashed var(--border)",
                borderRadius: 9999,
              }}
            >
              <span style={{ marginLeft: 6 }}>
                <Icon name="ticket" size={13} color="var(--muted-fg)" />
              </span>
              <input
                placeholder="Código promo · ej. VERANO15"
                style={{ flex: 1, border: 0, outline: "none", fontSize: 11, fontFamily: "inherit" }}
              />
              <button
                style={{
                  padding: "5px 10px",
                  borderRadius: 9999,
                  background: "#0a0a0a",
                  color: "#fff",
                  border: 0,
                  fontSize: 9.5,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                }}
              >
                Aplicar
              </button>
            </div>
          </div>

          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <span style={{ color: "var(--muted-fg)" }}>Subtotal</span>
              <span style={{ fontWeight: 800 }}>{crFmt(subtotal)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <span style={{ color: "var(--muted-fg)" }}>Envío · estimado</span>
              <span style={{ fontWeight: 800 }}>{crFmt(subtotal >= 50 ? 0 : 4.5)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 8,
                borderTop: "1px solid var(--border)",
                marginTop: 6,
                marginBottom: 12,
              }}
            >
              <span
                className="font-heading"
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Total
              </span>
              <span
                className="font-heading"
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "var(--primary)",
                }}
              >
                {crFmt(subtotal + (subtotal >= 50 ? 0 : 4.5))}
              </span>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setView("checkout")}
            >
              Ir a pagar
              <Icon name="arrow-right" size={13} color="#fff" />
            </button>
            <button
              className="btn"
              style={{
                ...crGhost,
                width: "100%",
                justifyContent: "center",
                marginTop: 6,
                fontSize: 10.5,
              }}
              onClick={() => setView("full")}
            >
              Ver carro completo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function QtyControl({ sku, qty }: { sku: string; qty: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        border: "1px solid var(--border)",
        borderRadius: 9999,
        padding: 1,
      }}
    >
      <button
        onClick={() => getCart().dec(sku)}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="minus" size={11} />
      </button>
      <span
        className="font-heading"
        style={{ fontSize: 11.5, fontWeight: 900, minWidth: 16, textAlign: "center" }}
      >
        {qty}
      </span>
      <button
        onClick={() => getCart().inc(sku)}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--muted)",
          border: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="plus" size={11} />
      </button>
    </div>
  );
}

// ── Full cart ────────────────────────────────────────────────────────
function CRFull({
  close,
  items,
  subtotal,
  discount,
  shipping,
  tax,
  total,
  setView,
}: {
  close: () => void;
  items: CartItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  setView: (v: View) => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="card"
      style={{
        width: "100%",
        maxWidth: 1080,
        maxHeight: "92vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        background: "#fff",
        boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div className="label-mp">Shop · Tu carro</div>
          <div
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Tu carro <span style={{ color: "var(--primary)" }}>●</span> {items.length} producto
            {items.length !== 1 && "s"}
            <span style={{ color: "var(--primary)" }}>.</span>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => getCart().clear()}
            style={{
              background: "transparent",
              border: 0,
              fontSize: 10.5,
              fontWeight: 800,
              color: "var(--muted-fg)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
              fontFamily: "inherit",
            }}
          >
            <Icon name="trash-2" size={12} />
            Vaciar
          </button>
          <button
            onClick={close}
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
              padding: 0,
              lineHeight: 1,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 24px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: 10,
            background: "var(--muted)",
            borderRadius: 9999,
          }}
        >
          {["Carro", "Envío y pago", "Confirmación"].map((s, i) => (
            <div key={s} style={{ display: "contents" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: i ? 14 : 4 }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: i === 0 ? "#0a0a0a" : "#fff",
                    color: i === 0 ? "#fff" : "var(--muted-fg)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9.5,
                    fontWeight: 900,
                    fontFamily: "Plus Jakarta Sans",
                  }}
                >
                  {i + 1}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: i === 0 ? 900 : 700,
                    color: i === 0 ? "#0a0a0a" : "var(--muted-fg)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {s}
                </span>
              </div>
              {i < 2 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--border)",
                    margin: "0 12px",
                    maxWidth: 80,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: 22,
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gap: 22,
          overflow: "auto",
          flex: 1,
        }}
      >
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden", alignSelf: "flex-start" }}
        >
          <div
            style={{
              padding: "10px 16px",
              display: "grid",
              gridTemplateColumns: "1fr 90px 90px 90px 24px",
              gap: 14,
              alignItems: "center",
              borderBottom: "1px solid var(--border)",
              background: "var(--muted)",
            }}
          >
            <div className="label-mp">Producto</div>
            <div className="label-mp" style={{ textAlign: "center" }}>
              Cantidad
            </div>
            <div className="label-mp" style={{ textAlign: "right" }}>
              Unitario
            </div>
            <div className="label-mp" style={{ textAlign: "right" }}>
              Subtotal
            </div>
            <div />
          </div>
          {items.map((it, idx) => (
            <div
              key={it.sku}
              style={{
                padding: 14,
                display: "grid",
                gridTemplateColumns: "1fr 90px 90px 90px 24px",
                gap: 14,
                alignItems: "center",
                borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : 0,
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 10,
                    background: it.color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={it.icon} size={22} color="rgba(255,255,255,0.55)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="font-heading"
                    style={{ fontSize: 13.5, fontWeight: 900, letterSpacing: "-0.01em" }}
                  >
                    {it.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                    {it.cat} · SKU {it.sku}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--primary)",
                      fontWeight: 800,
                      marginTop: 4,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="truck" size={11} color="var(--primary)" />
                    Llega en 2–3 días
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <QtyControl sku={it.sku} qty={it.qty} />
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="font-heading"
                  style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.02em" }}
                >
                  {crFmt(it.price)}
                </div>
                {it.was && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted-fg)",
                      textDecoration: "line-through",
                    }}
                  >
                    {crFmt(it.was)}
                  </div>
                )}
              </div>
              <div
                className="font-heading"
                style={{
                  textAlign: "right",
                  fontSize: 15,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "var(--primary)",
                }}
              >
                {crFmt(it.price * it.qty)}
              </div>
              <button
                onClick={() => getCart().remove(it.sku)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--muted-fg)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="label-mp" style={{ marginBottom: 12 }}>
              Resumen
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(
                [
                  [
                    "Subtotal · " + items.reduce((s, x) => s + x.qty, 0) + " ítems",
                    crFmt(subtotal),
                  ],
                  ["Descuento · VERANO15", "–" + crFmt(discount), "var(--primary)"],
                  ["Envío estándar", shipping === 0 ? "Gratis" : crFmt(shipping)],
                  ["IVA · 12%", crFmt(tax)],
                ] as [string, string, string?][]
              ).map(([k, v, col]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    padding: "5px 0",
                    borderBottom: "1px dashed var(--border)",
                  }}
                >
                  <span style={{ color: "var(--muted-fg)" }}>{k}</span>
                  <span style={{ fontWeight: 800, color: col || "#0a0a0a" }}>{v}</span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "10px 0 0",
                borderTop: "1.5px solid #0a0a0a",
                marginTop: 6,
              }}
            >
              <span
                className="font-heading"
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Total
              </span>
              <span
                className="font-heading"
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "var(--primary)",
                }}
              >
                {crFmt(total)}
              </span>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
              onClick={() => setView("checkout")}
            >
              <Icon name="lock" size={13} color="#fff" />
              Continuar al pago
            </button>
            <button
              className="btn"
              style={{
                ...crGhost,
                width: "100%",
                justifyContent: "center",
                marginTop: 6,
                fontSize: 10.5,
              }}
              onClick={close}
            >
              <Icon name="arrow-left" size={12} />
              Seguir comprando
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Checkout ─────────────────────────────────────────────────────────
function CKField({ label, val, hint }: { label: string; val: string; hint?: string }) {
  return (
    <div>
      <div className="label-mp" style={{ marginBottom: 5 }}>
        {label}
        {hint && (
          <span
            style={{
              marginLeft: 6,
              color: "var(--muted-fg)",
              textTransform: "none",
              letterSpacing: 0,
              fontSize: 9.5,
              fontWeight: 600,
            }}
          >
            · {hint}
          </span>
        )}
      </div>
      <div
        style={{
          padding: "9px 12px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          background: "#fff",
        }}
      >
        {val}
      </div>
    </div>
  );
}

function CRCheckout({
  close,
  items,
  total,
  setView,
}: {
  close: () => void;
  items: CartItem[];
  total: number;
  setView: (v: View) => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="card"
      style={{
        width: "100%",
        maxWidth: 1080,
        maxHeight: "92vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        background: "#fff",
        boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div className="label-mp">Paso 2 · Envío y pago</div>
          <div
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Checkout<span style={{ color: "var(--primary)" }}>.</span>
          </div>
        </div>
        <button
          onClick={close}
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
            padding: 0,
            lineHeight: 1,
          }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div
        style={{
          padding: 22,
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 22,
          overflow: "auto",
          flex: 1,
        }}
      >
        <div>
          <CheckoutSection num="1" title="Dirección de envío" right="Cambiar">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <CKField label="Nombre" val="Camila Aguilar" />
              <CKField label="Teléfono" val="+593 99 244 1208" />
              <CKField label="Dirección" val="Calle de los Tulipanes N32-12" hint="Cumbayá" />
              <CKField label="Ciudad" val="Quito · Pichincha" />
            </div>
          </CheckoutSection>

          <CheckoutSection num="2" title="Envío">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { l: "Estándar", s: "2–3 días", p: "$4.50", on: true, i: "truck" },
                { l: "Express", s: "Mañana", p: "$8.90", on: false, i: "zap" },
                {
                  l: "Recoger en club",
                  s: "Club Norte · gratis",
                  p: "$0.00",
                  on: false,
                  i: "building-2",
                },
              ].map((o) => (
                <button
                  key={o.l}
                  style={{
                    padding: 11,
                    borderRadius: 10,
                    fontFamily: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    background: o.on ? "#ecfdf5" : "#fff",
                    border: o.on ? "2px solid var(--primary)" : "1px solid var(--border)",
                  }}
                >
                  <Icon name={o.i} size={14} color={o.on ? "var(--primary)" : "#0a0a0a"} />
                  <div style={{ fontSize: 11.5, fontWeight: 900, marginTop: 6 }}>{o.l}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{o.s}</div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 900,
                      marginTop: 5,
                      letterSpacing: "-0.01em",
                      color: o.on ? "var(--primary)" : "#0a0a0a",
                    }}
                  >
                    {o.p}
                  </div>
                </button>
              ))}
            </div>
          </CheckoutSection>

          <CheckoutSection num="3" title="Método de pago" darkNum>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
                marginBottom: 12,
              }}
            >
              {[
                { l: "Tarjeta", i: "credit-card", on: true },
                { l: "PayPhone", i: "smartphone", on: false },
                { l: "Transfer", i: "building-2", on: false },
                { l: "Contra entrega", i: "banknote", on: false },
              ].map((p) => (
                <button
                  key={p.l}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 9999,
                    fontFamily: "inherit",
                    fontSize: 10.5,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    cursor: "pointer",
                    background: p.on ? "#0a0a0a" : "#fff",
                    color: p.on ? "#fff" : "#0a0a0a",
                    border: "1px solid " + (p.on ? "#0a0a0a" : "var(--border)"),
                  }}
                >
                  <Icon name={p.i} size={12} color={p.on ? "#fff" : "#0a0a0a"} />
                  {p.l}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", gap: 8 }}>
              <CKField
                label="Número de tarjeta"
                val="•••• •••• •••• 4886"
                hint="Visa · Camila Aguilar"
              />
              <CKField label="Vencimiento" val="09 / 28" />
              <CKField label="CVV" val="•••" />
            </div>
          </CheckoutSection>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="label-mp" style={{ marginBottom: 10 }}>
              Tu pedido · {items.reduce((s, x) => s + x.qty, 0)} ítems
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                paddingBottom: 10,
                borderBottom: "1px dashed var(--border)",
                marginBottom: 10,
              }}
            >
              {items.map((it) => (
                <div key={it.sku} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div
                    style={{
                      position: "relative",
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: it.color,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={it.icon} size={15} color="rgba(255,255,255,0.55)" />
                    <span
                      style={{
                        position: "absolute",
                        top: -5,
                        right: -5,
                        width: 15,
                        height: 15,
                        borderRadius: "50%",
                        background: "#0a0a0a",
                        color: "#fff",
                        fontSize: 8.5,
                        fontWeight: 900,
                        fontFamily: "Plus Jakarta Sans",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {it.qty}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, lineHeight: 1.2 }}>{it.name}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{it.cat}</div>
                  </div>
                  <div className="font-heading" style={{ fontSize: 11.5, fontWeight: 900 }}>
                    {crFmt(it.price * it.qty)}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "8px 0 0",
                borderTop: "1.5px solid #0a0a0a",
              }}
            >
              <span
                className="font-heading"
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Total
              </span>
              <span
                className="font-heading"
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "var(--primary)",
                }}
              >
                {crFmt(total)}
              </span>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ justifyContent: "center", padding: "12px 18px", fontSize: 12.5 }}
            onClick={() => setView("success")}
          >
            <Icon name="lock" size={14} color="#fff" />
            Pagar {crFmt(total)}
          </button>
          <button
            className="btn"
            style={{ ...crGhost, justifyContent: "center", fontSize: 10.5 }}
            onClick={() => setView("full")}
          >
            <Icon name="arrow-left" size={12} />
            Volver al carro
          </button>
          <div
            style={{
              fontSize: 9.5,
              color: "var(--muted-fg)",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Al pagar aceptas los <b style={{ color: "#0a0a0a" }}>Términos</b> y la{" "}
            <b style={{ color: "#0a0a0a" }}>Política de devolución</b>.
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutSection({
  num,
  title,
  right,
  darkNum,
  children,
}: {
  num: string;
  title: string;
  right?: string;
  darkNum?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: darkNum ? "#0a0a0a" : "var(--primary)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 900,
              fontFamily: "Plus Jakarta Sans",
            }}
          >
            {num}
          </div>
          <span
            className="font-heading"
            style={{
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
        </div>
        {right && (
          <button
            style={{
              background: "transparent",
              border: 0,
              fontSize: 10,
              fontWeight: 800,
              color: "var(--primary)",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {right}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Success ──────────────────────────────────────────────────────────
function CRSuccess({ close }: { close: () => void }) {
  useEffect(() => {
    getCart().clear();
  }, []);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="card"
      style={{
        width: "100%",
        maxWidth: 720,
        maxHeight: "92vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        background: "#fff",
        boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          position: "relative",
          padding: "28px 24px",
          background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 200,
            color: "rgba(255,255,255,0.07)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(10%, -25%)",
            textTransform: "uppercase",
          }}
        >
          PAID
        </div>
        <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "center" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 13,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check-check" size={26} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
              Pedido #SH-4821 · Confirmado
            </div>
            <h2
              className="font-heading"
              style={{
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              ¡Pago listo!<span style={{ color: "#fbbf24" }}>.</span>
            </h2>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.85)", marginTop: 5 }}>
              Enviamos el recibo a <b>camila@matchpoint.ec</b>
            </div>
          </div>
          <button
            onClick={close}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 1,
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
        </div>
      </div>

      <div style={{ padding: 22, overflow: "auto" }}>
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>
            Seguimiento · 2–3 días
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
            {[
              { l: "Pagado", s: "hoy 14:32", done: true, cur: false, i: "check" },
              { l: "En preparación", s: "mañana", done: false, cur: true, i: "package" },
              { l: "Enviado", s: "mié 14", done: false, cur: false, i: "truck" },
              { l: "Entregado", s: "jue–vie", done: false, cur: false, i: "home" },
            ].map((st, i) => (
              <div key={st.l} style={{ display: "contents" }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      margin: "0 auto",
                      borderRadius: "50%",
                      background: st.done
                        ? "var(--primary)"
                        : st.cur
                        ? "#0a0a0a"
                        : "var(--muted)",
                      color: st.done || st.cur ? "#fff" : "var(--muted-fg)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: st.cur ? "2px solid var(--primary)" : "0",
                    }}
                  >
                    <Icon name={st.i} size={13} color={st.done || st.cur ? "#fff" : "var(--muted-fg)"} />
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 900,
                      marginTop: 6,
                      color: st.done || st.cur ? "#0a0a0a" : "var(--muted-fg)",
                    }}
                  >
                    {st.l}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{st.s}</div>
                </div>
                {i < 3 && (
                  <div
                    style={{
                      flex: 0.5,
                      height: 2,
                      background: st.done ? "var(--primary)" : "var(--border)",
                      marginTop: 14,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="label-mp" style={{ marginBottom: 8 }}>
          Mientras esperas
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            { i: "calendar-plus", l: "Reservar cancha", sub: "Estrena tu paleta en Cumbayá", primary: true },
            { i: "file-text", l: "Recibo / factura", sub: "PDF · email" },
            { i: "help-circle", l: "Soporte", sub: "WhatsApp 24/7" },
          ].map((a) => (
            <button
              key={a.l}
              className="card"
              style={{
                padding: 11,
                textAlign: "left",
                cursor: "pointer",
                border: a.primary ? "2px solid var(--primary)" : undefined,
                background: a.primary ? "#ecfdf5" : "#fff",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: a.primary ? "var(--primary)" : "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 6,
                }}
              >
                <Icon name={a.i} size={12} color={a.primary ? "#fff" : "#0a0a0a"} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 900 }}>{a.l}</div>
              <div
                style={{
                  fontSize: 9.5,
                  color: "var(--muted-fg)",
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                {a.sub}
              </div>
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={close}
        >
          Volver a la tienda
        </button>
      </div>
    </div>
  );
}
