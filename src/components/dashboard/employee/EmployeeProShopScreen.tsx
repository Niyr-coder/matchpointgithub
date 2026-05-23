// Server shell del POS empleado v2. Carga catálogo + categorías + ventas de hoy
// + estado de la caja activa, y delega a EmployeeProShopView (client).
//
// Reemplaza al mock previo donde el catálogo y las ventas eran hard-coded.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { EmployeeProShopView } from "./EmployeeProShopView";

const GRADIENTS = [
  "linear-gradient(135deg,#0a0a0a,#27272a)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#facc15,#ca8a04)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#831843,#db2777)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0ea5e9,#0369a1)",
  "linear-gradient(135deg,#fbbf24,#ea580c)",
];

function iconForSlug(slug: string | null): string {
  const s = (slug ?? "").toLowerCase();
  if (s.includes("paleta") || s.includes("racket")) return "circle";
  if (s.includes("pelota") || s.includes("ball")) return "circle-dot";
  if (s.includes("ropa") || s.includes("shirt") || s.includes("apparel")) return "shirt";
  if (s.includes("bar") || s.includes("drink") || s.includes("bebida")) return "cup-soda";
  if (s.includes("snack") || s.includes("food")) return "sandwich";
  if (s.includes("access") || s.includes("bolso") || s.includes("bag")) return "briefcase";
  return "circle";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export type PSProduct = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  cat: string;
  catSlug: string | null;
  categoryId: string | null;
  priceCents: number;
  price: number;
  currency: string;
  stock: number;
  lowStockThreshold: number;
  active: boolean;
  coverUrl: string | null;
  bg: string;
  icon: string;
};

export type PSCategory = { id: string; name: string; slug: string };

export type PSSaleRow = {
  id: string;
  time: string;
  customer: string;
  itemsLabel: string;
  totalCents: number;
  currency: string;
  method: string;
};

export type PSCashSession = {
  id: string;
  openingFloatCents: number;
  cashSalesCents: number;
  openedAt: string;
} | null;

export type ProShopData = {
  clubId: string | null;
  defaultCurrency: string;
  products: PSProduct[];
  categories: PSCategory[];
  todaySales: PSSaleRow[];
  cashSession: PSCashSession;
};

async function loadData(): Promise<ProShopData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return {
      clubId: null,
      defaultCurrency: "USD",
      products: [],
      categories: [],
      todaySales: [],
      cashSession: null,
    };
  }

  const supabase = await getServerClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,name,sku,description,price_cents,currency,stock,low_stock_threshold,active,category_id,cover_url,product_categories(name,slug)",
      )
      .eq("club_id", clubId)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("product_categories")
      .select("id,name,slug,ordinal")
      .or(`club_id.eq.${clubId},club_id.is.null`)
      .order("ordinal", { ascending: true }),
  ]);

  // Default currency from existing product (or USD fallback). Used when employee
  // creates a new product to avoid mixing currencies in the same club.
  const defaultCurrency = (products?.[0]?.currency as string) ?? "USD";

  const cats: PSCategory[] = (categories ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
  }));

  const items: PSProduct[] = (products ?? []).map((p, i) => {
    const cat = (p.product_categories as { name?: string; slug?: string } | null) ?? null;
    return {
      id: p.id as string,
      name: (p.name as string) ?? "—",
      sku: (p.sku as string | null) ?? null,
      description: (p.description as string | null) ?? null,
      cat: cat?.name ?? "Sin categoría",
      catSlug: cat?.slug ?? null,
      categoryId: (p.category_id as string | null) ?? null,
      priceCents: (p.price_cents as number) ?? 0,
      price: Math.round(((p.price_cents as number) ?? 0) / 100),
      currency: (p.currency as string) ?? defaultCurrency,
      stock: (p.stock as number) ?? 0,
      lowStockThreshold: (p.low_stock_threshold as number) ?? 5,
      active: (p.active as boolean) ?? true,
      coverUrl: (p.cover_url as string | null) ?? null,
      bg: GRADIENTS[i % GRADIENTS.length],
      icon: iconForSlug(cat?.slug ?? null),
    };
  });

  // Today's sales for the Movimientos tab.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: salesRows } = await supabase
    .from("sales")
    .select(
      "id,total_cents,currency,created_at,customer_user_id,transaction_id,sale_items(qty,product_id,products(name)),transactions(method,customer_name)",
    )
    .eq("club_id", clubId)
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: false })
    .limit(40);

  const customerIds = Array.from(
    new Set(
      (salesRows ?? [])
        .map((s) => s.customer_user_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );
  let nameByUser = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", customerIds);
    nameByUser = new Map(
      ((profs ?? []) as Array<{ id: string; display_name: string }>).map((p) => [
        p.id,
        p.display_name,
      ]),
    );
  }

  const todaySales: PSSaleRow[] = (salesRows ?? []).map((s) => {
    const tx = (s.transactions as { method?: string; customer_name?: string } | null) ?? null;
    const lines = (s.sale_items as Array<{
      qty: number;
      product_id: string;
      products: { name?: string } | null;
    }>) ?? [];
    const itemsLabel = lines
      .map((li) => `${li.qty}× ${li.products?.name ?? "Producto"}`)
      .join(", ");
    const customerId = s.customer_user_id as string | null;
    const customer = customerId
      ? nameByUser.get(customerId) ?? tx?.customer_name ?? "Cliente"
      : tx?.customer_name ?? "Walk-in";
    return {
      id: s.id as string,
      time: formatTime(s.created_at as string),
      customer,
      itemsLabel: itemsLabel || "—",
      totalCents: (s.total_cents as number) ?? 0,
      currency: (s.currency as string) ?? defaultCurrency,
      method: tx?.method ?? "—",
    };
  });

  // Estado de la caja abierta del club (best-effort; si el club no tiene
  // cash_sessions abiertas mostramos cero y dejamos el banner de "abrir caja").
  const { data: openSession } = await supabase
    .from("cash_sessions")
    .select("id,opening_float_cents,opened_at")
    .eq("club_id", clubId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let cashSession: PSCashSession = null;
  if (openSession) {
    const cashSalesCents = (salesRows ?? [])
      .filter((s) => {
        const tx = (s.transactions as { method?: string } | null) ?? null;
        return tx?.method === "cash";
      })
      .reduce((acc, s) => acc + ((s.total_cents as number) ?? 0), 0);
    cashSession = {
      id: openSession.id as string,
      openingFloatCents: (openSession.opening_float_cents as number) ?? 0,
      cashSalesCents,
      openedAt: openSession.opened_at as string,
    };
  }

  return {
    clubId,
    defaultCurrency,
    products: items,
    categories: cats,
    todaySales,
    cashSession,
  };
}

export async function EmployeeProShopScreen() {
  const data = await loadData();
  return <EmployeeProShopView data={data} />;
}
