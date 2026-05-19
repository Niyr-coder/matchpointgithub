-- 114 · Bundles cosméticos del perfil (Stage 3 de customización).
--
-- Modelo: cada preset del catálogo (accent/banner/card) tiene un bundleKey:
--   'mp_plus' → desbloqueado mientras user.plan_tier='premium' (no requiere fila)
--   '<bundle_key>' → requiere fila en profile_cosmetic_grants
--
-- cosmetic_bundles: catálogo público (todos auth lo leen; admin lo edita).
-- profile_cosmetic_grants: ownership permanente (paid one-time, no expira).

create table if not exists public.cosmetic_bundles (
  key text primary key,
  label text not null,
  description text,
  price_cents int not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cosmetic_bundles enable row level security;

drop policy if exists cb_public_select on public.cosmetic_bundles;
create policy cb_public_select on public.cosmetic_bundles
  for select using ( active = true or auth.jwt() ->> 'role' = 'admin' );

drop policy if exists cb_admin_write on public.cosmetic_bundles;
create policy cb_admin_write on public.cosmetic_bundles
  for all using ( auth.jwt() ->> 'role' = 'admin' );

create table if not exists public.profile_cosmetic_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bundle_key text not null references public.cosmetic_bundles(key) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  note text,
  primary key (user_id, bundle_key)
);

create index if not exists idx_pcg_user on public.profile_cosmetic_grants (user_id);
create index if not exists idx_pcg_bundle on public.profile_cosmetic_grants (bundle_key);

alter table public.profile_cosmetic_grants enable row level security;

drop policy if exists pcg_self_select on public.profile_cosmetic_grants;
create policy pcg_self_select on public.profile_cosmetic_grants
  for select using ( user_id = auth.uid() );

drop policy if exists pcg_admin_all on public.profile_cosmetic_grants;
create policy pcg_admin_all on public.profile_cosmetic_grants
  for all using ( auth.jwt() ->> 'role' = 'admin' );

insert into public.cosmetic_bundles (key, label, description, price_cents, sort_order) values
  ('pack_neon',   'Pack Neon',   'Tonos eléctricos con glow neón — banners y card styles que iluminan tu perfil.', 500, 10),
  ('pack_gold',   'Pack Gold',   'Para los campeones — accent dorado, banners cálidos y card holográfica.',       500, 20),
  ('pack_carbon', 'Pack Carbon', 'Minimalismo oscuro premium — onyx, graphite y carbon.',                          400, 30),
  ('pack_sakura', 'Pack Sakura', 'Tonos rosados y pastel mesh con vibe holográfica.',                              400, 40)
on conflict (key) do nothing;
