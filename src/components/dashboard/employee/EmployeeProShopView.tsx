"use client";
// Empleado · Pro shop & bar v2 — POS + inventario + catálogo + movimientos.
// Migrado del prototipo (ui_kits/dashboard/EmployeeProShopScreen.jsx): PolHero +
// 4 tabs. El carrito del POS es interactivo (estado local real). data-lucide →
// <Icon>, botones → toast.
//
// ⚠️ DEMO: catálogo/stock/ventas mock. Reemplaza la real EmployeeShopScreen +
// EmployeeShopScreenView, preservada y des-importada. Cobrar/reponer/publicar no
// persisten. Ajuste de honestidad: métodos de pago al modelo real (Efectivo/
// Transferencia/DeUna/Saldo MP — sin tarjeta/Apple Pay, no hay PSP). Ver
// 04-placeholders.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";

type Item = { id: string; name: string; cat: string; price: number; cost: number; stock: number; threshold: number; sold7d: number; bg: string; icon: string; unlimited?: boolean };

const ITEMS: Item[] = [
  { id: "p1", name: "Bullpadel Vertex 04", cat: "paletas", price: 189, cost: 110, stock: 4, threshold: 3, sold7d: 2, bg: "linear-gradient(135deg,#0a0a0a,#27272a)", icon: "circle" },
  { id: "p2", name: "Wilson Ultra v2", cat: "paletas", price: 159, cost: 92, stock: 6, threshold: 3, sold7d: 1, bg: "linear-gradient(135deg,#dc2626,#fb923c)", icon: "circle" },
  { id: "p3", name: "Head Spark Pro", cat: "paletas", price: 129, cost: 75, stock: 1, threshold: 3, sold7d: 4, bg: "linear-gradient(135deg,#0c4a6e,#0ea5e9)", icon: "circle" },
  { id: "b1", name: "Pelotas Head Pro x3", cat: "pelotas", price: 9, cost: 5, stock: 24, threshold: 12, sold7d: 18, bg: "linear-gradient(135deg,#facc15,#ca8a04)", icon: "circle-dot" },
  { id: "b2", name: "Wilson Tour x4", cat: "pelotas", price: 12, cost: 7, stock: 8, threshold: 12, sold7d: 12, bg: "linear-gradient(135deg,#fbbf24,#d97706)", icon: "circle-dot" },
  { id: "r1", name: "Polera Match Tech · M", cat: "ropa", price: 25, cost: 12, stock: 8, threshold: 4, sold7d: 5, bg: "linear-gradient(135deg,#10b981,#047857)", icon: "shirt" },
  { id: "r2", name: "Polera Match Tech · L", cat: "ropa", price: 25, cost: 12, stock: 5, threshold: 4, sold7d: 3, bg: "linear-gradient(135deg,#10b981,#047857)", icon: "shirt" },
  { id: "r3", name: "Short Pro Black", cat: "ropa", price: 22, cost: 10, stock: 2, threshold: 4, sold7d: 4, bg: "linear-gradient(135deg,#0a0a0a,#374151)", icon: "shirt" },
  { id: "a1", name: "Grip Premium", cat: "access", price: 9, cost: 3, stock: 18, threshold: 8, sold7d: 14, bg: "linear-gradient(135deg,#831843,#db2777)", icon: "circle" },
  { id: "a2", name: "Bolso Pro 2.0", cat: "access", price: 49, cost: 28, stock: 3, threshold: 2, sold7d: 1, bg: "linear-gradient(135deg,#7c3aed,#db2777)", icon: "briefcase" },
  { id: "a3", name: "Muñequera x2", cat: "access", price: 8, cost: 3, stock: 22, threshold: 8, sold7d: 9, bg: "linear-gradient(135deg,#0ea5e9,#0369a1)", icon: "circle" },
  { id: "d1", name: "Gatorade · 500ml", cat: "bar", price: 2, cost: 0.85, stock: 32, threshold: 12, sold7d: 28, bg: "linear-gradient(135deg,#fbbf24,#ea580c)", icon: "cup-soda" },
  { id: "d2", name: "Powerade · 500ml", cat: "bar", price: 2.5, cost: 1.05, stock: 18, threshold: 12, sold7d: 22, bg: "linear-gradient(135deg,#0ea5e9,#1e40af)", icon: "cup-soda" },
  { id: "d3", name: "Agua sin gas · 600ml", cat: "bar", price: 1, cost: 0.3, stock: 48, threshold: 24, sold7d: 56, bg: "linear-gradient(135deg,#bae6fd,#0ea5e9)", icon: "droplets" },
  { id: "d4", name: "Té helado · 450ml", cat: "bar", price: 1.75, cost: 0.65, stock: 14, threshold: 12, sold7d: 11, bg: "linear-gradient(135deg,#854d0e,#a16207)", icon: "cup-soda" },
  { id: "d5", name: "Coca-Cola · 500ml", cat: "bar", price: 1.5, cost: 0.55, stock: 26, threshold: 12, sold7d: 19, bg: "linear-gradient(135deg,#991b1b,#dc2626)", icon: "cup-soda" },
  { id: "d6", name: "Café americano", cat: "bar", price: 1.25, cost: 0.3, stock: 99, threshold: 0, sold7d: 42, bg: "linear-gradient(135deg,#451a03,#78350f)", icon: "coffee", unlimited: true },
  { id: "s1", name: "Sándwich pollo", cat: "snacks", price: 4, cost: 1.8, stock: 8, threshold: 6, sold7d: 14, bg: "linear-gradient(135deg,#fde68a,#f59e0b)", icon: "sandwich" },
  { id: "s2", name: "Empanada de carne", cat: "snacks", price: 1.5, cost: 0.5, stock: 22, threshold: 12, sold7d: 31, bg: "linear-gradient(135deg,#fed7aa,#ea580c)", icon: "pie-chart" },
  { id: "s3", name: "Barra energética", cat: "snacks", price: 2, cost: 0.95, stock: 4, threshold: 8, sold7d: 12, bg: "linear-gradient(135deg,#a3e635,#65a30d)", icon: "cookie" },
  { id: "s4", name: "Plátano", cat: "snacks", price: 0.5, cost: 0.15, stock: 18, threshold: 12, sold7d: 24, bg: "linear-gradient(135deg,#facc15,#65a30d)", icon: "banana" },
];

const CATS = [
  { k: "all", l: "Todos", icon: "grid-3x3" },
  { k: "paletas", l: "Paletas", icon: "circle" },
  { k: "pelotas", l: "Pelotas", icon: "circle-dot" },
  { k: "ropa", l: "Ropa", icon: "shirt" },
  { k: "access", l: "Accesorios", icon: "briefcase" },
  { k: "bar", l: "Bar", icon: "cup-soda" },
  { k: "snacks", l: "Snacks", icon: "sandwich" },
];

export function EmployeeProShopView() {
  const toast = useToast();
  const [tab, setTab] = useState<"pos" | "inv" | "cat" | "mov">("pos");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payMethod, setPayMethod] = useState("cash");
  const soon = (title: string) => toast({ icon: "sparkles", title });

  const addToCart = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeFromCart = (id: string) =>
    setCart((c) => {
      const n = { ...c };
      if (n[id] > 1) n[id]--;
      else delete n[id];
      return n;
    });
  const cartItems = Object.entries(cart).map(([id, qty]) => ({ ...ITEMS.find((p) => p.id === id)!, qty }));
  const cartSubtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const cartTax = cartSubtotal * 0.12;
  const cartTotal = cartSubtotal + cartTax;
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  const lowStock = ITEMS.filter((p) => !p.unlimited && p.stock <= p.threshold);

  const charge = () => {
    toast({ icon: "check-circle-2", title: `Venta cobrada · $${cartTotal.toFixed(2)} (demo)` });
    setCart({});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolHero
        tone="dark"
        wm="SHOP"
        accent="#10b981"
        label="Recepción · Tienda & bar"
        title="Venta y stock"
        sub="Cobra rápido, controla el stock, sube productos nuevos. Todo desde la caja."
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ padding: "8px 14px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontSize: 11, fontWeight: 800 }}>
              <span style={{ opacity: 0.6 }}>Caja jue 22 may:</span> <b style={{ color: "var(--primary)" }}>$284.50</b>
            </div>
            {lowStock.length > 0 && (
              <button onClick={() => setTab("inv")} className="btn" style={{ background: "rgba(220,38,38,0.18)", color: "#fff", border: "1px solid rgba(220,38,38,0.4)" }}>
                <Icon name="alert-triangle" size={13} color="#fca5a5" />
                {lowStock.length} en bajo stock
              </button>
            )}
          </div>
        }
      />

      <div className="card" style={{ padding: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {([
          { k: "pos", l: "Punto de venta", icon: "scan-line", sub: cartCount > 0 ? "· " + cartCount + " items" : "", badge: null as number | null },
          { k: "inv", l: "Inventario", icon: "boxes", sub: "", badge: lowStock.length > 0 ? lowStock.length : null },
          { k: "cat", l: "Catálogo", icon: "layout-grid", sub: ITEMS.length + " productos", badge: null },
          { k: "mov", l: "Movimientos", icon: "receipt-text", sub: "34 ventas hoy", badge: null },
        ] as const).map((t) => {
          const on = tab === t.k;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: "1 1 160px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 14px", borderRadius: 8, background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "#0a0a0a", border: 0, fontFamily: "inherit", cursor: "pointer" }}>
              <Icon name={t.icon} size={15} color={on ? "var(--primary)" : "#0a0a0a"} />
              <span style={{ fontSize: 12.5, fontWeight: 900 }}>{t.l}</span>
              {t.sub && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{t.sub}</span>}
              {t.badge && <span style={{ padding: "2px 7px", borderRadius: 9999, background: "#dc2626", color: "#fff", fontSize: 9, fontWeight: 900 }}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "pos" && <POSTab cat={cat} setCat={setCat} cart={cart} cartItems={cartItems} cartSubtotal={cartSubtotal} cartTax={cartTax} cartTotal={cartTotal} cartCount={cartCount} addToCart={addToCart} removeFromCart={removeFromCart} setCart={setCart} payMethod={payMethod} setPayMethod={setPayMethod} onCharge={charge} onAction={soon} />}
        {tab === "inv" && <InventarioTab lowStock={lowStock} onAction={soon} />}
        {tab === "cat" && <CatalogoTab onAction={soon} />}
        {tab === "mov" && <MovimientosTab onAction={soon} />}
      </div>
    </div>
  );
}

type CartItem = Item & { qty: number };

function POSTab({ cat, setCat, cart, cartItems, cartSubtotal, cartTax, cartTotal, cartCount, addToCart, removeFromCart, setCart, payMethod, setPayMethod, onCharge, onAction }: { cat: string; setCat: (k: string) => void; cart: Record<string, number>; cartItems: CartItem[]; cartSubtotal: number; cartTax: number; cartTotal: number; cartCount: number; addToCart: (id: string) => void; removeFromCart: (id: string) => void; setCart: (c: Record<string, number>) => void; payMethod: string; setPayMethod: (k: string) => void; onCharge: () => void; onAction: (t: string) => void }) {
  const filtered = cat === "all" ? ITEMS : ITEMS.filter((p) => p.cat === cat);
  const countByCat = (k: string) => (k === "all" ? ITEMS.length : ITEMS.filter((p) => p.cat === k).length);
  return (
    <div className="mp-shop-pos" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "flex-start" }}>
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {CATS.map((c) => {
            const on = cat === c.k;
            return (
              <button key={c.k} onClick={() => setCat(c.k)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9999, background: on ? "var(--primary)" : "#fff", color: on ? "#fff" : "#0a0a0a", border: on ? "1px solid var(--primary)" : "1px solid var(--border)", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name={c.icon} size={13} color={on ? "#fff" : undefined} />
                {c.l}
                <span style={{ padding: "1px 6px", borderRadius: 9999, background: on ? "rgba(255,255,255,0.22)" : "var(--muted)", fontSize: 9.5, fontWeight: 900 }}>{countByCat(c.k)}</span>
              </button>
            );
          })}
        </div>

        <div className="mp-shop-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {filtered.map((p) => {
            const inCart = cart[p.id] || 0;
            const low = !p.unlimited && p.stock <= p.threshold;
            const out = !p.unlimited && p.stock === 0;
            return (
              <button key={p.id} className="card" style={{ padding: 0, overflow: "hidden", position: "relative", opacity: out ? 0.5 : 1, cursor: out ? "not-allowed" : "pointer", border: "1px solid var(--border)", textAlign: "left", fontFamily: "inherit", background: "var(--card, #fff)" }} onClick={() => !out && addToCart(p.id)}>
                <div style={{ height: 80, background: p.bg, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={p.icon} size={32} color="rgba(255,255,255,0.65)" />
                  <div style={{ position: "absolute", top: 6, left: 6, padding: "2px 7px", borderRadius: 9999, background: p.unlimited ? "rgba(255,255,255,0.25)" : out ? "#7c1d1d" : low ? "#dc2626" : "rgba(0,0,0,0.5)", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>
                    {p.unlimited ? "∞" : out ? "SIN STOCK" : p.stock + " STOCK"}
                  </div>
                  {inCart > 0 && <div style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, border: "2px solid #fff" }}>{inCart}</div>}
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 900, lineHeight: 1.25, minHeight: 28 }}>{p.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span className="font-heading tabular" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.025em" }}>${p.price}</span>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: out ? "var(--muted)" : "var(--primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="plus" size={13} color="#fff" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card mp-shop-cart" style={{ padding: 0, overflow: "hidden", position: "sticky", top: 80 }}>
        <div style={{ padding: 16, background: "#0a0a0a", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>● Carrito</div>
            <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Venta actual</h3>
          </div>
          {cartCount > 0 && <button onClick={() => setCart({})} style={{ padding: "4px 10px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Vaciar</button>}
        </div>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {cartItems.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
              <Icon name="shopping-cart" size={28} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8, fontSize: 11.5 }}>Toca cualquier producto para añadir.</div>
            </div>
          )}
          {cartItems.map((it) => (
            <div key={it.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 90px 24px", gap: 10, alignItems: "center", padding: "10px 14px", borderTop: "1px dashed var(--border)" }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: it.bg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={it.icon} size={13} color="rgba(255,255,255,0.8)" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>${it.price} c/u</div>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                <button onClick={() => removeFromCart(it.id)} style={{ width: 22, height: 22, borderRadius: 5, background: "var(--muted)", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="minus" size={10} /></button>
                <span className="font-heading tabular" style={{ fontSize: 12, fontWeight: 900, minWidth: 18, textAlign: "center" }}>{it.qty}</span>
                <button onClick={() => addToCart(it.id)} style={{ width: 22, height: 22, borderRadius: 5, background: "var(--primary)", color: "#fff", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={10} color="#fff" /></button>
              </div>
              <span className="font-heading tabular" style={{ fontSize: 12, fontWeight: 900, textAlign: "right" }}>${(it.price * it.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        {cartItems.length > 0 && (
          <>
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", background: "var(--muted)" }}>
              <div className="label-mp" style={{ marginBottom: 6 }}>Cliente / socio</div>
              <button onClick={() => onAction("Asociar socio · próximamente")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#fff", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <Icon name="user-search" size={14} color="var(--muted-fg)" />
                <span style={{ fontSize: 11, color: "var(--muted-fg)", flex: 1 }}>Walk-in · sin socio</span>
                <Icon name="chevron-down" size={12} color="var(--muted-fg)" />
              </button>
            </div>
            <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>
                <span>Subtotal</span><span className="tabular">${cartSubtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted-fg)", marginBottom: 8 }}>
                <span>IVA · 12%</span><span className="tabular">${cartTax.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                <span style={{ fontSize: 12, fontWeight: 900 }}>TOTAL</span>
                <span className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.035em", color: "var(--primary)" }}>${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <div className="label-mp" style={{ marginBottom: 6 }}>Pago</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 10 }}>
                {[
                  { k: "cash", l: "Efectivo", icon: "banknote" },
                  { k: "transfer", l: "Transfer.", icon: "arrow-left-right" },
                  { k: "deuna", l: "DeUna", icon: "smartphone" },
                  { k: "mp", l: "Saldo MP", icon: "wallet" },
                ].map((m) => {
                  const on = payMethod === m.k;
                  return (
                    <button key={m.k} onClick={() => setPayMethod(m.k)} style={{ padding: "8px 4px", borderRadius: 8, background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", border: on ? "1px solid #0a0a0a" : "1px solid var(--border)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "inherit" }}>
                      <Icon name={m.icon} size={14} color={on ? "var(--primary)" : "#0a0a0a"} />
                      <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.05em" }}>{m.l}</span>
                    </button>
                  );
                })}
              </div>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 16px", fontSize: 13 }} onClick={onCharge}>
                <Icon name="check-circle-2" size={15} color="#fff" />
                Cobrar ${cartTotal.toFixed(2)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InventarioTab({ lowStock, onAction }: { lowStock: Item[]; onAction: (t: string) => void }) {
  const stocked = ITEMS.filter((p) => !p.unlimited);
  const totalValue = stocked.reduce((s, p) => s + p.stock * p.cost, 0);
  return (
    <>
      <div className="mp-shop-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
        {[
          { l: "SKUs activos", v: String(ITEMS.length), sub: "6 categorías", color: "#0a0a0a" },
          { l: "Bajo stock", v: String(lowStock.length), sub: "pedir reposición", color: "#dc2626" },
          { l: "Valor inventario", v: "$" + totalValue.toFixed(0), sub: "a precio costo", color: "var(--primary)" },
          { l: "Rotación · 7d", v: String(ITEMS.reduce((s, p) => s + p.sold7d, 0)), sub: "unidades vendidas", color: "#fbbf24" },
        ].map((k) => (
          <div key={k.l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{k.l}</div>
            <div className="font-heading tabular" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.035em", marginTop: 8, color: k.color }}>{k.v}</div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div className="card" style={{ padding: 18, marginBottom: 14, background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.25)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="label-mp" style={{ color: "#dc2626" }}>⚠ Bajo stock · acción requerida</div>
              <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>{lowStock.length} productos por reponer<span className="dot">.</span></h3>
            </div>
            <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => onAction("Generar orden de compra · próximamente")}><Icon name="package-plus" size={12} color="#fff" />Generar orden de compra</button>
          </div>
          <div className="mp-shop-low" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {lowStock.map((p) => (
              <div key={p.id} style={{ padding: 12, background: "#fff", borderRadius: 10, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: p.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={p.icon} size={16} color="rgba(255,255,255,0.85)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: 9.5, color: "#dc2626", fontWeight: 900, letterSpacing: "0.08em" }}>● {p.stock} de {p.threshold} mín.</div>
                </div>
                <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 9.5, padding: "5px 10px" }} onClick={() => onAction("Reponer " + p.name + " · próximamente")}>+ Reponer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Stock · todos los productos</div>
            <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Inventario completo<span className="dot">.</span></h3>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Filtrar · próximamente")}><Icon name="filter" size={11} />Filtrar</button>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Exportar CSV · próximamente")}><Icon name="download" size={11} />Exportar CSV</button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 720 }}>
            <div style={{ display: "grid", gridTemplateColumns: "38px 1.6fr 90px 0.8fr 90px 90px 130px", gap: 12, alignItems: "center", padding: "10px 22px", background: "var(--muted)" }}>
              <div />
              <div className="label-mp">Producto</div>
              <div className="label-mp">Categoría</div>
              <div className="label-mp">Stock</div>
              <div className="label-mp" style={{ textAlign: "right" }}>Costo</div>
              <div className="label-mp" style={{ textAlign: "right" }}>Precio</div>
              <div className="label-mp" style={{ textAlign: "right" }}>Acción</div>
            </div>
            {ITEMS.map((p, i) => {
              const lvl = p.unlimited ? 100 : Math.min(100, (p.stock / (p.threshold * 3 || 1)) * 100);
              const barColor = p.unlimited ? "#a1a1aa" : p.stock <= p.threshold ? "#dc2626" : p.stock <= p.threshold * 2 ? "#fbbf24" : "#10b981";
              const margin = (((p.price - p.cost) / p.price) * 100).toFixed(0);
              return (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "38px 1.6fr 90px 0.8fr 90px 90px 130px", gap: 12, alignItems: "center", padding: "12px 22px", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: p.bg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={p.icon} size={13} color="rgba(255,255,255,0.85)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{p.name}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>{p.sold7d} vendidos · 7d · margen {margin}%</div>
                  </div>
                  <div>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 9999, background: "var(--muted)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>{CATS.find((c) => c.k === p.cat)?.l}</span>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span className="font-heading tabular" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", color: p.stock <= p.threshold && !p.unlimited ? "#dc2626" : "#0a0a0a" }}>{p.unlimited ? "∞" : p.stock}</span>
                      {!p.unlimited && <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>/ mín {p.threshold}</span>}
                    </div>
                    <div style={{ height: 3, background: "var(--muted)", borderRadius: 9999, marginTop: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: lvl + "%", background: barColor }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--muted-fg)" }} className="tabular">${p.cost.toFixed(2)}</div>
                  <div style={{ textAlign: "right" }}>
                    <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900 }}>${p.price.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 9.5, padding: "5px 10px" }} onClick={() => onAction("Sumar stock · " + p.name)}><Icon name="plus" size={10} />Stock</button>
                    <button onClick={() => onAction("Editar " + p.name + " · próximamente")} style={{ width: 26, height: 26, borderRadius: 6, background: "var(--muted)", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="pencil" size={11} /></button>
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

function CatalogoTab({ onAction }: { onAction: (t: string) => void }) {
  return (
    <div className="mp-shop-cat" style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "flex-start" }}>
      <div className="card" style={{ padding: 20, position: "sticky", top: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="package-plus" size={17} color="#fff" />
          </div>
          <div>
            <div className="label-mp">Nuevo producto</div>
            <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", margin: 0 }}>Subir al catálogo<span className="dot">.</span></h3>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="label-mp" style={{ marginBottom: 5 }}>Imagen</div>
          <button onClick={() => onAction("Subir imagen · próximamente")} style={{ width: "100%", height: 110, borderRadius: 10, background: "var(--muted)", border: "1.5px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name="image-up" size={22} color="var(--muted-fg)" />
            <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>Arrastra o haz clic para subir</span>
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Nombre</label>
          <input placeholder="Ej. Wilson Pro Staff x3" style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Categoría</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
            {CATS.filter((c) => c.k !== "all").map((c) => (
              <button key={c.k} onClick={() => onAction("Categoría " + c.l)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "9px 6px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name={c.icon} size={14} color="var(--muted-fg)" />
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.05em" }}>{c.l}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {(["Precio", "Costo"] as const).map((l) => (
            <div key={l}>
              <label style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>{l}</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--muted-fg)", fontWeight: 800 }}>$</span>
                <input placeholder="0.00" style={{ width: "100%", padding: "9px 12px 9px 22px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit" }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {(["Stock inicial", "Mínimo"] as const).map((l) => (
            <div key={l}>
              <label style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>{l}</label>
              <input placeholder="0" style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit" }} />
            </div>
          ))}
        </div>
        <button className="btn btn-primary" style={{ width: "100%", fontSize: 12 }} onClick={() => onAction("Publicar al catálogo · próximamente")}>
          <Icon name="check" size={13} color="#fff" />Publicar al catálogo
        </button>
        <div style={{ marginTop: 10, fontSize: 10, color: "var(--muted-fg)", textAlign: "center", lineHeight: 1.45 }}>El producto aparece de inmediato en el POS y en la app del jugador.</div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 10 }}>
          <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>Catálogo actual<span className="dot">.</span></h3>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{ITEMS.length} productos · 6 categorías</span>
        </div>
        <div className="mp-shop-catgrid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {ITEMS.map((p) => (
            <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ height: 70, background: p.bg, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={p.icon} size={26} color="rgba(255,255,255,0.75)" />
                <button onClick={() => onAction("Editar " + p.name + " · próximamente")} style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 6, background: "rgba(0,0,0,0.5)", color: "#fff", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="pencil" size={11} color="#fff" /></button>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{CATS.find((c) => c.k === p.cat)?.l}</div>
                <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 2, lineHeight: 1.25 }}>{p.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: 10 }}>
                  <span className="font-heading tabular" style={{ fontSize: 13, fontWeight: 900 }}>${p.price}</span>
                  <span style={{ color: "var(--muted-fg)" }}>{p.unlimited ? "∞" : p.stock} stock</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MovimientosTab({ onAction }: { onAction: (t: string) => void }) {
  const txns = [
    { t: "14:36", who: "Walk-in", items: "1× Gatorade", amt: 2.0, meth: "Efectivo" },
    { t: "14:28", who: "Carolina Vega · 🏓", items: "3× Pelotas Head + 1× Grip", amt: 18.0, meth: "Saldo MP" },
    { t: "14:11", who: "Walk-in", items: "2× Café americano", amt: 2.5, meth: "Efectivo" },
    { t: "13:58", who: "Mateo Silva", items: "1× Polera M + 1× Powerade", amt: 27.5, meth: "Transferencia" },
    { t: "13:42", who: "Walk-in", items: "4× Empanada de carne", amt: 6.0, meth: "Efectivo" },
    { t: "13:20", who: "Andrea Donoso · ⭐", items: "1× Bullpadel Vertex", amt: 189.0, meth: "DeUna" },
    { t: "12:55", who: "Walk-in", items: "2× Agua + 1× Barra energética", amt: 4.0, meth: "Efectivo" },
    { t: "12:38", who: "Pedro Salas (staff)", items: "1× Café + 1× Sándwich", amt: 5.25, meth: "Descuento staff" },
  ];
  const todayTotal = txns.reduce((s, t) => s + t.amt, 0);
  const cashTotal = txns.filter((t) => t.meth === "Efectivo").reduce((s, t) => s + t.amt, 0);
  const digitalTotal = txns.filter((t) => t.meth === "Transferencia" || t.meth === "DeUna").reduce((s, t) => s + t.amt, 0);
  const best = [...ITEMS].sort((a, b) => b.sold7d - a.sold7d).slice(0, 6);
  const maxSold = best[0].sold7d;
  const methodColor: Record<string, string> = { Efectivo: "#10b981", Transferencia: "#0ea5e9", DeUna: "#7c3aed", "Saldo MP": "#7c3aed", "Descuento staff": "#fbbf24" };

  return (
    <>
      <div className="mp-shop-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
        {[
          { l: "Ventas hoy", v: "$" + todayTotal.toFixed(2), sub: txns.length + " transacciones", color: "var(--primary)", icon: "trending-up" },
          { l: "Caja efectivo", v: "$" + cashTotal.toFixed(2), sub: "a entregar al cierre", color: "#0a0a0a", icon: "banknote" },
          { l: "Digital", v: "$" + digitalTotal.toFixed(2), sub: "transferencia + DeUna", color: "#0ea5e9", icon: "smartphone" },
          { l: "Ticket promedio", v: "$" + (todayTotal / txns.length).toFixed(2), sub: "vs ayer prom $6.20", color: "#fbbf24", icon: "receipt" },
        ].map((k) => (
          <div key={k.l} className="card" style={{ padding: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, background: "var(--muted)", color: k.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={k.icon} size={15} color={k.color} />
            </div>
            <div className="label-mp" style={{ paddingRight: 40 }}>{k.l}</div>
            <div className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.035em", marginTop: 8, color: k.color }}>{k.v}</div>
            <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mp-shop-mov" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div className="label-mp">Hoy · jue 22 may</div>
              <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Movimientos del día<span className="dot">.</span></h3>
            </div>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Imprimir cierre Z · próximamente")}><Icon name="printer" size={11} />Imprimir Z</button>
          </div>
          {txns.map((t, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr 100px 80px", gap: 10, alignItems: "center", padding: "11px 22px", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
              <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }} className="tabular">{t.t}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800 }}>{t.who}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.items}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 9999, background: (methodColor[t.meth] ?? "#a1a1aa") + "22", color: methodColor[t.meth] ?? "#a1a1aa", letterSpacing: "0.08em", textAlign: "center", justifySelf: "flex-start" }}>{t.meth.toUpperCase()}</span>
              <span className="font-heading tabular" style={{ fontSize: 13, fontWeight: 900, textAlign: "right", color: "var(--primary)" }}>+${t.amt.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="card" style={{ padding: 18, marginBottom: 12 }}>
            <div className="label-mp">Top vendidos · 7 días</div>
            <h3 className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Best sellers<span className="dot">.</span></h3>
            {best.map((p, i) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "24px 30px 1fr 50px", gap: 8, alignItems: "center", padding: "6px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                <span className="font-heading" style={{ fontSize: 11, fontWeight: 900, color: i === 0 ? "var(--primary)" : "var(--muted-fg)", textAlign: "center" }}>{i === 0 ? "★" : "#" + (i + 1)}</span>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: p.bg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={p.icon} size={12} color="rgba(255,255,255,0.85)" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ height: 3, background: "var(--muted)", borderRadius: 9999, marginTop: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: (p.sold7d / maxSold) * 100 + "%", background: "var(--primary)" }} />
                  </div>
                </div>
                <span className="font-heading" style={{ fontSize: 12, fontWeight: 900, textAlign: "right" }}>{p.sold7d}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 18, background: "#0a0a0a", color: "#fff" }}>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>● Caja registradora</div>
            <h3 className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Estado actual<span className="dot">.</span></h3>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 11 }}>
              <span style={{ color: "rgba(255,255,255,0.65)" }}>Apertura · 07:00</span>
              <span className="font-heading tabular">$50.00</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 11, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
              <span style={{ color: "rgba(255,255,255,0.65)" }}>+ Efectivo del día</span>
              <span className="font-heading tabular" style={{ color: "var(--primary)" }}>+${cashTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 11, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
              <span style={{ color: "rgba(255,255,255,0.65)" }}>− Vueltos / retiros</span>
              <span className="font-heading tabular" style={{ color: "#dc2626" }}>−$0.00</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 900 }}>TOTAL EN CAJA</span>
              <span className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.025em", color: "var(--primary)" }}>${(50 + cashTotal).toFixed(2)}</span>
            </div>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 12, fontSize: 11 }} onClick={() => onAction("Cerrar caja · próximamente")}><Icon name="lock" size={13} color="#fff" />Cerrar caja</button>
          </div>
        </div>
      </div>
    </>
  );
}
