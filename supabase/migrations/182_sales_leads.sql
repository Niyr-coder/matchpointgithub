-- 171 · sales_leads: capturas del formulario público "Hablar con ventas"
-- (reemplaza el mailto: en /precios, /soy-club, /soy-partner, /soy-coach).
-- Insertado vía endpoint público POST /api/v1/contact/sales con service-role
-- (sin auth.uid). El admin lo consulta desde el panel de ventas; no se expone
-- por API pública de lectura.
create table if not exists sales_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  lead_type text not null check (lead_type in ('club', 'partner', 'coach', 'other')),
  business_name text,
  message text,
  source_url text,
  ip text,
  user_agent text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_sales_leads_recent
  on sales_leads (occurred_at desc);
create index if not exists idx_sales_leads_lead_type
  on sales_leads (lead_type, occurred_at desc);

alter table sales_leads enable row level security;

-- Sin INSERT/SELECT abierto por RLS: el endpoint usa service-role para
-- escribir, y la lectura es admin-only via service-role hasta que exista
-- panel dedicado. Cuando se construya el panel, agregar policy:
--   create policy sl_admin_select on sales_leads for select using (mp_is_admin());

drop trigger if exists tg_audit_sales_leads on sales_leads;
create trigger tg_audit_sales_leads after insert or update or delete on sales_leads
  for each row execute function tg_audit();
