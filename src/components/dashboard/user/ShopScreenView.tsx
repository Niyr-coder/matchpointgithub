// Client view de ShopScreen — UI del mock original con productos reales.
"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

export type ShopCategory = {
  id: string;
  name: string;
  slug: string;
};

export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  wasCents: number | null;
  stock: number;
  coverUrl: string | null;
  categoryName: string;
  categorySlug: string | null;
  tag: string | null;
  rating: number | null;
  reviews: number;
};

type MpCart = { count: () => number };

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg,#0a0a0a,#27272a)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#facc15,#ca8a04)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0c4a6e,#0369a1)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#1f2937,#6b7280)",
  "linear-gradient(135deg,#831843,#db2777)",
];

const SLUG_ICON: Record<string, string> = {
  paletas: "circle",
  pelotas: "circle-dot",
  ropa: "shirt",
  calzado: "footprints",
  accesorios: "briefcase",
};

function gradientFor(p: ShopProduct, i: number): string {
  return FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length];
}

function iconFor(p: ShopProduct): string {
  if (p.categorySlug && SLUG_ICON[p.categorySlug]) return SLUG_ICON[p.categorySlug];
  return "shopping-bag";
}

function priceLabel(cents: number): string {
  const n = cents / 100;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${n.toFixed(0)}`;
}

export function ShopScreenView({
  products,
  categories,
}: {
  products: ShopProduct[];
  categories: ShopCategory[];
}) {
  const [cat, setCat] = useState("all");
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const w = window as unknown as { mpCart?: MpCart };
    const sync = () => setCartCount(w.mpCart ? w.mpCart.count() : 0);
    sync();
    window.addEventListener("mp-cart-changed", sync);
    return () => window.removeEventListener("mp-cart-changed", sync);
  }, []);

  const openCarrito = (view?: string) =>
    window.dispatchEvent(
      new CustomEvent("mp-open-carrito", { detail: { view: view || "mini" } }),
    );

  const addToCart = (p: ShopProduct) =>
    window.dispatchEvent(
      new CustomEvent("mp-add-to-cart", {
        detail: {
          sku: p.id,
          name: p.name,
          cat: p.categoryName,
          color: gradientFor(p, 0),
          icon: iconFor(p),
          price: p.priceCents / 100,
          was: p.wasCents ? p.wasCents / 100 : undefined,
        },
      }),
    );

  const filtered = useMemo(() => {
    if (cat === "all") return products;
    return products.filter((p) => p.categorySlug === cat);
  }, [products, cat]);

  const tabs: { k: string; l: string; icon: string }[] = [
    { k: "all", l: "Todo", icon: "shopping-bag" },
    ...categories.map((c) => ({ k: c.slug, l: c.name, icon: SLUG_ICON[c.slug] ?? "tag" })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="label-mp">Shop · Equipamiento oficial</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 className="font-heading display-md" style={{ margin: 0 }}>
          Shop <span className="dot">●</span> MATCHPOINT
        </h1>
        <button
          onClick={() => openCarrito("mini")}
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            position: "relative",
          }}
        >
          <Icon name="shopping-cart" size={14} />
          Carro
          {cartCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "var(--primary)",
                color: "#fff",
                fontSize: 9.5,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Sale banner — sigue estático (sin schema de campañas todavía) */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(120deg, #f97316 0%, #dc2626 50%, #7c2d12 100%)",
          color: "#fff",
          minHeight: 220,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 30,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 200,
            color: "rgba(255,255,255,0.08)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            textTransform: "uppercase",
            transform: "rotate(-6deg)",
            pointerEvents: "none",
          }}
        >
          SALE
        </div>
        <div
          style={{
            position: "absolute",
            top: 30,
            right: 30,
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.25), transparent 70%)",
          }}
        />
        <div style={{ padding: 36, position: "relative", maxWidth: 540 }}>
          <div
            style={{
              display: "inline-block",
              padding: "4px 11px",
              background: "#fbbf24",
              color: "#0a0a0a",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              marginBottom: 14,
            }}
          >
            ★ Promo temporada
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 44,
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Equípate
            <br />
            mejor<span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <p
            style={{
              marginTop: 14,
              fontSize: 13.5,
              color: "rgba(255,255,255,0.85)",
              maxWidth: 420,
            }}
          >
            Paletas, pelotas y accesorios oficiales. Envío sobre $50 desde cualquier club de la red.
          </p>
          <button className="btn" style={{ background: "#0a0a0a", color: "#fff", marginTop: 14 }}>
            Ver liquidación
            <Icon name="arrow-right" size={13} color="#fff" />
          </button>
        </div>
      </div>

      {/* Cat filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tabs.map((c) => (
          <button
            key={c.k}
            onClick={() => setCat(c.k)}
            style={{
              padding: "9px 16px",
              borderRadius: 9999,
              fontSize: 11.5,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
              background: cat === c.k ? "#0a0a0a" : "#fff",
              color: cat === c.k ? "#fff" : "#0a0a0a",
              border: "1px solid " + (cat === c.k ? "#0a0a0a" : "var(--border)"),
            }}
          >
            <Icon name={c.icon} size={12} />
            {c.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--muted-fg)",
          }}
        >
          <Icon name="shopping-bag" size={32} color="var(--muted-fg)" />
          <div
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              marginTop: 12,
              color: "#0a0a0a",
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
            }}
          >
            Sin productos en {cat === "all" ? "el catálogo" : "esta categoría"}
            <span className="dot">.</span>
          </div>
          <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>
            Estamos sumando equipamiento oficial de la red. Pronto verás más opciones aquí.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((p, i) => {
            const outOfStock = p.stock === 0;
            return (
              <div
                key={p.id}
                className="card"
                style={{
                  padding: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  opacity: outOfStock ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    height: 180,
                    background: p.coverUrl
                      ? `center / cover no-repeat url('${p.coverUrl}')`
                      : gradientFor(p, i),
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {!p.coverUrl && (
                    <>
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background:
                            "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2), transparent 60%)",
                        }}
                      />
                      <Icon name={iconFor(p)} size={64} color="rgba(255,255,255,0.55)" />
                    </>
                  )}
                  {(p.tag || outOfStock) && (
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        left: 10,
                        padding: "3px 9px",
                        background: outOfStock
                          ? "#0a0a0a"
                          : p.tag?.startsWith("-")
                            ? "#dc2626"
                            : p.tag === "Nuevo"
                              ? "var(--primary)"
                              : "#fbbf24",
                        color:
                          outOfStock || p.tag === "Nuevo" || p.tag?.startsWith("-")
                            ? "#fff"
                            : "#0a0a0a",
                        borderRadius: 9999,
                        fontSize: 9,
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                      }}
                    >
                      {outOfStock ? "Agotado" : p.tag}
                    </div>
                  )}
                  <button
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.95)",
                      border: 0,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="heart" size={13} />
                  </button>
                </div>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "var(--muted-fg)",
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                      fontWeight: 800,
                    }}
                  >
                    {p.categoryName}
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.2,
                    }}
                  >
                    {p.name}
                  </div>
                  {p.rating != null && (
                    <div
                      style={{
                        display: "inline-flex",
                        gap: 5,
                        alignItems: "center",
                        fontSize: 10.5,
                        color: "var(--muted-fg)",
                      }}
                    >
                      <Icon name="star" size={11} color="#d97706" />
                      <span style={{ fontWeight: 800, color: "#0a0a0a" }}>{p.rating.toFixed(1)}</span>
                      <span>({p.reviews})</span>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginTop: 4,
                      paddingTop: 8,
                      borderTop: "1px dashed var(--border)",
                    }}
                  >
                    <span
                      className="font-heading"
                      style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}
                    >
                      {priceLabel(p.priceCents)}
                    </span>
                    {p.wasCents && p.wasCents > p.priceCents && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--muted-fg)",
                          textDecoration: "line-through",
                        }}
                      >
                        {priceLabel(p.wasCents)}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={outOfStock}
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      opacity: outOfStock ? 0.5 : 1,
                      cursor: outOfStock ? "not-allowed" : "pointer",
                    }}
                    onClick={() => !outOfStock && addToCart(p)}
                  >
                    <Icon name={outOfStock ? "x" : "plus"} size={12} />
                    {outOfStock ? "Sin stock" : "Añadir"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
