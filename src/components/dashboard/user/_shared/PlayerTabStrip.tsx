"use client";

import { Icon } from "@/components/Icon";
import type { PlayerToneKey } from "./playerTones";

export type PlayerTabItem<K extends string = string> = {
  key: K;
  label: string;
  icon: string;
  disabled?: boolean;
  title?: string;
};

type Props<K extends string> = {
  tabs: PlayerTabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  tone: PlayerToneKey;
  ariaLabel?: string;
};

export function PlayerTabStrip<K extends string>({
  tabs,
  active,
  onChange,
  tone,
  ariaLabel = "Vista del evento",
}: Props<K>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="mp-msg-filter-scroll min-w-0 w-full max-w-full"
      style={{
        gap: 18,
        padding: "0 2px",
        borderBottom: "1px solid var(--border)",
        flexWrap: "nowrap",
        maxWidth: "100%",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          type="button"
          className="pv-tab"
          data-on={active === t.key}
          data-tone={tone}
          disabled={t.disabled}
          title={t.title}
          onClick={() => !t.disabled && onChange(t.key)}
        >
          <Icon name={t.icon} size={11} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
