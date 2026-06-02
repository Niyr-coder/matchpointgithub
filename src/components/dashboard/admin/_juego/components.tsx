"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

export type ChipMeta = {
  label: string;
  bg: string;
  fg: string;
};

export type AJStat = {
  v: ReactNode;
  l: string;
  highlight?: boolean;
};

export type AJFilterOption = {
  k: string;
  l: string;
  icon?: string;
};

export type AJFilterGroup = {
  label: string;
  value: string;
  options: AJFilterOption[];
  onChange: (value: string) => void;
};

const AJ_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function AJHero({
  chipText,
  title,
  sub,
  wordmark,
  bg,
  accent = "#34d399",
}: {
  chipText: string;
  title: string;
  sub: string;
  wordmark: string;
  bg: string;
  accent?: string;
}) {
  void chipText;
  return (
    <div
      data-novel="aj-hero"
      style={{
        position: "relative",
        padding: "20px 24px",
        borderRadius: 14.4,
        overflow: "hidden",
        color: "#fff",
        background: bg,
      }}
    >
      {wordmark ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 150,
            color: "rgba(255,255,255,0.05)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -25%)",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          {wordmark}
        </div>
      ) : null}
      <div style={{ position: "relative", minWidth: 0, maxWidth: 640 }}>
        <h1
          className="font-heading"
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "0 0 2px",
            lineHeight: 1,
          }}
        >
          {title}
          <span style={{ color: accent }}>.</span>
        </h1>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", maxWidth: 480, lineHeight: 1.45 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

export function AJKpiStrip({ stats }: { stats: AJStat[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {stats.map((s, i) => (
        <div key={`${s.l}-${i}`} className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            {s.highlight ? (
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#f59e0b",
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
            ) : null}
            {s.l}
          </span>
          <span
            className="font-heading tabular"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: s.highlight ? "#b45309" : "var(--fg)",
            }}
          >
            {s.v}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AJFilterBar({
  groups,
  totalAll,
  totalShown,
  onClear,
}: {
  groups: AJFilterGroup[];
  totalAll: number;
  totalShown: number;
  onClear: () => void;
}) {
  const active = groups.some((g) => g.value !== g.options[0]?.k);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0" }}>
      {groups.map((g, gi) => (
        <span key={g.label} style={{ display: "contents" }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
              marginRight: 4,
            }}
          >
            {g.label}
          </span>
          {g.options.map((o) => {
            const on = g.value === o.k;
            return (
              <button
                key={o.k}
                type="button"
                onClick={() => g.onChange(o.k)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 9999,
                  border: `1px solid ${on ? "var(--fg)" : "var(--border)"}`,
                  background: on ? "var(--fg)" : "#fff",
                  color: on ? "#fff" : "var(--muted-fg)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {o.icon ? <Icon name={o.icon} size={11} /> : null}
                {o.l}
              </button>
            );
          })}
          {gi < groups.length - 1 ? (
            <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
          ) : null}
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>
        {active ? (
          <>
            <span style={{ color: "var(--fg)", fontWeight: 900 }}>{totalShown}</span> de {totalAll}
          </>
        ) : (
          <>
            {totalAll} {totalAll === 1 ? "item" : "items"}
          </>
        )}
      </span>
      {active ? (
        <button
          type="button"
          onClick={onClear}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10.5,
            fontWeight: 800,
            color: "var(--muted-fg)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "4px 6px",
          }}
        >
          <Icon name="x" size={11} />
          Limpiar
        </button>
      ) : null}
    </div>
  );
}

export function AJSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
      <Icon
        name="search"
        size={13}
        color="var(--muted-fg)"
        style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "8px 12px 8px 32px",
          borderRadius: 9999,
          border: "1px solid var(--border)",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--fg)",
          background: "#fff",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

export function AJStatusChip({ label, bg, fg }: ChipMeta) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 6,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
    </span>
  );
}

export function AJIconButton({
  title,
  icon,
  onClick,
  bg = "#fff",
  border = "1px solid var(--border)",
  color = "var(--muted-fg)",
  disabled,
}: {
  title: string;
  icon: string;
  onClick: () => void;
  bg?: string;
  border?: string;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        background: bg,
        border,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Icon name={icon} size={12} />
    </button>
  );
}

export function ajFmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${AJ_MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ajFmtMoney(cents: number) {
  if (!cents || cents <= 0) return "—";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function ajRel(iso: string, now = Date.now()) {
  const diff = now - Date.parse(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return ajFmtDate(iso);
}
