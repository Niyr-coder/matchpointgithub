// CSV export helper. Genera y descarga un CSV en el cliente.
// No dependencias; escapa comillas y encierra celdas con comas/comillas/saltos de línea.

function escapeCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: { header: string; get: (row: T) => unknown }[]): void {
  if (typeof window === "undefined") return;
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.get(r))).join(","))
    .join("\r\n");
  const csv = `${header}\r\n${body}`;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filename}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
