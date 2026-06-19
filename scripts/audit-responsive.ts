/**
 * Audit responsive: anti-patterns de docs/guides/06-responsive.md §6.
 *   npx tsx scripts/audit-responsive.ts
 *   npx tsx scripts/audit-responsive.ts --json   # salida machine-readable
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.env.AUDIT_RESPONSIVE_OUT;

type Severity = "high" | "med" | "low";
type Finding = { file: string; line: number; rule: string; severity: Severity; snippet: string };

/** Padding de sección (100px/60px verticales), no micro-padding de chips/celdas. */
function isSectionPadding(line: string): boolean {
  const m = line.match(/padding:\s*["']([^"']+)["']/);
  if (!m) return false;
  const parts = m[1].trim().split(/\s+/);
  const vertical = parts.length === 1 ? parts[0] : parts[0];
  const px = parseInt(vertical, 10);
  if (Number.isNaN(px)) return false;
  return px >= 40;
}

const RULES: Array<{
  id: string;
  severity: Severity;
  test: (line: string) => boolean;
}> = [
  {
    id: "inline-section-padding",
    severity: "high",
    test: isSectionPadding,
  },
  {
    id: "inline-two-col-layout",
    severity: "high",
    test: (l) =>
      /gridTemplateColumns:\s*["']1fr\s+1fr["']/.test(l) ||
      /gridTemplateColumns:\s*["']repeat\(2,\s*1fr\)["']/.test(l),
  },
  {
    id: "inline-repeat-grid",
    severity: "high",
    test: (l) =>
      /gridTemplateColumns:\s*["']repeat\(\d+,\s*(?:1fr|minmax)/.test(l) &&
      !/repeat\(auto-fill/.test(l),
  },
  {
    id: "fixed-width-1280",
    severity: "high",
    test: (l) => /\bwidth:\s*1280/.test(l) && !/maxWidth:/.test(l),
  },
  {
    id: "inline-wide-table-grid",
    severity: "med",
    test: (l) => {
      const m = l.match(/gridTemplateColumns:\s*["']([^"']+)["']/);
      if (!m) return false;
      const cols = m[1];
      const fixedCols = cols.match(/\d{3,}px/g);
      return Boolean(fixedCols && fixedCols.length >= 2);
    },
  },
  {
    id: "inline-large-font",
    severity: "med",
    test: (l) => /fontSize:\s*["'](?:1[6-9]\d|[2-9]\d{2})px["']/.test(l),
  },
  {
    id: "fixed-min-width",
    severity: "med",
    test: (l) => /minWidth:\s*["'](?:[5-9]\d{2}|[1-9]\d{3})px["']/.test(l),
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      out.push(...walk(p));
    } else if (/\.(tsx|jsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function trimSnippet(line: string, max = 96): string {
  const s = line.trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function surfaceOf(file: string): string {
  if (file.includes("/app/(public)") || file.includes("/components/landing")) return "landing";
  if (file.includes("/dashboard/")) return "dashboard";
  if (file.includes("/auth/") || file.includes("AuthModal")) return "auth";
  if (file.includes("/onboarding/")) return "onboarding";
  return "other";
}

const findings: Finding[] = [];

for (const file of walk(ROOT)) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("style=") && !line.includes("gridTemplate") && !line.includes("fontSize:")) {
      continue;
    }
    for (const rule of RULES) {
      if (rule.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          severity: rule.severity,
          snippet: trimSnippet(line),
        });
      }
    }
  }
}

const byFile = new Map<string, number>();
const bySurface = new Map<string, number>();
const byRule = new Map<string, number>();
for (const f of findings) {
  byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  const surf = surfaceOf(f.file);
  bySurface.set(surf, (bySurface.get(surf) ?? 0) + 1);
  byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
}

const topFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
const highCount = findings.filter((f) => f.severity === "high").length;

const report = {
  generatedAt: new Date().toISOString(),
  total: findings.length,
  high: highCount,
  byRule: Object.fromEntries([...byRule.entries()].sort((a, b) => b[1] - a[1])),
  bySurface: Object.fromEntries(bySurface),
  topFiles: topFiles.map(([file, count]) => ({ file, count })),
  findings,
};

if (OUT_FILE) {
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n=== Audit responsive (${findings.length} hallazgos, ${highCount} HIGH) ===\n`);
  console.log("Por superficie:");
  for (const [surf, count] of [...bySurface.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${surf}: ${count}`);
  }
  console.log("\nPor regla:");
  for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule}: ${count}`);
  }
  console.log("\nTop 25 archivos:");
  for (const { file, count } of report.topFiles) {
    console.log(`  ${count.toString().padStart(3)}  ${file}`);
  }
  console.log("\nEjemplos HIGH (primeros 15):");
  for (const f of findings.filter((x) => x.severity === "high").slice(0, 15)) {
    console.log(`  ${f.file}:${f.line} [${f.rule}]`);
  }
  console.log(`\nDetalle completo: AUDIT_RESPONSIVE_OUT=audit-responsive.json npx tsx scripts/audit-responsive.ts\n`);
}

process.exit(highCount > 0 ? 1 : 0);
