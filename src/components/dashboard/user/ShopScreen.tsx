// Server: fetch products + categories activos. Carrito sigue via evento custom
// (mp-add-to-cart) hasta que tengamos checkout real.
import { getServerClient } from "@/lib/db/client.server";
import { ShopScreenView, type ShopCategory, type ShopProduct } from "./ShopScreenView";

async function loadData() {
  const supabase = await getServerClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,description,price_cents,currency,stock,cover_url,active,category_id,attributes,product_categories(name,slug)")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(48),
    supabase
      .from("product_categories")
      .select("id,name,slug")
      .order("ordinal", { ascending: true }),
  ]);

  const cats: ShopCategory[] = (categories ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
  }));

  const items: ShopProduct[] = (products ?? []).map((p) => {
    const cat = p.product_categories as { name?: string; slug?: string } | null;
    const attrs = (p.attributes as Record<string, unknown> | null) ?? {};
    return {
      id: p.id as string,
      name: p.name as string,
      description: (p.description as string | null) ?? null,
      priceCents: p.price_cents as number,
      wasCents:
        typeof attrs.was_cents === "number" ? (attrs.was_cents as number) : null,
      stock: (p.stock as number) ?? 0,
      coverUrl: (p.cover_url as string | null) ?? null,
      categoryName: cat?.name ?? "Sin categoría",
      categorySlug: cat?.slug ?? null,
      tag: (attrs.tag as string | undefined) ?? null,
      rating: typeof attrs.rating === "number" ? (attrs.rating as number) : null,
      reviews: typeof attrs.reviews === "number" ? (attrs.reviews as number) : 0,
    };
  });

  return { products: items, categories: cats };
}

export async function ShopScreen() {
  const data = await loadData();
  return <ShopScreenView {...data} />;
}
