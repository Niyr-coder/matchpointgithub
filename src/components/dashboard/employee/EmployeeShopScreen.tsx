// Server: catálogo de productos activos del club para venta rápida.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { EmployeeShopScreenView, type ShopData, type ShopItem } from "./EmployeeShopScreenView";

// Paleta de gradients para los covers cuando el producto no tiene cover_url.
const GRADIENTS = [
  "linear-gradient(135deg,#0a0a0a,#27272a)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#facc15,#ca8a04)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#831843,#db2777)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
];

function iconForCategory(cat: string | null): string {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("ropa") || c.includes("polera") || c.includes("camis")) return "shirt";
  if (c.includes("bolso") || c.includes("mochila")) return "briefcase";
  if (c.includes("pelota")) return "circle-dot";
  return "circle";
}

async function loadData(): Promise<ShopData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, items: [] };

  const supabase = await getServerClient();
  const { data: products } = await supabase
    .from("products")
    .select("id,name,price_cents,stock,category_id,product_categories(name)")
    .eq("club_id", clubId)
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(40);

  const items: ShopItem[] = (products ?? []).map((p, i) => {
    const cat = (p.product_categories as { name?: string } | null)?.name ?? "Producto";
    return {
      id: p.id as string,
      name: (p.name as string) ?? "—",
      cat,
      price: Math.round(((p.price_cents as number) ?? 0) / 100),
      stock: (p.stock as number) ?? 0,
      color: GRADIENTS[i % GRADIENTS.length],
      i: iconForCategory(cat),
    };
  });

  return { clubId, items };
}

export async function EmployeeShopScreen() {
  const data = await loadData();
  return <EmployeeShopScreenView data={data} />;
}
