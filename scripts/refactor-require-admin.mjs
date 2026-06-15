import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TARGET_DIRS = [path.join(ROOT, "src")];

const FN_RE =
  /async function requireAdmin(?:UserId|Id)?\(\): Promise<string> \{[\s\S]*?return user(?:\.id|Id);\r?\n\}/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  if (!FN_RE.test(src)) return false;
  src = fs.readFileSync(file, "utf8");
  const next = src.replace(FN_RE, "").replace(/\n{3,}/g, "\n\n");
  if (next === src) return false;

  let out = next;
  if (!out.includes("requireAdminUserId")) return false;

  if (!/from "@\/lib\/auth\/session"/.test(out)) {
    out = out.replace(
      /(import[^\n]+\n)/,
      '$1import { requireAdminUserId } from "@/lib/auth/session";\n',
    );
  } else if (!/requireAdminUserId/.test(out.split("from \"@/lib/auth/session\"")[0] + "requireAdminUserId")) {
    out = out.replace(
      /import \{([^}]*)\} from "@\/lib\/auth\/session";/,
      (m, inner) => {
        if (inner.includes("requireAdminUserId")) return m;
        const parts = inner.split(",").map((s) => s.trim()).filter(Boolean);
        parts.push("requireAdminUserId");
        return `import { ${parts.join(", ")} } from "@/lib/auth/session";`;
      },
    );
  }

  out = out.replace(/\brequireAdmin\(\)/g, "requireAdminUserId()");
  out = out.replace(/\brequireAdminId\(\)/g, "requireAdminUserId()");

  fs.writeFileSync(file, out, "utf8");
  return true;
}

let n = 0;
for (const dir of TARGET_DIRS) {
  for (const file of walk(dir)) {
    if (file.endsWith("AdminPagosScreen.tsx")) continue;
    if (file.endsWith("payment-proofs.ts")) continue;
    if (file.endsWith("player-subscriptions.ts")) continue;
    if (file.endsWith("session.ts")) continue;
    if (file.endsWith("roles.ts")) continue;
    if (patchFile(file)) {
      n += 1;
      console.log("patched", path.relative(ROOT, file));
    }
  }
}
console.log(`done: ${n} files`);
