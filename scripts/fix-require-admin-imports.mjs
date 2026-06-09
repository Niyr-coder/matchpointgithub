import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

function ensureImport(src) {
  if (!src.includes("requireAdminUserId(")) return src;
  if (/import\s+\{[^}]*requireAdminUserId[^}]*\}\s+from\s+"@\/lib\/auth\/session"/.test(src)) {
    return src;
  }

  const sessionImport = src.match(/import\s+\{([^}]*)\}\s+from\s+"@\/lib\/auth\/session";/);
  if (sessionImport) {
    const parts = sessionImport[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.includes("requireAdminUserId")) parts.push("requireAdminUserId");
    return src.replace(
      sessionImport[0],
      `import { ${parts.join(", ")} } from "@/lib/auth/session";`,
    );
  }

  const useServer = src.match(/^"use server";\r?\n\r?\n/m);
  const importLine = 'import { requireAdminUserId } from "@/lib/auth/session";\n';
  if (useServer) {
    return src.replace(useServer[0], `${useServer[0]}${importLine}`);
  }
  return `${importLine}${src}`;
}

let n = 0;
const SKIP = new Set([
  path.join(ROOT, "src/lib/auth/session.ts"),
  path.join(ROOT, "src/lib/db/client.admin.ts"),
]);
for (const file of walk(path.join(ROOT, "src"))) {
  if (SKIP.has(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  const next = ensureImport(src);
  if (next !== src) {
    fs.writeFileSync(file, next, "utf8");
    n += 1;
    console.log("import", path.relative(ROOT, file));
  }
}
console.log(`imports fixed: ${n}`);
