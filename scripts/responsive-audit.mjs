#!/usr/bin/env node
// Responsive audit · re-scan de inline styles que rompen mobile-first.
// Reglas alineadas con docs/guides/06-responsive.md: layout que cambia entre
// breakpoints (grids de N columnas, paddings de sección, 2-col) NO debe vivir
// inline porque no tiene variante `md:` y no stackea en mobile.
//
// Distinción clave: un grid ancho de columnas fijas DENTRO de un contenedor
// con overflowX:auto (+ minWidth) hace scroll dentro de la card → aceptable.
// El mismo grid SIN ese wrapper desborda la página → "page-overflow" (alto).
//
// Uso: node scripts/responsive-audit.mjs [--json]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
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
const reGrid = /gridTemplateColumns:\s*(["'`])([^"'`]+)\1/;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  // Señal a nivel de ARCHIVO de scroll horizontal contenido (patrón aceptado:
  // .mp-table-scroll / overflowX:auto / minWidth de 3 dígitos / min-w-[). Las
  // filas de una tabla comparten el wrapper de su cabecera aunque estén lejos,
  // por eso se evalúa por archivo y no por ventana de líneas (evita falsos
  // positivos en tablas largas).
  const fileHasScrollWrap =
    /mp-table-scroll|overflowX:\s*["'`](auto|scroll)|overflow-x-auto|minWidth:\s*\d{3}|min-w-\[/.test(src);
  const hasScrollWrapNear = () => fileHasScrollWrap;

  lines.forEach((line, i) => {
    const m = line.match(reGrid);
    if (!m) return;
    const val = m[2].trim();
    const pxCols = (val.match(/\d+px/g) || []).length;
    const repeat = val.match(/repeat\((\d+)\s*,/);
    const fracCols = (val.match(/[\d.]+fr/g) || []).length;
    const hasResponsiveHelper = /minmax\(|auto-fit|auto-fill|var\(--mp-cols/.test(val);

    let rule = null;
    let sev = "med";
    if (repeat && Number(repeat[1]) >= 3 && !hasResponsiveHelper) {
      rule = "inline-repeat-grid";
      sev = Number(repeat[1]) >= 6 ? "high" : "med";
    } else if (pxCols >= 2 && !hasResponsiveHelper) {
      rule = "inline-wide-table-grid";
      sev = hasScrollWrapNear(i) ? "low" : "high"; // wrapper → contenido scrollea
    } else if (fracCols === 2 && pxCols === 0 && !repeat && !hasResponsiveHelper) {
      rule = "inline-two-col-layout";
      sev = "med";
    }
    if (rule) {
      findings.push({ file: file.replace(/\\/g, "/"), line: i + 1, rule, severity: sev, snippet: line.trim().slice(0, 90) });
    }
  });
}

// padding de sección inline (≥40px en cualquier eje)
const rePad = /padding:\s*(["'`])([^"'`]*?)\1/;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(rePad);
    if (!m) return;
    const nums = (m[2].match(/(\d+)px/g) || []).map((x) => parseInt(x));
    if (nums.some((n) => n >= 40)) {
      findings.push({ file: file.replace(/\\/g, "/"), line: i + 1, rule: "inline-section-padding", severity: "med", snippet: line.trim().slice(0, 90) });
    }
  });
}

const byRule = {};
const bySev = {};
const byFile = {};
for (const f of findings) {
  byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  bySev[f.severity] = (bySev[f.severity] || 0) + 1;
  byFile[f.file] = (byFile[f.file] || 0) + 1;
}
const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 15);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: findings.length, byRule, bySev, topFiles, findings }, null, 2));
} else {
  console.log(`total: ${findings.length} | ${JSON.stringify(bySev)}`);
  console.log("byRule:", JSON.stringify(byRule));
  console.log("\ntop files:");
  topFiles.forEach(([f, c]) => console.log(`  ${c}  ${f}`));
  console.log("\nHIGH (page-overflow / repeat ancho):");
  findings.filter((f) => f.severity === "high").forEach((f) => console.log(`  ${f.file}:${f.line} [${f.rule}] ${f.snippet}`));
}
