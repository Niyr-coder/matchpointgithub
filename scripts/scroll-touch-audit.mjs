#!/usr/bin/env node
// Audit de scroll horizontal touch-friendly.
// Detecta contenedores con overflow-x inline/Tailwind sin clase canónica.
//
// Uso:
//   node scripts/scroll-touch-audit.mjs
//   node scripts/scroll-touch-audit.mjs --json
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const CANONICAL =
  /mp-touch-hscroll|mp-hscroll|mp-table-scroll|mp-subtle-hscroll|mp-noscroll|mp-cards-row|mp-canchas-tabs|mp-canchas-timeline-scroll|mp-canchas-pricing-scroll|mp-bk-scroll|[\w-]+-scroll|overflow-x-hidden|overflowX:\s*["'`]hidden|overflow-x:\s*hidden/;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(tsx|jsx)$/.test(name)) files.push(p);
  }
})(ROOT);

const findings = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    const hasOverflow =
      /overflowX:\s*["'`](auto|scroll)["'`]/.test(line) ||
      /\boverflow-x-auto\b/.test(line) ||
      /\boverflow-x-scroll\b/.test(line);
    if (!hasOverflow) return;

    const window = lines.slice(Math.max(0, i - 3), i + 2).join("\n");
    if (CANONICAL.test(window)) return;

    let kind = "inline-overflowX";
    if (/\boverflow-x-auto\b/.test(line)) kind = "tailwind-overflow-x-auto";
    if (/\boverflow-x-scroll\b/.test(line)) kind = "tailwind-overflow-x-scroll";

    findings.push({
      file: file.replace(/\\/g, "/"),
      line: i + 1,
      kind,
      severity: kind.startsWith("tailwind") ? "med" : "high",
      snippet: line.trim().slice(0, 100),
    });
  });
}

findings.sort((a, b) => {
  const sev = { high: 0, med: 1, low: 2 };
  return (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9) || a.file.localeCompare(b.file);
});

const json = process.argv.includes("--json");
if (json) {
  console.log(JSON.stringify({ total: findings.length, findings }, null, 2));
} else {
  const high = findings.filter((f) => f.severity === "high");
  const med = findings.filter((f) => f.severity === "med");
  console.log(`Scroll touch audit · ${findings.length} candidatos (${high.length} high, ${med.length} med)\n`);
  console.log("Fix canónico: className=\"mp-touch-hscroll\" (+ minWidth en hijo si aplica)\n");
  for (const f of findings) {
    console.log(`[${f.severity.toUpperCase()}] ${f.file}:${f.line} (${f.kind})`);
    console.log(`  ${f.snippet}\n`);
  }
}

process.exit(findings.length > 0 ? 1 : 0);
