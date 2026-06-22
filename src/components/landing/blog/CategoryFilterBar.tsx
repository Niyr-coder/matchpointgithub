"use client";
import { useCallback, useRef } from "react";

type Props = {
  categories: string[];
  active: string;
  onChange: (cat: string) => void;
};

export function CategoryFilterBar({ categories, active, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const idx = categories.indexOf(active);
      if (idx < 0) return;
      const next =
        e.key === "ArrowRight"
          ? (idx + 1) % categories.length
          : (idx - 1 + categories.length) % categories.length;
      onChange(categories[next]);
    },
    [categories, active, onChange],
  );

  return (
    <nav
      aria-label="Filtros por categoría"
      className="sticky z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-3 mb-6 md:mb-8"
      style={{
        top: "var(--site-nav-h, 76px)",
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "blur(10px) saturate(160%)",
        WebkitBackdropFilter: "blur(10px) saturate(160%)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        ref={containerRef}
        role="group"
        aria-label="Categorías"
        onKeyDown={onKeyDown}
        className="flex gap-2 mp-touch-hscroll mp-blog-filter-row"
        style={{
          scrollSnapType: "x mandatory",
        }}
      >
        {categories.map((cat) => {
          const isActive = cat === active;
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(cat)}
              className="font-heading whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              style={{
                scrollSnapAlign: "start",
                padding: "10px 16px",
                minHeight: 40,
                borderRadius: 9999,
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                border: isActive
                  ? "1px solid transparent"
                  : "1px solid var(--border)",
                background: isActive ? "var(--primary-active)" : "var(--card)",
                color: isActive ? "#fff" : "var(--fg)",
                transitionDuration: "120ms",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
