// VerMapaOverlay — migrado 1:1 desde ui_kits/dashboard/ClubesActionsModals.jsx (líneas 219-364)
// Overlay fullscreen con sidebar de clubes + mapa SVG. Escucha 'mp-open-mapa'.
"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Pin = {
  x: string;
  y: string;
  label: string;
  name: string;
  city: string;
  dist: string;
  rating: number;
  courts: number;
};

const PINS: Pin[] = [
  { x: "28%", y: "38%", label: "$14", name: "Club Norte Pickleball", city: "Cumbayá", dist: "1.2 km", rating: 4.9, courts: 8 },
  { x: "54%", y: "24%", label: "$12", name: "Padel Club LC", city: "La Carolina", dist: "4 km", rating: 4.7, courts: 6 },
  { x: "46%", y: "58%", label: "$11", name: "Pickle Garden", city: "Cumbayá", dist: "3.4 km", rating: 4.8, courts: 5 },
  { x: "68%", y: "46%", label: "$13", name: "Smash Sport", city: "Cumbayá", dist: "5.1 km", rating: 4.5, courts: 10 },
  { x: "34%", y: "70%", label: "$15", name: "Court 21", city: "Lo Barnechea", dist: "6 km", rating: 4.9, courts: 3 },
  { x: "74%", y: "70%", label: "$10", name: "MATCHPOINT Ñ", city: "Ñuñoa", dist: "7.2 km", rating: 4.6, courts: 4 },
  { x: "60%", y: "78%", label: "$9", name: "Top Spin", city: "San Miguel", dist: "8.4 km", rating: 4.4, courts: 7 },
];

const BUILDINGS: [number, number, number, number][] = [
  [120, 80, 80, 60],
  [330, 60, 90, 80],
  [560, 90, 90, 70],
  [80, 260, 90, 80],
  [330, 360, 100, 80],
  [580, 330, 80, 70],
  [60, 460, 90, 60],
];

const caGhost = { background: "#fff", border: "1px solid var(--border)" };

export function VerMapaOverlay() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setSelected(0);
    };
    window.addEventListener("mp-open-mapa", handler);
    return () => window.removeEventListener("mp-open-mapa", handler);
  }, []);

  if (!open) return null;
  const sel = PINS[selected];
  const close = () => setOpen(false);
  const reservarSel = () => {
    close();
    setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent("mp-open-reservar", {
            detail: {
              name: sel.name,
              city: sel.city,
              price: parseInt(sel.label.replace("$", ""), 10),
            },
          })
        ),
      50
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid var(--border)",
          background: "#fff",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "var(--primary)", fontSize: 18, fontWeight: 900 }}>●</span>
          <span
            className="font-heading"
            style={{
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            MATCHPOINT
          </span>
          <span style={{ width: 1, height: 18, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            Clubes · <b style={{ color: "#0a0a0a" }}>Vista mapa</b>
          </span>
        </div>
        <button onClick={close} className="btn" style={caGhost}>
          <Icon name="x" size={12} />
          Cerrar mapa
        </button>
      </div>

      <div className="mp-map-overlay-layout" style={{ display: "grid", gridTemplateColumns: "340px 1fr", flex: 1, minHeight: 0 }}>
        {/* Left rail */}
        <div
          style={{
            background: "#fff",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "18px 18px 12px" }}>
            <div className="label-mp">Mapa de clubes</div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginTop: 4,
              }}
            >
              <div
                className="font-heading"
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                  lineHeight: 1.05,
                }}
              >
                {PINS.length} cerca de ti<span style={{ color: "var(--primary)" }}>.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
              {["Todos", "Pickle", "Pádel", "Outdoor"].map((f, i) => (
                <button
                  key={f}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 9999,
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: "inherit",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    background: i === 0 ? "#0a0a0a" : "#fff",
                    color: i === 0 ? "#fff" : "#0a0a0a",
                    border: "1px solid " + (i === 0 ? "#0a0a0a" : "var(--border)"),
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div
            style={{
              padding: "4px 18px",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--muted-fg)",
            }}
          >
            <span>
              Ordenar: <b style={{ color: "#0a0a0a" }}>Distancia</b>
            </span>
            <span>
              Radio: <b style={{ color: "#0a0a0a" }}>10 km</b>
            </span>
          </div>
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {PINS.map((p, i) => (
              <button
                key={p.name}
                onClick={() => setSelected(i)}
                style={{
                  padding: 11,
                  borderRadius: 10,
                  border: i === selected ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: i === selected ? "#ecfdf5" : "#fff",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: i === selected ? "var(--primary)" : "#0a0a0a",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  {p.label}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 900 }}>{p.name}</div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>
                    {p.courts} canchas · ★ {p.rating} · {p.dist}
                  </div>
                </div>
                <Icon name="chevron-right" size={13} color="var(--muted-fg)" />
              </button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div
          style={{
            position: "relative",
            background: "linear-gradient(180deg, #f0f4ff 0%, #e0e7ff 50%, #c7d2fe 100%)",
            overflow: "hidden",
          }}
        >
          <svg
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
            preserveAspectRatio="none"
            viewBox="0 0 720 540"
          >
            <defs>
              <pattern id="vm-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                <path
                  d="M 22 0 L 0 0 0 22"
                  fill="none"
                  stroke="rgba(99,102,241,0.18)"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="720" height="540" fill="url(#vm-grid)" />
            <path
              d="M -20 320 Q 200 240 380 280 T 760 240"
              stroke="rgba(99,102,241,0.45)"
              strokeWidth="22"
              fill="none"
              opacity="0.4"
            />
            <path d="M 0 200 L 720 240" stroke="rgba(255,255,255,0.9)" strokeWidth="14" />
            <path d="M 220 0 L 260 540" stroke="rgba(255,255,255,0.9)" strokeWidth="14" />
            <path d="M 480 0 L 520 540" stroke="rgba(255,255,255,0.9)" strokeWidth="10" />
            <path d="M 0 420 L 720 460" stroke="rgba(255,255,255,0.85)" strokeWidth="10" />
            {BUILDINGS.map(([x, y, w, h], i) => (
              <rect
                key={i}
                x={x}
                y={y}
                width={w}
                height={h}
                rx="4"
                fill="rgba(255,255,255,0.55)"
                stroke="rgba(99,102,241,0.15)"
              />
            ))}
            <circle cx="420" cy="160" r="48" fill="rgba(16,185,129,0.25)" />
            <circle cx="620" cy="380" r="62" fill="rgba(16,185,129,0.25)" />
          </svg>

          {/* "You are here" dot */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#3b82f6",
                border: "3px solid #fff",
                boxShadow:
                  "0 0 0 6px rgba(59,130,246,0.25), 0 4px 12px rgba(0,0,0,0.18)",
              }}
            />
          </div>

          {PINS.map((p, i) => (
            <button
              key={p.name}
              onClick={() => setSelected(i)}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -100%)",
                zIndex: i === selected ? 4 : 1,
                background: "transparent",
                border: 0,
                padding: 0,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  padding: "5px 11px",
                  borderRadius: 9999,
                  background: i === selected ? "var(--primary)" : "#0a0a0a",
                  color: "#fff",
                  fontSize: 11.5,
                  fontWeight: 900,
                  fontFamily: "Plus Jakarta Sans",
                  letterSpacing: "-0.01em",
                  boxShadow:
                    i === selected
                      ? "0 0 0 4px rgba(16,185,129,0.25), 0 4px 12px rgba(0,0,0,0.22)"
                      : "0 4px 12px rgba(0,0,0,0.22)",
                  whiteSpace: "nowrap",
                }}
              >
                {p.label}
                {i === selected && (
                  <span style={{ marginLeft: 4 }}>·{p.name.split(" ")[0]}</span>
                )}
              </div>
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "6px solid transparent",
                  borderRight: "6px solid transparent",
                  borderTop:
                    "8px solid " + (i === selected ? "var(--primary)" : "#0a0a0a"),
                  margin: "-1px auto 0",
                }}
              />
            </button>
          ))}

          {/* Zoom controls */}
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {[{ i: "plus" }, { i: "minus" }, { i: "crosshair" }].map((b) => (
              <button
                key={b.i}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                }}
              >
                <Icon name={b.i} size={14} />
              </button>
            ))}
          </div>

          <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 6 }}>
            <button
              style={{
                padding: "7px 13px",
                borderRadius: 9999,
                background: "#fff",
                border: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: 800,
                fontFamily: "inherit",
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              <Icon name="calendar" size={12} />
              Mar 12 · 19:00
            </button>
            <button
              style={{
                padding: "7px 13px",
                borderRadius: 9999,
                background: "var(--primary)",
                color: "#fff",
                border: 0,
                fontSize: 11,
                fontWeight: 900,
                fontFamily: "inherit",
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              <Icon name="zap" size={12} color="#fff" />
              Disponible ahora
            </button>
          </div>

          {/* Selected club card */}
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: 18,
              width: 340,
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 7px",
                    background: "#ecfdf5",
                    color: "var(--primary)",
                    borderRadius: 9999,
                    fontSize: 8.5,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  ● Abierto
                </span>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    marginTop: 8,
                    lineHeight: 1.15,
                  }}
                >
                  {sel.name}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>
                  {sel.city} · {sel.dist} · {sel.rating} ★
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, fontSize: 9.5 }}>
              <span
                style={{
                  padding: "3px 7px",
                  background: "var(--muted)",
                  borderRadius: 9999,
                  fontWeight: 800,
                }}
              >
                {sel.courts} canchas
              </span>
              <span
                style={{
                  padding: "3px 7px",
                  background: "var(--muted)",
                  borderRadius: 9999,
                  fontWeight: 800,
                }}
              >
                Outdoor
              </span>
              <span
                style={{
                  padding: "3px 7px",
                  background: "var(--muted)",
                  borderRadius: 9999,
                  fontWeight: 800,
                }}
              >
                Iluminada
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, fontSize: 10.5, padding: "7px 10px" }}
                onClick={reservarSel}
              >
                Reservar {sel.label}/h
                <Icon name="arrow-right" size={11} color="#fff" />
              </button>
              <button className="btn" style={{ ...caGhost, padding: "7px 9px" }}>
                <Icon name="navigation" size={12} />
              </button>
              <button className="btn" style={{ ...caGhost, padding: "7px 9px" }}>
                <Icon name="bookmark" size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
