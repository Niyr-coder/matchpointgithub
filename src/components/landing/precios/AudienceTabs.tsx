"use client";

import { useEffect, useRef } from "react";
import type { Audience, AudienceConfig } from "@/lib/pricing/tiers";

type Props = {
  tabs: AudienceConfig[];
  active: Audience;
  onChange: (audience: Audience) => void;
};

/**
 * Sticky-pill tab strip for the 4 audience sections. Behaves as ARIA tablist;
 * arrow keys move focus, Enter/Space activates. Each section in the page must
 * carry `id={`audience-${slug}`}` and `role="tabpanel"` (rendered upstream).
 */
export function AudienceTabs({ tabs, active, onChange }: Props) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep refs array in sync with tab count.
  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, tabs.length);
  }, [tabs.length]);

  function focusByIndex(index: number) {
    const clamped = ((index % tabs.length) + tabs.length) % tabs.length;
    buttonRefs.current[clamped]?.focus();
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(250,250,250,0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "10px 0",
        marginBottom: 28,
      }}
    >
      <div
        role="tablist"
        aria-label="Audiencias"
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 2,
          scrollbarWidth: "none",
        }}
      >
        {tabs.map((tab, idx) => {
          const isActive = active === tab.audience;
          return (
            <button
              key={tab.audience}
              ref={(el) => {
                buttonRefs.current[idx] = el;
              }}
              role="tab"
              type="button"
              id={`audience-tab-${tab.slug}`}
              aria-selected={isActive}
              aria-controls={`audience-${tab.slug}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.audience)}
              onKeyDown={(ev) => {
                if (ev.key === "ArrowRight") {
                  ev.preventDefault();
                  focusByIndex(idx + 1);
                } else if (ev.key === "ArrowLeft") {
                  ev.preventDefault();
                  focusByIndex(idx - 1);
                } else if (ev.key === "Home") {
                  ev.preventDefault();
                  focusByIndex(0);
                } else if (ev.key === "End") {
                  ev.preventDefault();
                  focusByIndex(tabs.length - 1);
                }
              }}
              style={{
                minHeight: 44,
                padding: "10px 18px",
                borderRadius: 999,
                border: isActive ? "1px solid transparent" : "1px solid var(--border)",
                background: isActive ? "var(--fg)" : "var(--card)",
                color: isActive ? "#fff" : "var(--fg)",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: isActive ? 800 : 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "background 140ms ease, color 140ms ease",
              }}
            >
              {tab.heading.replace(/^Para /, "")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
