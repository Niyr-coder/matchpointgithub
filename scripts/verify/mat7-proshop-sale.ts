// MAT-7 / MAT-10 DoD verification: Pro Shop employee sale, end-to-end at DB level.
//
// What it does:
//   1. Seeds (idempotent): demo club, employee profile, active product (stock=10),
//      and (for cash method) an open cash_session.
//   2. Signs in as the employee against Supabase Auth and invokes the
//      `fn_create_sale` RPC (the same atomic path the EmployeeProShopView POS uses
//      via the `createSale` server action).
//   3. Asserts the five DoD invariants on the resulting rows:
//        products.stock 10 → 9
//        sales row exists with correct total_cents and non-null transaction_id
//        sale_items row exists with qty=1 and matching unit_price_cents
//        inventory_movements row exists with delta=-1, reason='sale', ref_id=sale.id
//        transactions row exists with kind='proshop_sale', amount_cents matches, club_id matches
//        (cash only) sum(cash session proshop sales) increased by amount_cents
//   4. Owner visibility: runs the exact query that `ClubFinanzasScreen` issues
//      (transactions by club_id + status='captured' since month start) and
//      confirms the new sale appears in the proshop bucket.
//   5. Negative path: attempts a qty=11 sale (stock=9 remaining) and asserts
//      the call fails with `PROSHOP.OUT_OF_STOCK` and DB state is unchanged.
//
// Run:
//   npx tsx --env-file=.env.local scripts/verify/mat7-proshop-sale.ts
//   # optional: --method=card (default cash) · --keep (skip cleanup)
//
// Required env (.env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Exit code 0 = all assertions passed. Non-zero = first failure printed.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
const METHOD = (process.argv.find((a) => a.startsWith("--method="))?.split("=")[1] ?? "cash") as
  | "cash"
  | "card"
  | "transfer"
  | "wallet";
const KEEP = args.has("--keep");

const DEMO_TAG = "mat7-verify";
const CLUB_SLUG = `${DEMO_TAG}-club`;
const EMPLOYEE_EMAIL = `${DEMO_TAG}-employee@matchpoint.demo`;
const EMPLOYEE_PW = "MatchPoint-verify-2026";
const PRODUCT_SKU = `${DEMO_TAG}-prod-001`;
const START_STOCK = 10;
const PRICE_CENTS = 2500; // $25
const CURRENCY = "USD" as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

const admin: Sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function step(name: string): void {
  console.log(`\n→ ${name}`);
}
function ok(label: string, detail?: string): void {
  console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`);
}
function fail(label: string, detail: unknown): never {
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error("   ", detail);
  process.exit(1);
}

async function ensureEmployee(): Promise<string> {
  const { data: list, error: lErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (lErr) fail("listUsers", lErr.message);
  // listUsers types in @supabase/auth-js v2 type the page as `never` under our
  // generated Database<any> binding; widen here so we can read .email.
  const users = (list?.users ?? []) as Array<{ id: string; email?: string | null }>;
  let user = users.find((u) => u.email === EMPLOYEE_EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMPLOYEE_EMAIL,
      password: EMPLOYEE_PW,
      email_confirm: true,
      user_metadata: { username: `${DEMO_TAG}-emp`, display_name: "Verify Employee", locale: "es" },
    });
    if (error || !data.user) fail("createUser employee", error?.message);
    user = data.user;
  } else {
    // Reset password in case prior run changed it.
    await admin.auth.admin.updateUserById(user.id, { password: EMPLOYEE_PW });
  }
  return user.id;
}

async function ensureClub(employeeId: string): Promise<string> {
  const { data: existing } = await admin
    .from("clubs")
    .select("id")
    .eq("slug", CLUB_SLUG)
    .maybeSingle();
  let clubId = existing?.id as string | undefined;
  if (!clubId) {
    const { data, error } = await admin
      .from("clubs")
      .insert({
        slug: CLUB_SLUG,
        name: "MAT-7 Verify Club",
        country: "EC",
        city: "Quito",
        currency: CURRENCY,
        status: "active",
        sports: ["pickleball"],
      })
      .select("id")
      .single();
    if (error || !data) fail("insert club", error?.message);
    clubId = data.id as string;
  }

  // Ensure employee role on the club, not revoked.
  await admin
    .from("role_assignments")
    .upsert(
      {
        user_id: employeeId,
        role: "employee",
        club_id: clubId,
        revoked_at: null,
      },
      { onConflict: "user_id,role,club_id,partner_id" },
    );
  return clubId!;
}

async function ensureProduct(clubId: string): Promise<{ id: string; priceCents: number }> {
  const { data: existing } = await admin
    .from("products")
    .select("id")
    .eq("club_id", clubId)
    .eq("sku", PRODUCT_SKU)
    .maybeSingle();
  let productId = existing?.id as string | undefined;
  if (productId) {
    // Reset to a clean starting state and wipe any prior verify movements.
    await admin
      .from("products")
      .update({ stock: START_STOCK, active: true, price_cents: PRICE_CENTS, currency: CURRENCY })
      .eq("id", productId);
    await admin.from("inventory_movements").delete().eq("product_id", productId);
  } else {
    const { data, error } = await admin
      .from("products")
      .insert({
        club_id: clubId,
        sku: PRODUCT_SKU,
        name: "Verify Paddle",
        price_cents: PRICE_CENTS,
        currency: CURRENCY,
        stock: START_STOCK,
        low_stock_threshold: 2,
        active: true,
      })
      .select("id")
      .single();
    if (error || !data) fail("insert product", error?.message);
    productId = data.id as string;
  }
  return { id: productId!, priceCents: PRICE_CENTS };
}

async function ensureCashSession(clubId: string, openedBy: string): Promise<string | null> {
  if (METHOD !== "cash") return null;
  const { data: open } = await admin
    .from("cash_sessions")
    .select("id")
    .eq("club_id", clubId)
    .eq("status", "open")
    .maybeSingle();
  if (open?.id) return open.id as string;
  const { data, error } = await admin
    .from("cash_sessions")
    .insert({ club_id: clubId, opened_by: openedBy, opening_float_cents: 0, status: "open" })
    .select("id")
    .single();
  if (error || !data) fail("insert cash_session", error?.message);
  return data.id as string;
}

async function signInEmployee(): Promise<Sb> {
  const client: Sb = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: EMPLOYEE_EMAIL,
    password: EMPLOYEE_PW,
  });
  if (error) fail("signIn employee", error.message);
  return client;
}

async function cleanupPriorSales(productId: string, clubId: string): Promise<void> {
  // Best-effort: wipe any prior verify-run rows so assertions are deterministic.
  const { data: prior } = await admin
    .from("sale_items")
    .select("sale_id")
    .eq("product_id", productId);
  const saleIds = Array.from(new Set((prior ?? []).map((r) => r.sale_id as string)));
  if (saleIds.length) {
    const { data: sales } = await admin
      .from("sales")
      .select("id,transaction_id")
      .in("id", saleIds);
    const txIds = (sales ?? [])
      .map((s) => s.transaction_id as string | null)
      .filter((x): x is string => !!x);
    await admin.from("sale_items").delete().in("sale_id", saleIds);
    await admin.from("sales").delete().in("id", saleIds);
    if (txIds.length) await admin.from("transactions").delete().in("id", txIds);
  }
  await admin.from("inventory_movements").delete().eq("product_id", productId);
  // Reset stock baseline after cleanup so re-runs land at exactly START_STOCK.
  await admin.from("products").update({ stock: START_STOCK }).eq("id", productId);
  // Close any leftover open cash session for this club from previous runs.
  if (METHOD !== "cash") {
    await admin
      .from("cash_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("club_id", clubId)
      .eq("status", "open");
  }
}

async function main(): Promise<void> {
  console.log(`MAT-7 verify · method=${METHOD} · keep=${KEEP}`);

  step("Seed");
  const employeeId = await ensureEmployee();
  ok("employee user", employeeId);
  const clubId = await ensureClub(employeeId);
  ok("club + employee role", clubId);
  const { id: productId, priceCents } = await ensureProduct(clubId);
  ok("product (stock=10)", productId);
  await cleanupPriorSales(productId, clubId);
  ok("prior-run cleanup");
  const cashSessionId = await ensureCashSession(clubId, employeeId);
  if (cashSessionId) ok("cash session open", cashSessionId);

  step("Sign in as employee");
  const empClient = await signInEmployee();
  ok("auth session established");

  step("Create sale (1 unit)");
  const { data: saleId, error: rpcErr } = await empClient.rpc("fn_create_sale", {
    p_club_id: clubId,
    p_user_id: employeeId,
    p_customer_user_id: null as unknown as string,
    p_customer_name: null as unknown as string,
    p_method: METHOD,
    p_items: [{ product_id: productId, qty: 1 }] as unknown as never,
  });
  if (rpcErr || !saleId) fail("fn_create_sale", rpcErr?.message ?? "no sale id");
  ok("sale created", saleId as string);

  step("Assert DB invariants");

  // 1) products.stock 10 → 9
  {
    const { data: p } = await admin
      .from("products")
      .select("stock")
      .eq("id", productId)
      .single();
    const stock = p?.stock as number | undefined;
    if (stock !== START_STOCK - 1) fail("products.stock", `expected ${START_STOCK - 1} got ${stock}`);
    ok("products.stock decremented", `${START_STOCK} → ${stock}`);
  }

  // 2) sales row: total_cents correct, transaction_id non-null
  let txId: string;
  {
    const { data: s, error } = await admin
      .from("sales")
      .select("id,total_cents,transaction_id,club_id,currency")
      .eq("id", saleId as string)
      .single();
    if (error || !s) fail("sales row", error?.message ?? "missing");
    if (s.total_cents !== priceCents)
      fail("sales.total_cents", `expected ${priceCents} got ${s.total_cents}`);
    if (!s.transaction_id) fail("sales.transaction_id", "is null");
    if (s.club_id !== clubId) fail("sales.club_id", `expected ${clubId} got ${s.club_id}`);
    txId = s.transaction_id as string;
    ok("sales row consistent", `total=${s.total_cents} tx=${txId.slice(0, 8)}…`);
  }

  // 3) sale_items row: qty=1, unit_price_cents
  {
    const { data: items } = await admin
      .from("sale_items")
      .select("qty,unit_price_cents,product_id")
      .eq("sale_id", saleId as string);
    if (!items || items.length !== 1) fail("sale_items count", `expected 1 got ${items?.length}`);
    const it = items[0];
    if (it.qty !== 1) fail("sale_items.qty", `expected 1 got ${it.qty}`);
    if (it.unit_price_cents !== priceCents)
      fail("sale_items.unit_price_cents", `expected ${priceCents} got ${it.unit_price_cents}`);
    if (it.product_id !== productId) fail("sale_items.product_id", "mismatch");
    ok("sale_items row", `qty=${it.qty} unit=${it.unit_price_cents}`);
  }

  // 4) inventory_movements: delta=-1, reason='sale', ref_id=sale.id
  {
    const { data: movs } = await admin
      .from("inventory_movements")
      .select("delta,reason,ref_id,product_id,created_by")
      .eq("product_id", productId);
    const sale = (movs ?? []).filter((m) => m.reason === "sale");
    if (sale.length !== 1)
      fail("inventory_movements (reason=sale)", `expected 1 got ${sale.length}`);
    const m = sale[0];
    if (m.delta !== -1) fail("inventory_movements.delta", `expected -1 got ${m.delta}`);
    if (m.ref_id !== saleId) fail("inventory_movements.ref_id", "does not match sale.id");
    if (m.created_by !== employeeId) fail("inventory_movements.created_by", "not employee");
    ok("inventory_movements row", `delta=${m.delta} reason=sale`);
  }

  // 5) transactions: kind='proshop_sale', amount_cents matches, club_id matches
  {
    const { data: t } = await admin
      .from("transactions")
      .select("kind,amount_cents,club_id,method,status,cash_session_id")
      .eq("id", txId)
      .single();
    if (!t) fail("transactions row", "missing");
    if (t.kind !== "proshop_sale") fail("transactions.kind", `got ${t.kind}`);
    if (t.amount_cents !== priceCents)
      fail("transactions.amount_cents", `expected ${priceCents} got ${t.amount_cents}`);
    if (t.club_id !== clubId) fail("transactions.club_id", "mismatch");
    if (t.method !== METHOD) fail("transactions.method", `expected ${METHOD} got ${t.method}`);
    if (t.status !== "captured") fail("transactions.status", `expected captured got ${t.status}`);
    if (METHOD === "cash" && t.cash_session_id !== cashSessionId)
      fail("transactions.cash_session_id", "did not link open session");
    ok(
      "transactions row",
      `kind=${t.kind} amount=${t.amount_cents} method=${t.method} session=${t.cash_session_id ? "linked" : "n/a"}`,
    );
  }

  // 6) cash session sum (for cash method)
  if (METHOD === "cash" && cashSessionId) {
    const { data: txs } = await admin
      .from("transactions")
      .select("amount_cents")
      .eq("cash_session_id", cashSessionId)
      .eq("kind", "proshop_sale")
      .eq("method", "cash");
    const total = (txs ?? []).reduce((s, r) => s + ((r.amount_cents as number) ?? 0), 0);
    if (total < priceCents)
      fail("cash session sum", `expected >= ${priceCents} got ${total}`);
    ok("cash_sessions computed cash_sales_cents", `total=${total}`);
  }

  // 7) Owner finanzas visibility: same query as ClubFinanzasScreen.
  step("Owner finanzas feed visibility");
  {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: txMonth } = await admin
      .from("transactions")
      .select("amount_cents,kind,id")
      .eq("club_id", clubId)
      .eq("status", "captured")
      .gte("created_at", monthStart);
    const proshopRows = (txMonth ?? []).filter((r) => r.kind === "proshop_sale");
    const proshopTotal = proshopRows.reduce(
      (s, r) => s + ((r.amount_cents as number) ?? 0),
      0,
    );
    const includesOurs = proshopRows.some((r) => r.id === txId);
    if (!includesOurs) fail("owner feed", "new sale not in this-month transactions feed");
    if (proshopTotal < priceCents)
      fail("owner feed proshop bucket", `expected >= ${priceCents} got ${proshopTotal}`);
    ok("owner feed includes new sale", `proshop bucket=${proshopTotal} cents`);
  }

  // 8) Negative path: qty=11 on a stock=9 product must throw OUT_OF_STOCK and not mutate.
  step("Negative path: qty=11 (over stock)");
  const preStock = (await admin
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single()).data?.stock as number;
  const preSales = (await admin
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)).count;
  const preTx = (await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)).count;

  const { error: negErr } = await empClient.rpc("fn_create_sale", {
    p_club_id: clubId,
    p_user_id: employeeId,
    p_customer_user_id: null as unknown as string,
    p_customer_name: null as unknown as string,
    p_method: METHOD,
    p_items: [{ product_id: productId, qty: 11 }] as unknown as never,
  });
  if (!negErr) fail("negative path", "RPC unexpectedly succeeded");
  if (!negErr.message.includes("PROSHOP.OUT_OF_STOCK"))
    fail("negative path error code", `expected PROSHOP.OUT_OF_STOCK got ${negErr.message}`);
  ok("RPC threw PROSHOP.OUT_OF_STOCK");

  const postStock = (await admin
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single()).data?.stock as number;
  const postSales = (await admin
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)).count;
  const postTx = (await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)).count;
  if (postStock !== preStock) fail("stock changed on failed sale", `${preStock} → ${postStock}`);
  if (postSales !== preSales) fail("sales count changed on failed sale", `${preSales} → ${postSales}`);
  if (postTx !== preTx) fail("transactions count changed on failed sale", `${preTx} → ${postTx}`);
  ok("no rows mutated (stock + counts intact)");

  // Cleanup (default on; --keep skips)
  if (!KEEP) {
    step("Cleanup");
    await cleanupPriorSales(productId, clubId);
    ok("test rows removed (club + employee retained for re-runs)");
  } else {
    step("Cleanup skipped (--keep)");
  }

  console.log("\nALL CHECKS PASSED · MAT-7 DoD verified.");
}

main().catch((e) => {
  console.error("UNHANDLED:", e);
  process.exit(1);
});
