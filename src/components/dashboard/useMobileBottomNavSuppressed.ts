"use client";

import { useCallback, useEffect, useState } from "react";

const OVERLAY_SELECTOR = [
  '[aria-modal="true"]',
  '[role="dialog"]',
  "[data-mp-overlay]",
  ".mp-modal-overlay",
  ".mp-modal-backdrop",
  ".mp-seek-modal-overlay",
  ".mp-quedada-detail-overlay",
  ".mp-crear-quedada-overlay",
  ".mp-crear-match-overlay",
  ".mp-notif-backdrop",
].join(",");

function isVisibleOverlay(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.classList.contains("mp-mobile-bottom-nav")) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function hasBlockingOverlay(): boolean {
  return Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).some(isVisibleOverlay);
}

/** Oculta la pill mobile cuando hay drawer, modal u overlay encima del dashboard. */
export function useMobileBottomNavSuppressed(externallyHidden: boolean): boolean {
  const [suppressed, setSuppressed] = useState(false);

  const sync = useCallback(() => {
    setSuppressed(externallyHidden || hasBlockingOverlay());
  }, [externallyHidden]);

  useEffect(() => {
    sync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 32);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "role", "aria-modal", "aria-hidden", "style", "data-mp-overlay"],
    });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [sync]);

  return suppressed;
}
