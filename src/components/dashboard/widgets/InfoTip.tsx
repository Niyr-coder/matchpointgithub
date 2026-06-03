"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

const VIEWPORT_PAD = 10;

function placeTooltip(anchor: DOMRect, tipHeight: number, maxWidth: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.max(VIEWPORT_PAD, Math.min(anchor.left, vw - maxWidth - VIEWPORT_PAD));
  const gap = 6;
  let y = anchor.bottom + gap;
  if (y + tipHeight > vh - VIEWPORT_PAD) {
    y = Math.max(VIEWPORT_PAD, anchor.top - tipHeight - gap);
  }
  return { x, y };
}

/** Tooltip accesible (hover + foco + tap). Portaleado a body para no heredar nowrap/uppercase ni quedar recortado. */
export function InfoTip({ text, maxWidth = 280 }: { text: string; maxWidth?: number }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  const reposition = useCallback(() => {
    const anchor = ref.current?.getBoundingClientRect();
    if (!anchor) return;
    const tipHeight = tipRef.current?.offsetHeight ?? 72;
    setCoords(placeTooltip(anchor, tipHeight, maxWidth));
  }, [maxWidth]);

  const show = () => {
    const anchor = ref.current?.getBoundingClientRect();
    if (anchor) setCoords(placeTooltip(anchor, 72, maxWidth));
    setOpen(true);
  };
  const hide = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, text, maxWidth, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => reposition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, reposition]);

  const bubbleStyle: CSSProperties = {
    position: "fixed",
    left: coords?.x ?? 0,
    top: coords?.y ?? 0,
    zIndex: 10000,
    maxWidth,
    width: "max-content",
    background: "#0a0a0a",
    color: "#fff",
    fontSize: 11,
    lineHeight: 1.5,
    fontWeight: 500,
    letterSpacing: 0,
    textTransform: "none",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    padding: "9px 12px",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
    pointerEvents: "none",
    visibility: coords ? "visible" : "hidden",
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, verticalAlign: "middle" }}>
      <button
        ref={ref}
        type="button"
        aria-label={text}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (open) hide();
          else show();
        }}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          margin: 0,
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-fg)",
          lineHeight: 0,
          flexShrink: 0,
          textTransform: "none",
        }}
      >
        <Icon name="info" size={12} color="var(--muted-fg)" />
      </button>
      {mounted && open && coords
        ? createPortal(
            <span ref={tipRef} role="tooltip" style={bubbleStyle}>
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/** Label con icono de ayuda opcional. */
export function LabelWithTip({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      {children}
      {tip ? <InfoTip text={tip} /> : null}
    </span>
  );
}
