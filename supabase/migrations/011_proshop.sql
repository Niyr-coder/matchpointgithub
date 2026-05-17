-- 011 · Pro shop: products, inventory, carts, sales.
-- See 20-database.md §8 and 30-rls.md §4.6.

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),
  name text not null,
  slug text not null,
  ordinal int not null default 0,
  unique (club_id, slug)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),
  category_id uuid references product_categories(id),
  sku text,
  name text not null,
  description text,
  price_cents int not null,
  currency mp_currency not null,
  stock int not null default 0,
  low_stock_threshold int not null default 5,
  active boolean not null default true,
  cover_url text,
  attributes jsonb default '{}',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (club_id, sku)
);
create index idx_products_club_active on products (club_id) where active;
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);
create trigger tg_products_updated before update on products
  for each row execute function tg_set_updated_at();

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('purchase','sale','adjustment','return','damaged')),
  ref_id uuid,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);

create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  club_id uuid references clubs(id),
  status text not null default 'active' check (status in ('active','checked_out','abandoned')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create trigger tg_carts_updated before update on carts
  for each row execute function tg_set_updated_at();

create table cart_items (
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id),
  qty int not null check (qty > 0),
  unit_price_cents int not null,
  primary key (cart_id, product_id)
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  customer_user_id uuid references profiles(id),
  cart_id uuid references carts(id),
  transaction_id uuid references transactions(id),
  total_cents int not null,
  currency mp_currency not null,
  sold_by uuid references profiles(id),
  created_at timestamptz default now() not null
);

create table sale_items (
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  qty int not null,
  unit_price_cents int not null,
  primary key (sale_id, product_id)
);

-- RLS
alter table product_categories enable row level security;
create policy pc_public_select on product_categories for select using (true);
create policy pc_staff_write on product_categories for all
  using (club_id is null or mp_club_staff(club_id));

alter table products enable row level security;
create policy products_public_select on products for select using (active);
create policy products_staff_write on products for all
  using (club_id is null or mp_club_staff(club_id))
  with check (club_id is null or mp_club_staff(club_id));

alter table inventory_movements enable row level security;
create policy im_staff on inventory_movements for all using (
  exists(select 1 from products p where p.id = product_id
         and (p.club_id is null or mp_club_staff(p.club_id) or mp_is_employee_of(p.club_id)))
);

alter table carts enable row level security;
create policy carts_self on carts for all using (user_id = auth.uid());

alter table cart_items enable row level security;
create policy cart_items_self on cart_items for all using (
  exists(select 1 from carts c where c.id = cart_id and c.user_id = auth.uid())
);

alter table sales enable row level security;
create policy sales_staff_all on sales for all
  using (mp_club_staff(club_id) or mp_is_employee_of(club_id));
create policy sales_customer_select on sales for select
  using (customer_user_id = auth.uid());

alter table sale_items enable row level security;
create policy si_visible on sale_items for select using (
  exists(select 1 from sales s where s.id = sale_id
         and (s.customer_user_id = auth.uid()
              or mp_club_staff(s.club_id) or mp_is_employee_of(s.club_id)))
);
create policy si_staff_write on sale_items for all using (
  exists(select 1 from sales s where s.id = sale_id
         and (mp_club_staff(s.club_id) or mp_is_employee_of(s.club_id)))
);
