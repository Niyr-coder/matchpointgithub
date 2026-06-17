/**
 * Lista server actions que exportan mutaciones pero no usan runMutation.
 *   npx tsx scripts/audit-mutations.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src/server/actions");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const MUTATION_HINT =
  /\.(insert|update|delete|upsert)\(|\.rpc\(|signUp|signIn|signOut|cancel|approve|reject|revoke|assign|create|submit|close|publish|dispatch|grant|suspend|refund|draw|enter|register|enqueue)/;

let issues = 0;

for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("runAction(") && !src.includes("export async function")) continue;

  const exports = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  for (const fn of exports) {
    const fnStart = src.indexOf(`export async function ${fn}`);
    const nextExport = src.indexOf("export async function", fnStart + 1);
    const body = src.slice(fnStart, nextExport === -1 ? undefined : nextExport);
    if (!body.includes("runAction(") && !body.includes("runMutation(")) continue;
    if (body.includes("runMutation(")) continue;
    if (body.includes('mutation: true')) continue;
    if (!MUTATION_HINT.test(body)) continue;
    console.log(`${file.replace(process.cwd() + "/", "")} :: ${fn}`);
    issues++;
  }
}

console.log(`\n${issues} mutación(es) sin runMutation (revisar manualmente).`);
process.exit(issues > 0 ? 1 : 0);
