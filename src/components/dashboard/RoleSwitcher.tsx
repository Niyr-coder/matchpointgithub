"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MP_ROLES, MP_ROLE_ORDER, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";

// Dev-only role switcher. Two states:
//   enabled  (default for admins) → full pill, click to expand list
//   disabled                       → minimal "DEV" pill that just toggles back on
// Arrastrable: se puede mover por la pantalla (drag) y la posición persiste.
// Por defecto se ancla abajo-derecha (desktop) / arriba-centro (mobile) hasta que
// el usuario lo mueve, momento en que pasa a posición libre (fixed left/top).
const ENABLED_KEY = "mp_dev_role_switcher";
const POS_KEY = "mp_dev_role_switcher_pos";

type Pos = { x: number; y: number };

function clampPos(x: number, y: number, w = 220, h = 56): Pos {
  if (typeof window === "undefined") return { x, y };
  const maxX = Math.max(0, window.innerWidth - w);
  const maxY = Math.max(0, window.innerHeight - h);
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
}

export function RoleSwitcher({ current }: { current: RoleKey }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [pos, setPos] = useState<Pos | null>(null);
  const router = useRouter();
  const cur = MP_ROLES[current];

  const wrapRef = useRef<HTMLDivElement>(null);
  // Estado de drag entre pointerdown/move/up sin re-render por frame.
  const drag = useRef<{ offX: number; offY: number; moved: boolean; active: boolean }>({ offX: 0, offY: 0, moved: false, active: false });

  // Hydrate desde localStorage (enabled default ON, pos opcional).
  useEffect(() => {
    try {
      // Hidratación desde localStorage tras montar (patrón recomendado para
      // evitar mismatch de SSR).
      /* eslint-disable react-hooks/set-state-in-effect */
      if (localStorage.getItem(ENABLED_KEY) === "false") setEnabled(false);
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Pos;
        if (typeof p?.x === "number" && typeof p?.y === "number") setPos(clampPos(p.x, p.y));
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* ignore */
    }
  }, []);

  // Re-clamp si la ventana cambia de tamaño (evita que quede fuera de vista).
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos((p) => (p ? clampPos(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  const toggleEnabled = (next: boolean) => {
    setEnabled(next);
    if (!next) setOpen(false);
    try {
      localStorage.setItem(ENABLED_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const change = (rk: RoleKey) => {
    setOpen(false);
    router.push(`/dashboard/${rk}`);
  };

  // ── Drag handlers (pointer = mouse + touch) ──────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top, moved: false, active: true };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const nx = e.clientX - d.offX;
    const ny = e.clientY - d.offY;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!d.moved) {
      // Umbral para distinguir click de arrastre.
      const dist = Math.hypot(e.clientX - (rect ? rect.left + d.offX : nx), e.clientY - (rect ? rect.top + d.offY : ny));
      if (dist < 4) return;
      d.moved = true;
      setOpen(false);
    }
    setPos(clampPos(nx, ny, rect?.width, rect?.height));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d.active && d.moved) {
      try {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (rect) localStorage.setItem(POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
      } catch {
        /* ignore */
      }
    }
    d.active = false;
    // moved se mantiene hasta el click handler para suprimirlo.
  };
  // Suprime el click que dispara el navegador tras un arrastre.
  const guardedClick = (fn: () => void) => () => {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    fn();
  };

  // Wrapper: si hay pos libre → fixed left/top; si no → clases de ancla.
  const floating = pos !== null;
  const wrapClassName = floating
    ? "fixed z-[950]"
    : "fixed top-2 left-1/2 -translate-x-1/2 md:top-auto md:left-auto md:bottom-4 md:right-4 md:translate-x-0 z-[950]";
  const wrapStyle: React.CSSProperties = floating
    ? { fontFamily: "inherit", left: pos!.x, top: pos!.y, touchAction: "none" }
    : { fontFamily: "inherit", touchAction: "none" };

  // ¿El panel va arriba o abajo del pill? Según mitad de pantalla.
  const placeAbove = floating && typeof window !== "undefined" ? pos!.y > window.innerHeight / 2 : !floating; // anclado abajo-derecha por defecto → arriba
  const alignRight = floating && typeof window !== "undefined" ? pos!.x > window.innerWidth / 2 : true;

  // Disabled state: tiny pill (también arrastrable).
  if (!enabled) {
    return (
      <div ref={wrapRef} className={wrapClassName} style={wrapStyle}>
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={guardedClick(() => toggleEnabled(true))}
          title="Activar dev role switcher · arrastra para mover"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 11px",
            background: "rgba(10,10,10,0.85)",
            color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 9999,
            fontFamily: "inherit",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "grab",
            backdropFilter: "blur(6px)",
            touchAction: "none",
          }}
        >
          <Icon name="grip-vertical" size={11} color="rgba(255,255,255,0.5)" />
          Dev
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={wrapClassName} style={wrapStyle}>
      {open && (
        <div
          style={{
            position: "absolute",
            ...(placeAbove ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
            ...(alignRight ? { right: 0 } : { left: 0 }),
            width: 280,
            maxWidth: "calc(100vw - 24px)",
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>● Demo · Cambiar rol</div>
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", marginTop: 2 }}>
              Vista por rol<span style={{ color: "var(--primary)" }}>.</span>
            </div>
          </div>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {MP_ROLE_ORDER.map((rk) => {
              const r = MP_ROLES[rk];
              const on = current === rk;
              return (
                <button
                  key={rk}
                  onClick={() => change(rk)}
                  style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", background: on ? "rgba(16,185,129,0.12)" : "transparent", border: 0, borderLeft: on ? "3px solid var(--primary)" : "3px solid transparent", color: "#fff", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: r.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={r.icon} size={13} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>{r.badge}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.ctx}</div>
                  </div>
                  {on && <Icon name="check" size={13} color="var(--primary)" />}
                </button>
              );
            })}
          </div>
          <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, flex: 1 }}>Switcher de demo · solo admin · arrástralo para moverlo.</div>
            <button
              onClick={() => toggleEnabled(false)}
              title="Ocultar dev tools"
              style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9999, padding: "5px 9px", cursor: "pointer", fontFamily: "inherit" }}
            >
              Ocultar
            </button>
          </div>
        </div>
      )}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={guardedClick(() => setOpen((o) => !o))}
        title="Cambiar rol · arrastra para mover"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px 10px 10px",
          background: "#0a0a0a",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 9999,
          fontFamily: "inherit",
          cursor: "grab",
          boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
          touchAction: "none",
        }}
      >
        <Icon name="grip-vertical" size={13} color="rgba(255,255,255,0.4)" />
        <span style={{ width: 22, height: 22, borderRadius: 6, background: cur.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={cur.icon} size={12} color="#fff" />
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
          <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Demo · Rol</span>
          <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: "-0.01em" }}>{cur.badge}</span>
        </span>
        <Icon name={open ? "chevron-down" : "chevron-up"} size={13} color="rgba(255,255,255,0.5)" />
      </button>
    </div>
  );
}
