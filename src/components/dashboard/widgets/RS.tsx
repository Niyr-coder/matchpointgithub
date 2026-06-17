// Widgets compartidos por todos los RoleScreens — RSHeader, RSFilters, RSPill, RSTable.
// Migrado 1:1 desde ui_kits/dashboard/RoleScreens.jsx (líneas 5-68).
"use client";
import type { CSSProperties, ReactNode } from "react";
import { InfoTip } from "@/components/dashboard/widgets/InfoTip";

export const RS_BORDER = "1px solid var(--border)";

export function RSHeader({
  label,
  title,
  action,
}: {
  label: string;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="mp-rs-header"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div className="mp-rs-header-copy" style={{ minWidth: 0 }}>
        <div className="label-mp">{label}</div>
        <h1
          className="font-heading mp-rs-header-title"
          style={{
            margin: "6px 0 0",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            lineHeight: 0.95,
          }}
        >
          {title}
          <span className="dot">.</span>
        </h1>
      </div>
      {action && <div className="mp-rs-header-action mp-admin-toolbar">{action}</div>}
    </div>
  );
}

export type RSFilter<K extends string = string> = { k: K; l: string; n?: number };

export function RSFilters<K extends string>({
  items,
  value,
  onChange,
}: {
  items: RSFilter<K>[];
  value: K;
  onChange?: (k: K) => void;
}) {
  return (
    <div className="mp-rs-filters mp-subtle-hscroll">
      {items.map((f) => {
        const on = value === f.k;
        return (
          <button
            key={f.k}
            type="button"
            onClick={() => onChange && onChange(f.k)}
            className="mp-rs-filter-chip"
            style={{
              padding: "7px 13px",
              borderRadius: 9999,
              fontSize: 10.5,
              fontWeight: 800,
              fontFamily: "inherit",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: on ? "#0a0a0a" : "#fff",
              color: on ? "#fff" : "#0a0a0a",
              border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"),
            }}
          >
            {f.l}
            {f.n != null && (
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 9999,
                  background: on ? "rgba(255,255,255,0.2)" : "var(--muted)",
                  color: on ? "#fff" : "var(--muted-fg)",
                  fontSize: 9,
                }}
              >
                {f.n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function RSPill({
  color,
  bg,
  children,
  dot,
}: {
  color?: string;
  bg: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 9999,
        background: bg,
        color: color || "#fff",
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      {dot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: color || "#fff",
          }}
        />
      )}
      {children}
    </span>
  );
}

export type RSColumn<R> = {
  k: string;
  l: string;
  align?: "left" | "center" | "right";
  valign?: CSSProperties["verticalAlign"];
  minWidth?: number | string;
  tip?: string;
  render?: (row: R, i: number) => ReactNode;
};

export function RSTable<R extends Record<string, unknown>>({
  cols,
  rows,
  rowKey,
  rowOnClick,
}: {
  cols: RSColumn<R>[];
  rows: R[];
  rowKey?: (row: R, i: number) => string | number;
  // Si se pasa, cada fila es clickeable y dispara este callback. Útil para
  // navegar a /detalle del item (admin events, admin clubs, etc).
  rowOnClick?: (row: R, i: number) => void;
}) {
  const primaryColKey = cols[0]?.k;
  const actionColKey = cols.find((c) => !c.l.trim())?.k ?? cols[cols.length - 1]?.k;

  return (
    <div className="card min-w-0 w-full max-w-full mp-rs-table-wrap" style={{ padding: 0, overflow: "hidden" }}>
      <div className="mp-table-scroll mp-rs-table-scroll">
        <table className="mp-rs-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead className="mp-rs-table-head">
            <tr style={{ background: "var(--muted)" }}>
              {cols.map((c) => (
                <th
                  key={c.k}
                  className="mp-rs-table-head-cell"
                  style={{
                    padding: "10px 14px",
                    textAlign: c.align || "left",
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--muted-fg)",
                    ...(c.minWidth != null ? { minWidth: c.minWidth } : {}),
                  }}
                >
                  {c.tip ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ whiteSpace: "nowrap" }}>{c.l}</span>
                      <InfoTip text={c.tip} maxWidth={240} />
                    </span>
                  ) : (
                    <span style={{ whiteSpace: "nowrap" }}>{c.l}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={rowKey ? rowKey(r, i) : i}
                className="mp-rs-table-row"
                onClick={rowOnClick ? () => rowOnClick(r, i) : undefined}
                style={{
                  borderTop: RS_BORDER,
                  cursor: rowOnClick ? "pointer" : undefined,
                }}
              >
                {cols.map((c) => {
                  const isPrimary = c.k === primaryColKey;
                  const isAction = c.k === actionColKey;
                  return (
                  <td
                    key={c.k}
                    className={[
                      "mp-rs-table-cell",
                      isPrimary ? "mp-rs-table-primary" : "",
                      isAction ? "mp-rs-table-actions" : "",
                    ].filter(Boolean).join(" ")}
                    data-label={c.l.trim() ? c.l : undefined}
                    data-align={c.align || "left"}
                    onClick={(e) => {
                      if (rowOnClick && (e.target as HTMLElement).closest("button, a, input, select, textarea, label")) {
                        e.stopPropagation();
                      }
                    }}
                    style={{
                      padding: "11px 14px",
                      textAlign: c.align || "left",
                      verticalAlign: c.valign || "middle",
                      ...(c.minWidth != null ? { minWidth: c.minWidth } : {}),
                    }}
                  >
                    <div className="mp-rs-table-value">
                      {c.render ? c.render(r, i) : (r[c.k] as ReactNode)}
                    </div>
                  </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
