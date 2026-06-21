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

function hasBlockingOverlay(): boolean {
  return !!document.querySelector(OVERLAY_SELECTOR);
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
