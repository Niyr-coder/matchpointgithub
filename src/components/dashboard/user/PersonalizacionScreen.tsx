// Server component: fetchea plan + customización + grants del user logueado
// + catálogo de bundles activos. La gating MP+ se aplica en server (rejecta
// mutaciones) y en client (oculta picker / muestra badges locked).
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { getPlanForUser } from "@/lib/auth/plan";
import { PersonalizacionScreenClient } from "./PersonalizacionScreenClient";

export type BundleCatalogRow = {
  key: string;
  label: string;
  description: string | null;
  priceCents: number;
};

export async function PersonalizacionScreen() {
  const session = await getSession();
  if (!session.authenticated) {
    return (
      <PersonalizacionScreenClient
        isPremium={false}
        initial={null}
        myGrants={[]}
        bundles={[]}
      />
    );
  }
  const userId = session.session.userId;
  const supabase = await getServerClient();

  const [plan, profileRes, grantsRes, bundlesRes] = await Promise.all([
    getPlanForUser(supabase, userId),
    supabase
      .from("profiles")
      .select("accent_color,banner_preset,card_style" as never)
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("profile_cosmetic_grants")
      .select("bundle_key" as never)
      .eq("user_id", userId),
    supabase
      .from("cosmetic_bundles")
      .select("key,label,description,price_cents,active,sort_order" as never)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const row = (profileRes.data ?? {}) as {
    accent_color?: string | null;
    banner_preset?: string | null;
    card_style?: string | null;
  };
  const myGrants = ((grantsRes.data ?? []) as Array<{ bundle_key: string }>).map(
    (g) => g.bundle_key,
  );
  const bundles: BundleCatalogRow[] = (
    (bundlesRes.data ?? []) as Array<{
      key: string;
      label: string;
      description: string | null;
      price_cents: number;
    }>
  ).map((b) => ({
    key: b.key,
    label: b.label,
    description: b.description,
    priceCents: b.price_cents,
  }));

  return (
    <PersonalizacionScreenClient
      isPremium={plan.tier === "premium"}
      initial={{
        accentColor: row.accent_color ?? null,
        bannerPreset: row.banner_preset ?? null,
        cardStyle: row.card_style ?? null,
      }}
      myGrants={myGrants}
      bundles={bundles}
    />
  );
}
